import { randomBytes } from 'node:crypto';
import { ccc } from '@ckb-ccc/ccc';
import { config } from '../config.js';

const privateKey = `0x${randomBytes(32).toString('hex')}`;
const client = new ccc.ClientPublicTestnet({ url: config.ckbRpcUrl });
const signer = new ccc.SignerCkbPrivateKey(client, privateKey);

const address = await signer.getRecommendedAddress();
const addressObj = await signer.getAddressObjSecp256k1();

console.log(
  JSON.stringify(
    {
      network: 'testnet',
      rpcUrl: config.ckbRpcUrl,
      privateKey,
      address,
      lockScript: addressObj.script,
      lockHash: addressObj.script.hash(),
      createdAt: new Date().toISOString(),
      warning: 'Store this securely. Use it as FAUCET_PRIVATE_KEY only after funding the hot wallet.',
    },
    null,
    2,
  ),
);
