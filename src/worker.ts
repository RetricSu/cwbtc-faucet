import { config } from './config.js';
import { getNextWorkClaim, markClaimStatus } from './db.js';
import { transferCwbtc } from './ckb/faucet.js';
import { waitForTransactionCommitted } from './ckb/rpc.js';

let running = false;
let stopped = false;
let timer: NodeJS.Timeout | undefined;

async function processOne(): Promise<void> {
  if (running || stopped || !config.workerEnabled || !config.faucetPrivateKey) return;
  const claim = getNextWorkClaim();
  if (!claim) return;

  running = true;
  try {
    if (claim.status === 'sent') {
      if (!claim.tx_hash) {
        markClaimStatus(claim.id, 'failed', null, 'Claim is marked sent without a tx hash');
        return;
      }
      await waitForTransactionCommitted(
        claim.tx_hash,
        config.txConfirmTimeoutMs,
        config.txConfirmPollMs,
      );
      markClaimStatus(claim.id, 'confirmed');
      return;
    }

    markClaimStatus(claim.id, 'processing');
    const txHash = await transferCwbtc(claim.address, BigInt(claim.amount_raw));
    markClaimStatus(claim.id, 'sent', txHash);

    await waitForTransactionCommitted(txHash, config.txConfirmTimeoutMs, config.txConfirmPollMs);
    markClaimStatus(claim.id, 'confirmed', txHash);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown worker error';
    markClaimStatus(claim.id, 'failed', claim.tx_hash, message);
    console.error(`[worker] claim ${claim.id} failed:`, message);
  } finally {
    running = false;
  }
}

function schedule(): void {
  timer = setTimeout(async () => {
    await processOne();
    if (!stopped) schedule();
  }, config.workerPollMs);
}

export function startWorker(): void {
  if (!config.workerEnabled) {
    console.warn('[worker] disabled by WORKER_ENABLED=false');
    return;
  }
  if (!config.faucetPrivateKey) {
    console.warn('[worker] FAUCET_PRIVATE_KEY is not set; claims will queue but not send');
  }
  schedule();
}

export function stopWorker(): void {
  stopped = true;
  if (timer) clearTimeout(timer);
}
