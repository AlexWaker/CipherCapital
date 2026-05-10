"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Wallet } from "lucide-react";

export default function WalletConnectButton({
  selectWalletLabel,
  switchNetworkLabel,
}: {
  selectWalletLabel: string;
  switchNetworkLabel: string;
}) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
        const ready = mounted;
        const connected = ready && account && chain;
        const label = !connected ? selectWalletLabel : chain.unsupported ? switchNetworkLabel : account.displayName;
        const onClick = !connected ? openConnectModal : chain.unsupported ? openChainModal : openAccountModal;

        return (
          <button
            className="inline-flex h-10 min-w-32 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-[#102033] transition hover:bg-[#eef3f8] disabled:opacity-60"
            disabled={!ready}
            onClick={onClick}
            type="button"
          >
            <Wallet size={17} />
            <span className="max-w-36 truncate">{label}</span>
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
