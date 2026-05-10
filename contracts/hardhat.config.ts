import { config as dotenvConfig } from "dotenv";
import "@fhevm/hardhat-plugin";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
import type { HardhatUserConfig } from "hardhat/config";

dotenvConfig();

const fallbackMnemonic = "test test test test test test test test test test test junk";
const sepoliaAccounts = process.env.PRIVATE_KEY
  ? [process.env.PRIVATE_KEY]
  : process.env.MNEMONIC
    ? { mnemonic: process.env.MNEMONIC }
    : [];

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  solidity: {
    version: "0.8.24",
    settings: {
      viaIR: true,
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 800,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      accounts: {
        mnemonic: fallbackMnemonic,
      },
    },
    localhost: {
      chainId: 31337,
      url: process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545",
    },
    sepolia: {
      chainId: 11155111,
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: sepoliaAccounts,
    },
  },
};

export default config;
