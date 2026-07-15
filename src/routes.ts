import { Router, type Request, type Response } from 'express';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { config } from './config.js';
import { adminSummary, getClaim, insertClaim } from './db.js';
import { formatCwbtc } from './format.js';
import { getFaucetBalances } from './ckb/faucet.js';
import {
  checkClaimEligibility,
  hashIp,
  normalizeAddress,
  requestIp,
  validateTestnetAddress,
  verifyTurnstile,
} from './security.js';

const router = Router();

const claimSchema = z.object({
  address: z.string().min(1),
  turnstileToken: z.string().optional(),
});

function claimResponse(id: string): Record<string, unknown> {
  const claim = getClaim(id);
  if (!claim) {
    return { found: false };
  }
  return {
    found: true,
    id: claim.id,
    address: claim.address,
    amount_raw: claim.amount_raw,
    amount_display: `${formatCwbtc(claim.amount_raw)} cWBTC`,
    status: claim.status,
    tx_hash: claim.tx_hash,
    error: claim.error,
    created_at: new Date(claim.created_at).toISOString(),
    updated_at: new Date(claim.updated_at).toISOString(),
    cooldown_until: new Date(claim.cooldown_until).toISOString(),
  };
}

router.get('/health', (_req, res) => {
  res.json({ ok: true });
});

router.get('/api/info', (_req, res) => {
  res.json({
    token: {
      symbol: config.cwbtc.symbol,
      decimals: config.cwbtc.decimals,
      type_script: config.cwbtc.typeScript,
      cell_dep: config.cwbtc.cellDep,
    },
    amount_raw: config.claimAmountRaw,
    amount_display: `${formatCwbtc(config.claimAmountRaw)} cWBTC`,
    address_cooldown_seconds: config.addressCooldownSeconds,
    ip_cooldown_seconds: config.ipCooldownSeconds,
    turnstile_required: config.requireTurnstile,
    turnstile_site_key: config.turnstileSiteKey || null,
  });
});

router.get('/api/balance', async (_req, res, next) => {
  try {
    const balances = await getFaucetBalances();
    res.json({
      ...balances,
      cwbtc_display: `${formatCwbtc(balances.cwbtcRaw)} cWBTC`,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/api/claims', async (req: Request, res: Response, next) => {
  try {
    if (!config.workerEnabled || !config.faucetPrivateKey) {
      res.status(503).json({
        ok: false,
        message: 'Faucet is not ready. The sender worker or hot wallet is not configured.',
      });
      return;
    }

    const parsed = claimSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Invalid request body' });
      return;
    }

    const address = normalizeAddress(parsed.data.address);
    const addressError = await validateTestnetAddress(address);
    if (addressError) {
      res.status(400).json({ ok: false, message: addressError });
      return;
    }

    const ip = requestIp(req);
    const turnstileError = await verifyTurnstile(parsed.data.turnstileToken, ip);
    if (turnstileError) {
      res.status(403).json({ ok: false, message: turnstileError });
      return;
    }

    const ipHash = hashIp(ip);
    const eligibilityError = checkClaimEligibility(address, ipHash);
    if (eligibilityError) {
      res.status(429).json({ ok: false, message: eligibilityError });
      return;
    }

    const now = Date.now();
    const id = nanoid(18);
    insertClaim({
      id,
      address,
      ip_hash: ipHash,
      amount_raw: config.claimAmountRaw,
      status: 'queued',
      user_agent: req.get('user-agent')?.slice(0, 512) ?? null,
      created_at: now,
      updated_at: now,
      cooldown_until: now + config.addressCooldownSeconds * 1000,
    });

    res.status(202).json({ ok: true, ...claimResponse(id) });
  } catch (err) {
    next(err);
  }
});

router.get('/api/claims/:id', (req, res) => {
  const response = claimResponse(req.params.id);
  if (!response.found) {
    res.status(404).json(response);
    return;
  }
  res.json(response);
});

router.get('/api/admin/summary', (req, res) => {
  if (!config.adminToken || req.get('authorization') !== `Bearer ${config.adminToken}`) {
    res.status(401).json({ ok: false, message: 'Unauthorized' });
    return;
  }
  res.json(adminSummary());
});

export default router;
