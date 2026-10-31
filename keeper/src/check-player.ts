// End-to-end check of a new player's first trade: starter purse in, swap out, fee paid in DUCAT.
import { mnemonicGenerate } from '@polkadot/util-crypto';
import { connect, keeperPair, pairFromUri, send, DUCAT, GOODS, POT, toUnits, fromUnits, withId } from './chain.js';

const api = await connect();
const keeper = keeperPair();
const player = pairFromUri(mnemonicGenerate(12));
const pot = async () => ((await api.query.system.account(player.address)) as any).data.free.toBigInt();
const asset = async (id: number) => {
  const a = (await api.query.assets.account(id, player.address)) as any;
  return a.isSome ? fromUnits(a.unwrap().balance.toBigInt()) : 0;
};

await send(api, api.tx.utility.batchAll([
  api.tx.balances.transferKeepAlive(player.address, POT / 5n),
  api.tx.assets.mint(DUCAT, player.address, toUnits(1000)),
]), keeper);
const before = { pot: await pot(), ducat: await asset(DUCAT) };
console.log('starter purse', Number(before.pot) / 1e14, 'tPOT,', before.ducat, 'DUCAT');

const coffee = GOODS[0].id;
const feeAsset = process.env.FEE_NATIVE ? undefined : DUCAT;
const res = await send(api, api.tx.assetConversion.swapExactTokensForTokens([withId(DUCAT), withId(coffee)], toUnits(100), 1, player.address, true), player, feeAsset);
const fee = res.events.find((e) => e.method === 'AssetTxFeePaid');
const after = { pot: await pot(), ducat: await asset(DUCAT), coffee: await asset(coffee) };
console.log('swap', res.hash, 'in', res.block);
console.log('fee event', JSON.stringify(fee?.data));
console.log('tPOT unchanged:', after.pot === before.pot, '| DUCAT', before.ducat, '->', after.ducat, '| COFFEE', after.coffee);
process.exit(0);
