export const CWBTC_DECIMALS = 100_000_000n;

export function formatCwbtc(rawAmount: string | bigint): string {
  const raw = typeof rawAmount === 'bigint' ? rawAmount : BigInt(rawAmount);
  const whole = raw / CWBTC_DECIMALS;
  const fraction = raw % CWBTC_DECIMALS;
  if (fraction === 0n) return whole.toString();
  return `${whole}.${fraction.toString().padStart(8, '0').replace(/0+$/, '')}`;
}

export function bigIntToHex(value: bigint): string {
  return `0x${value.toString(16)}`;
}
