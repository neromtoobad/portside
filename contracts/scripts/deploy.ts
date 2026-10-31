import { ethers } from 'hardhat';

async function main() {
  const harbour = await ethers.deployContract('Harbour');
  const receipt = await harbour.deploymentTransaction()!.wait();
  console.log(JSON.stringify({ harbour: await harbour.getAddress(), tx: receipt!.hash, block: receipt!.blockNumber }));
}
main().catch((e) => { console.error(e); process.exit(1); });
