import { CONTRACTS } from "./contracts";
import { toHex } from "viem";

type FhevmInstance = {
  createEncryptedInput: (contractAddress: string, userAddress: string) => {
    add64: (value: bigint | number) => void;
    add32: (value: bigint | number) => void;
    encrypt: () => Promise<{ handles: readonly Uint8Array[]; inputProof: Uint8Array }>;
  };
  publicDecrypt: (
    handles: (string | Uint8Array)[],
    options?: { timeout?: number },
  ) => Promise<{ clearValues: Readonly<Record<`0x${string}`, bigint | boolean | `0x${string}`>> }>;
};

let instancePromise: Promise<FhevmInstance> | null = null;

export async function getFhevmInstance(): Promise<FhevmInstance> {
  if (typeof window === "undefined") {
    throw new Error("FHEVM SDK must run in the browser");
  }

  if (!CONTRACTS.profile) {
    throw new Error("NEXT_PUBLIC_PROFILE_CONTRACT is not configured");
  }

  instancePromise ??= (async () => {
    const { initSDK, createInstance, SepoliaConfig } = await import("@zama-fhe/relayer-sdk/web");
    await initSDK();

    return (await createInstance({
      ...SepoliaConfig,
      network: window.ethereum as Parameters<typeof createInstance>[0]["network"],
    })) as unknown as FhevmInstance;
  })();

  return instancePromise;
}

export async function encryptCreditProfile(params: {
  userAddress: string;
  assets: number;
  liabilities: number;
  monthlyRevenue: number;
  monthlyBurn: number;
  repaymentCount: number;
  overdueCount: number;
}) {
  if (!CONTRACTS.profile) {
    throw new Error("Profile contract address missing");
  }

  const fhevm = await getFhevmInstance();
  const input = fhevm.createEncryptedInput(CONTRACTS.profile, params.userAddress);

  input.add64(BigInt(params.assets));
  input.add64(BigInt(params.liabilities));
  input.add64(BigInt(params.monthlyRevenue));
  input.add64(BigInt(params.monthlyBurn));
  input.add32(BigInt(params.repaymentCount));
  input.add32(BigInt(params.overdueCount));

  const encrypted = await input.encrypt();

  return {
    handles: encrypted.handles.map((handle) => toHex(handle)),
    inputProof: toHex(encrypted.inputProof),
  };
}

export async function publicDecryptHandles(handles: readonly `0x${string}`[]) {
  if (handles.length === 0) {
    return {};
  }

  const fhevm = await getFhevmInstance();
  const decrypted = await fhevm.publicDecrypt([...handles], { timeout: 120_000 });

  return decrypted.clearValues;
}
