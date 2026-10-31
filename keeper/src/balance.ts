// Prints the keeper's native balance on the configured chain, read over HTTPS.
import { ApiPromise, HttpProvider } from '@polkadot/api';
import { keeperPair } from './chain.js';
const api = await ApiPromise.create({ provider: new HttpProvider(process.env.CHAIN_HTTP ?? 'https://test-node-v3.portaldot.dev'), noInitWarn: true });
const k = keeperPair();
const a = (await api.query.system.account(k.address)) as any;
console.log(k.address, Number(a.data.free.toBigInt()) / 1e14, 'tPOT');
process.exit(0);
