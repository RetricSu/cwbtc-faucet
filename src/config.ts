import 'dotenv/config';

type HashType = 'type' | 'data' | 'data1' | 'data2';

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number`);
  }
  return parsed;
}

function booleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function listEnv(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function privateKeyEnv(): string {
  const raw = process.env.FAUCET_PRIVATE_KEY?.trim() ?? '';
  if (!raw) return '';
  return raw.startsWith('0x') ? raw : `0x${raw}`;
}

export const config = {
  port: numberEnv('PORT', 3008),
  host: process.env.HOST ?? '0.0.0.0',
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:3008',
  corsOrigin: listEnv('CORS_ORIGIN', ['http://localhost:3008']),
  trustProxyHops: numberEnv('TRUST_PROXY_HOPS', 1),

  ckbRpcUrl: process.env.CKB_RPC_URL ?? 'https://testnet.ckbapp.dev/',
  faucetPrivateKey: privateKeyEnv(),

  claimAmountRaw: process.env.CLAIM_AMOUNT_RAW ?? '10000000000',
  addressCooldownSeconds: numberEnv('ADDRESS_COOLDOWN_SECONDS', 86400),
  ipCooldownSeconds: numberEnv('IP_COOLDOWN_SECONDS', 3600),
  addressDailyClaimLimit: numberEnv('ADDRESS_DAILY_CLAIM_LIMIT', 1),
  ipDailyClaimLimit: numberEnv('IP_DAILY_CLAIM_LIMIT', 5),
  globalDailyClaimLimit: numberEnv('GLOBAL_DAILY_CLAIM_LIMIT', 200),

  databasePath: process.env.DATABASE_PATH ?? './data/faucet.sqlite',
  ipHashSalt: process.env.IP_HASH_SALT ?? 'local-dev-salt-change-me',

  workerEnabled: booleanEnv('WORKER_ENABLED', true),
  workerPollMs: numberEnv('WORKER_POLL_MS', 3000),
  txConfirmTimeoutMs: numberEnv('TX_CONFIRM_TIMEOUT_MS', 180000),
  txConfirmPollMs: numberEnv('TX_CONFIRM_POLL_MS', 3000),

  requireTurnstile: booleanEnv('REQUIRE_TURNSTILE', false),
  turnstileSiteKey: process.env.TURNSTILE_SITE_KEY ?? '',
  turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY ?? '',
  turnstileVerifyUrl:
    process.env.TURNSTILE_VERIFY_URL ?? 'https://challenges.cloudflare.com/turnstile/v0/siteverify',

  adminToken: process.env.ADMIN_TOKEN ?? '',

  cwbtc: {
    symbol: 'cWBTC',
    decimals: 8,
    typeScript: {
      codeHash: '0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb',
      hashType: 'type' as HashType,
      args: '0x9a1086531ed6dc69e0bd44cef5278e03faf3015b31aff60b08fb87663ce8507100000000',
    },
    cellDep: {
      outPoint: {
        txHash: '0xbf6fb538763efec2a70a6a3dcb7242787087e1030c4e7d86585bc63a9d337f5f',
        index: '0x0',
      },
      depType: 'code' as const,
    },
  },
};

export type AppConfig = typeof config;
