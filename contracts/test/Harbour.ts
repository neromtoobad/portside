import { expect } from 'chai';
import { ethers } from 'hardhat';

const seed = (n: number) => ethers.zeroPadValue(ethers.toBeHex(n), 32);
const commitOf = (s: string) => ethers.keccak256(s);

describe('Harbour', () => {
  async function opened() {
    const [keeper, player] = await ethers.getSigners();
    const harbour = await ethers.deployContract('Harbour');
    await harbour.openSeason(commitOf(seed(1)));
    return { harbour, keeper, player };
  }

  it('opens a season with a commit', async () => {
    const { harbour } = await opened();
    expect(await harbour.season()).to.equal(1);
    expect(await harbour.commit()).to.equal(commitOf(seed(1)));
  });

  it('reveals the committed seed and emits a valid event', async () => {
    const { harbour } = await opened();
    const tx = await harbour.reveal(seed(1), commitOf(seed(2)));
    const log = (await tx.wait())!.logs.map((l) => harbour.interface.parseLog(l)!).find((l) => l.name === 'RoundOpened')!;
    const [season, round, good, kind, magnitude] = log.args;
    expect(season).to.equal(1);
    expect(round).to.equal(1);
    expect(good).to.be.lessThan(5);
    expect(kind).to.be.lessThan(6);
    if (kind === 5n) expect(magnitude).to.equal(0);
    else expect(magnitude).to.be.within(5, 29);
    expect(await harbour.commit()).to.equal(commitOf(seed(2)));
  });

  it('rejects a seed that does not match the commit', async () => {
    const { harbour } = await opened();
    await expect(harbour.reveal(seed(9), commitOf(seed(2)))).to.be.revertedWithCustomError(harbour, 'BadReveal');
  });

  it('only lets the keeper drive the clock', async () => {
    const { harbour, player } = await opened();
    await expect(harbour.connect(player).reveal(seed(1), commitOf(seed(2)))).to.be.revertedWithCustomError(harbour, 'NotKeeper');
    await expect(harbour.connect(player).anchorDay(1, ethers.ZeroHash, 0)).to.be.revertedWithCustomError(harbour, 'NotKeeper');
  });

  it('covers every good and kind across many draws', async () => {
    const { harbour } = await opened();
    const goods = new Set<bigint>(), kinds = new Set<bigint>();
    for (let i = 0; i < 300; i++) {
      const [g, k] = await harbour.drawEvent(ethers.keccak256(seed(i)));
      goods.add(g); kinds.add(k);
    }
    expect(goods.size).to.equal(5);
    expect(kinds.size).to.equal(6);
  });

  it('anchors a day root', async () => {
    const { harbour } = await opened();
    const root = ethers.keccak256('0x1234');
    await expect(harbour.anchorDay(1, root, 12)).to.emit(harbour, 'DayAnchored').withArgs(1, 1, root, 12);
  });
});
