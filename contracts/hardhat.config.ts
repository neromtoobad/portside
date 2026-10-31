import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-ethers';
import '@nomicfoundation/hardhat-chai-matchers';
import 'dotenv/config';

const config: HardhatUserConfig = {
  solidity: { version: '0.8.28', settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun' } },
  networks: {
    portaldot: {
      url: process.env.PORTALDOT_EVM_RPC ?? 'https://test-evm-rpc-v3.portaldot.dev',
      chainId: 420420777,
      accounts: process.env.KEEPER_EVM_KEY ? [process.env.KEEPER_EVM_KEY] : [],
    },
  },
};
export default config;
