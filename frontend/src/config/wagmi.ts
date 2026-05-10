"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { injectedWallet, metaMaskWallet, okxWallet, rabbyWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { http } from "wagmi";
import { hardhat, sepolia } from "wagmi/chains";

const chains = [sepolia, hardhat] as const;
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "ciphercapital-demo";

export function createWagmiConfig() {
  return getDefaultConfig({
    appName: "CipherCapital",
    appDescription: "Confidential credit infrastructure powered by Zama FHE.",
    appUrl: "http://localhost:3000",
    projectId,
    chains,
    wallets: [
      {
        groupName: "Recommended",
        wallets: [metaMaskWallet, okxWallet, rabbyWallet, injectedWallet],
      },
      {
        groupName: "WalletConnect",
        wallets: [walletConnectWallet],
      },
    ],
    ssr: true,
    transports: {
      [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL),
      [hardhat.id]: http(process.env.NEXT_PUBLIC_LOCAL_RPC_URL || "http://127.0.0.1:8545"),
    },
  });
}
