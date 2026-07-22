import { ccc } from '@ckb-ccc/ccc';
import { config } from '../config.js';
import { parseUdtAmount } from './amount.js';
import { collectCellsByLock } from './rpc.js';
import { sameScript, sameScriptType } from './script.js';
import type { LiveCell, Script } from './types.js';

const WBTC_TYPE_SCRIPT: Script = config.cwbtc.typeScript;
const UDT_CELL_CAPACITY = 200_0000_0000n;

interface WbtcCell extends LiveCell {
  amount: bigint;
}

function getClient(): ccc.Client {
  return new ccc.ClientPublicTestnet({ url: config.ckbRpcUrl });
}

function faucetPrivateKey(): string {
  if (!config.faucetPrivateKey) {
    throw new Error('Faucet hot wallet is not configured: FAUCET_PRIVATE_KEY_FILE or FAUCET_PRIVATE_KEY is missing');
  }
  return config.faucetPrivateKey;
}

export async function getFaucetAddress(): Promise<string | null> {
  if (!config.faucetPrivateKey) return null;
  const signer = new ccc.SignerCkbPrivateKey(getClient(), config.faucetPrivateKey);
  return signer.getRecommendedAddress();
}

export async function getFaucetLockScript(): Promise<Script> {
  const signer = new ccc.SignerCkbPrivateKey(getClient(), faucetPrivateKey());
  return (await signer.getAddressObjSecp256k1()).script;
}

async function collectWbtcCells(faucetLockScript: Script): Promise<WbtcCell[]> {
  const cells = await collectCellsByLock(faucetLockScript, WBTC_TYPE_SCRIPT);
  return cells.map((cell) => ({ ...cell, amount: parseUdtAmount(cell.outputData) }));
}

async function collectPlainCkbCells(faucetLockScript: Script): Promise<LiveCell[]> {
  const cells = await collectCellsByLock(faucetLockScript, null);
  return cells.filter((cell) => sameScript(cell.output.lock, faucetLockScript) && cell.output.type === null);
}

export async function getFaucetBalances(): Promise<{
  configured: boolean;
  address: string | null;
  cwbtcRaw: string;
  totalCapacityShannons: string;
  plainCapacityShannons: string;
  estimatedClaimsByCwbtc: number;
  estimatedClaimsByCapacity: number;
}> {
  const address = await getFaucetAddress();
  if (!address) {
    return {
      configured: false,
      address: null,
      cwbtcRaw: '0',
      totalCapacityShannons: '0',
      plainCapacityShannons: '0',
      estimatedClaimsByCwbtc: 0,
      estimatedClaimsByCapacity: 0,
    };
  }

  const lock = await getFaucetLockScript();
  const allCells = await collectCellsByLock(lock);
  const wbtcCells = await collectWbtcCells(lock);
  const plainCells = await collectPlainCkbCells(lock);
  const cwbtcRaw = wbtcCells.reduce((sum, cell) => sum + cell.amount, 0n);
  const totalCapacity = allCells.reduce((sum, cell) => sum + BigInt(cell.output.capacity), 0n);
  const plainCapacity = plainCells.reduce((sum, cell) => sum + BigInt(cell.output.capacity), 0n);
  const claimAmount = BigInt(config.claimAmountRaw);

  return {
    configured: true,
    address,
    cwbtcRaw: cwbtcRaw.toString(),
    totalCapacityShannons: totalCapacity.toString(),
    plainCapacityShannons: plainCapacity.toString(),
    estimatedClaimsByCwbtc: claimAmount > 0n ? Number(cwbtcRaw / claimAmount) : 0,
    estimatedClaimsByCapacity: Number(totalCapacity / UDT_CELL_CAPACITY),
  };
}

export async function transferCwbtc(recipientAddress: string, amountRaw: bigint): Promise<string> {
  const privateKey = faucetPrivateKey();
  const client = getClient();
  const signer = new ccc.SignerCkbPrivateKey(client, privateKey);
  const faucetLockScript = (await signer.getAddressObjSecp256k1()).script;
  const recipientLock = (await ccc.Address.fromString(recipientAddress, client)).script;

  if (!sameScriptType(recipientLock, faucetLockScript)) {
    throw new Error('Recipient must be a CKB testnet secp256k1 address');
  }

  const typeScript = await ccc.Script.fromKnownScript(
    client,
    ccc.KnownScript.XUdt,
    WBTC_TYPE_SCRIPT.args,
  );
  const tx = ccc.Transaction.from({});
  tx.addOutput(
    {
      capacity: UDT_CELL_CAPACITY,
      lock: recipientLock,
      type: typeScript,
    },
    ccc.numLeToBytes(amountRaw, 16),
  );

  await tx.addCellDepsOfKnownScripts(client, ccc.KnownScript.XUdt);
  await tx.completeInputsByUdt(signer, typeScript);

  const inputRaw = await tx.getInputsUdtBalance(client, typeScript);
  const changeRaw = inputRaw - amountRaw;
  if (changeRaw < 0n) {
    throw new Error(`Insufficient cWBTC: have ${inputRaw.toString()}, need ${amountRaw.toString()}`);
  }
  if (changeRaw > 0n) {
    tx.addOutput(
      {
        capacity: UDT_CELL_CAPACITY,
        lock: faucetLockScript,
        type: typeScript,
      },
      ccc.numLeToBytes(changeRaw, 16),
    );
  }

  await tx.completeFeeChangeToLock(signer, faucetLockScript, 2000);
  return signer.sendTransaction(tx);
}
