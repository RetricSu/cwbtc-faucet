import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { ccc } from '@ckb-ccc/ccc';
import { config } from './config.js';
import { countClaims, hasActiveClaim, latestClaimForAddress } from './db.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

export async function validateTestnetAddress(address: string): Promise<string | null> {
  if (!address.startsWith('ckt1')) {
    return 'Address must be a CKB testnet address starting with ckt1';
  }

  try {
    const client = new ccc.ClientPublicTestnet({ url: config.ckbRpcUrl });
    await ccc.Address.fromString(address, client);
    return null;
  } catch {
    return 'Invalid CKB testnet address';
  }
}

export function requestIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function hashIp(ip: string): string {
  return createHash('sha256').update(`${config.ipHashSalt}:${ip}`).digest('hex');
}

export function checkClaimEligibility(address: string, ipHash: string): string | null {
  const now = Date.now();
  const dayAgo = now - DAY_MS;

  if (hasActiveClaim(address)) {
    return 'This address already has a pending claim';
  }

  const latest = latestClaimForAddress(address);
  if (latest && latest.cooldown_until > now) {
    const seconds = Math.ceil((latest.cooldown_until - now) / 1000);
    return `This address can claim again in ${seconds}s`;
  }

  const ipCooldownCount = countClaims('ip_hash = ? AND created_at >= ?', [
    ipHash,
    now - config.ipCooldownSeconds * 1000,
  ]);
  if (ipCooldownCount > 0) {
    return `This network can claim again after the IP cooldown`;
  }

  const addressDailyCount = countClaims('address = ? AND created_at >= ?', [address, dayAgo]);
  if (addressDailyCount >= config.addressDailyClaimLimit) {
    return 'This address has reached the daily claim limit';
  }

  const ipDailyCount = countClaims('ip_hash = ? AND created_at >= ?', [ipHash, dayAgo]);
  if (ipDailyCount >= config.ipDailyClaimLimit) {
    return 'This network has reached the daily claim limit';
  }

  const globalDailyCount = countClaims('created_at >= ?', [dayAgo]);
  if (globalDailyCount >= config.globalDailyClaimLimit) {
    return 'The faucet has reached the global daily claim limit';
  }

  return null;
}

export async function verifyTurnstile(token: string | undefined, ip: string): Promise<string | null> {
  if (!config.requireTurnstile) return null;
  if (!config.turnstileSecretKey) {
    return 'Turnstile is required but TURNSTILE_SECRET_KEY is not configured';
  }
  if (!token) {
    return 'Complete the verification challenge';
  }

  const body = new URLSearchParams({
    secret: config.turnstileSecretKey,
    response: token,
    remoteip: ip,
  });
  const res = await fetch(config.turnstileVerifyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    return `Turnstile verification failed with HTTP ${res.status}`;
  }
  const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
  if (!data.success) {
    return `Turnstile verification failed: ${(data['error-codes'] ?? ['unknown']).join(', ')}`;
  }
  return null;
}
