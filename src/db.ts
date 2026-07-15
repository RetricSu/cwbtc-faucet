import Database from 'better-sqlite3';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { config } from './config.js';

export type ClaimStatus = 'queued' | 'processing' | 'sent' | 'confirmed' | 'failed';

export interface ClaimRow {
  id: string;
  address: string;
  ip_hash: string;
  amount_raw: string;
  status: ClaimStatus;
  tx_hash: string | null;
  error: string | null;
  user_agent: string | null;
  created_at: number;
  updated_at: number;
  cooldown_until: number;
}

mkdirSync(dirname(config.databasePath), { recursive: true });

export const db = new Database(config.databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  amount_raw TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'sent', 'confirmed', 'failed')),
  tx_hash TEXT,
  error TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  cooldown_until INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_claims_address_created ON claims(address, created_at);
CREATE INDEX IF NOT EXISTS idx_claims_ip_created ON claims(ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_claims_status_created ON claims(status, created_at);
CREATE INDEX IF NOT EXISTS idx_claims_tx_hash ON claims(tx_hash);
`);

const insertClaimStmt = db.prepare(`
INSERT INTO claims (
  id, address, ip_hash, amount_raw, status, tx_hash, error, user_agent,
  created_at, updated_at, cooldown_until
) VALUES (
  @id, @address, @ip_hash, @amount_raw, @status, NULL, NULL, @user_agent,
  @created_at, @updated_at, @cooldown_until
)
`);

const getClaimStmt = db.prepare<string>('SELECT * FROM claims WHERE id = ?');
const nextSentStmt = db.prepare("SELECT * FROM claims WHERE status = 'sent' ORDER BY updated_at ASC LIMIT 1");
const nextQueuedStmt = db.prepare("SELECT * FROM claims WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1");
const updateStatusStmt = db.prepare(`
UPDATE claims
SET status = @status, tx_hash = COALESCE(@tx_hash, tx_hash), error = @error, updated_at = @updated_at
WHERE id = @id
`);

export function insertClaim(row: Omit<ClaimRow, 'tx_hash' | 'error'>): void {
  insertClaimStmt.run(row);
}

export function getClaim(id: string): ClaimRow | undefined {
  return getClaimStmt.get(id) as ClaimRow | undefined;
}

export function getNextWorkClaim(): ClaimRow | undefined {
  return (nextSentStmt.get() as ClaimRow | undefined) ?? (nextQueuedStmt.get() as ClaimRow | undefined);
}

export function markClaimStatus(
  id: string,
  status: ClaimStatus,
  txHash: string | null = null,
  error: string | null = null,
): void {
  updateStatusStmt.run({
    id,
    status,
    tx_hash: txHash,
    error,
    updated_at: Date.now(),
  });
}

export function countClaims(whereSql: string, params: unknown[]): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM claims WHERE ${whereSql}`).get(...params) as
    | { count: number }
    | undefined;
  return row?.count ?? 0;
}

export function hasActiveClaim(address: string): boolean {
  return (
    countClaims("address = ? AND status IN ('queued', 'processing', 'sent')", [address]) > 0
  );
}

export function latestClaimForAddress(address: string): ClaimRow | undefined {
  return db
    .prepare('SELECT * FROM claims WHERE address = ? ORDER BY created_at DESC LIMIT 1')
    .get(address) as ClaimRow | undefined;
}

export function adminSummary(): Record<string, unknown> {
  const byStatus = db
    .prepare('SELECT status, COUNT(*) AS count FROM claims GROUP BY status ORDER BY status')
    .all() as Array<{ status: string; count: number }>;
  const lastClaims = db
    .prepare(
      `SELECT id, address, amount_raw, status, tx_hash, error, created_at, updated_at
       FROM claims ORDER BY created_at DESC LIMIT 20`,
    )
    .all();
  return { byStatus, lastClaims };
}
