import assert from 'node:assert/strict';
import test from 'node:test';
import { sameScript, sameScriptType } from './script.js';
import type { Script } from './types.js';

const faucetLock: Script = {
  codeHash: '0x01',
  hashType: 'type',
  args: '0xaaaa',
};

test('sameScriptType accepts another account using the same lock type', () => {
  const recipientLock: Script = { ...faucetLock, args: '0xbbbb' };

  assert.equal(sameScriptType(recipientLock, faucetLock), true);
  assert.equal(sameScript(recipientLock, faucetLock), false);
});

test('sameScriptType rejects a different lock code or hash type', () => {
  assert.equal(sameScriptType({ ...faucetLock, codeHash: '0x02' }, faucetLock), false);
  assert.equal(sameScriptType({ ...faucetLock, hashType: 'data1' }, faucetLock), false);
});
