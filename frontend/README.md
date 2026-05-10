# CipherCapital Frontend

Next.js dashboard for the CipherCapital confidential credit demo.

## Environment

Copy `.env.example` to `.env.local` and fill the contract addresses printed by `contracts/scripts/deploy.ts`.

```bash
NEXT_PUBLIC_SEPOLIA_RPC_URL=https://...
NEXT_PUBLIC_PROFILE_CONTRACT=0x...
NEXT_PUBLIC_SCORE_ENGINE_CONTRACT=0x...
NEXT_PUBLIC_LOAN_VAULT_CONTRACT=0x...
```

## Commands

```bash
npm install
npm run lint
npm run build
npm run dev
```

The production path is Sepolia with Zama Relayer SDK encryption and public decryption. If contract addresses are empty, the UI stays in preview mode for layout and demo rehearsal.
