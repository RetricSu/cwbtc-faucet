export function parseUdtAmount(dataHex: string): bigint {
  if (!dataHex || dataHex === '0x') return 0n;
  const raw = dataHex.startsWith('0x') ? dataHex.slice(2) : dataHex;
  const buf = Buffer.from(raw, 'hex');
  let amount = 0n;
  for (let i = buf.length - 1; i >= 0; i -= 1) {
    amount = (amount << 8n) | BigInt(buf[i]);
  }
  return amount;
}

export function packUdtAmount(amount: bigint): string {
  if (amount < 0n) throw new Error('UDT amount cannot be negative');
  const buf = Buffer.alloc(16);
  let remaining = amount;
  for (let i = 0; i < 16 && remaining > 0n; i += 1) {
    buf[i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  if (remaining > 0n) {
    throw new Error('UDT amount exceeds uint128');
  }
  return `0x${buf.toString('hex')}`;
}
