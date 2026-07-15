import { config } from '../config.js';
import type { HashType, LiveCell, Script } from './types.js';

interface RpcResponse<T> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

interface RpcCellOutput {
  capacity: string;
  lock: { code_hash: string; hash_type: string; args: string };
  type: { code_hash: string; hash_type: string; args: string } | null;
}

interface RpcLiveCell {
  out_point: { tx_hash: string; index: string };
  output: RpcCellOutput;
  output_data: string;
  block_number: string;
}

interface GetCellsResult {
  objects: RpcLiveCell[];
  last_cursor: string;
}

export function toRpcScript(script: Script): { code_hash: string; hash_type: string; args: string } {
  return {
    code_hash: script.codeHash,
    hash_type: script.hashType,
    args: script.args,
  };
}

function mapRpcCell(raw: RpcLiveCell): LiveCell {
  return {
    outPoint: {
      txHash: raw.out_point.tx_hash,
      index: raw.out_point.index,
    },
    output: {
      capacity: raw.output.capacity,
      lock: {
        codeHash: raw.output.lock.code_hash,
        hashType: raw.output.lock.hash_type as HashType,
        args: raw.output.lock.args,
      },
      type: raw.output.type
        ? {
            codeHash: raw.output.type.code_hash,
            hashType: raw.output.type.hash_type as HashType,
            args: raw.output.type.args,
          }
        : null,
    },
    outputData: raw.output_data,
    blockNumber: raw.block_number,
  };
}

export async function ckbRpc<T>(method: string, params: unknown[]): Promise<T> {
  const body = { jsonrpc: '2.0' as const, id: 1, method, params };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(config.ckbRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`CKB RPC HTTP ${res.status}: ${res.statusText}`);
    }

    const data = (await res.json()) as RpcResponse<T>;
    if (data.error) {
      throw new Error(`CKB RPC error [${data.error.code}]: ${data.error.message}`);
    }
    if (data.result === undefined) {
      throw new Error('CKB RPC returned undefined result');
    }
    return data.result;
  } finally {
    clearTimeout(timeout);
  }
}

export async function collectCellsByLock(lock: Script, typeScript?: Script | null): Promise<LiveCell[]> {
  const cells: LiveCell[] = [];
  let cursor: string | undefined;

  for (;;) {
    const searchKey: Record<string, unknown> = {
      script: toRpcScript(lock),
      script_type: 'lock',
      script_search_mode: 'exact',
    };
    if (typeScript !== undefined) {
      searchKey.filter = typeScript === null ? { script_len_range: ['0x0', '0x1'] } : { script: toRpcScript(typeScript) };
    }

    const params = [searchKey, 'asc', '0x64'];
    if (cursor) params.push(cursor);

    const result = await ckbRpc<GetCellsResult>('get_cells', params);
    cells.push(...result.objects.map(mapRpcCell));
    if (result.objects.length < 100 || result.last_cursor === cursor) break;
    cursor = result.last_cursor;
  }

  return cells;
}

export async function waitForTransactionCommitted(
  txHash: string,
  timeoutMs: number,
  pollMs: number,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await ckbRpc<{ tx_status: { status: string; reason?: string } } | null>('get_transaction', [
      txHash,
    ]);
    const status = result?.tx_status.status;
    if (status === 'committed') return;
    if (status === 'rejected') {
      throw new Error(`CKB transaction rejected: ${result?.tx_status.reason ?? txHash}`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`Timed out waiting for CKB transaction to commit: ${txHash}`);
}
