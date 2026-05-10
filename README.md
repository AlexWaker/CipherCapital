# CipherCapital

CipherCapital is a confidential credit infrastructure demo for the OpenBuild Zama bounty. It lets a borrower submit encrypted financial data, compute solvency and creditworthiness with Zama FHE, request a mockUSDC credit line, and grant auditor access without publishing raw assets, liabilities, revenue, burn, or repayment history.

## Product Flow

```text
Encrypted financial profile
        -> confidential solvency verification
        -> confidential credit tier and max line
        -> private credit vault decision
        -> consent-based auditor access
```

Public users can see only the outcome handles and decrypted public results:

```text
Solvency: Verified
Credit Tier: A
Max Credit Line: 50,000 mockUSDC
Risk Band: Low
```

Raw financial fields remain encrypted onchain and are only decryptable by the borrower or an explicitly authorized auditor.

## Architecture

- `contracts/contracts/ConfidentialCreditProfile.sol` stores encrypted financial fields and manages ACL permissions for borrower, protocol contracts, and auditors.
- `contracts/contracts/SilentScoreEngine.sol` computes encrypted solvency, reserve status, runway tier, credit tier, risk band, auditor requirement, and max credit line.
- `contracts/contracts/PrivateLoanVault.sol` checks requested credit against the encrypted limit and records an encrypted/public-decryptable decision plus issued mock amount.
- `frontend/` is a Next.js dashboard using wagmi, viem, lucide-react, and the Zama Relayer SDK.

## Risk Model

Encrypted inputs:

```text
assets
liabilities
monthlyRevenue
monthlyBurn
repaymentCount
overdueCount
```

Main checks:

```text
healthyReserve = assets * 10 >= (liabilities + overdueCount * 1000) * 12
reserveCoversDebt = assets >= liabilities
revenueHealthy = monthlyRevenue * 10 >= monthlyBurn * 6
runwayTier = assets >= monthlyBurn * 6 ? 3 : assets >= monthlyBurn * 3 ? 2 : 1
```

Credit tiers:

```text
Tier A: healthy reserve, healthy revenue, 6+ months runway, seasoned repayment, <= 1 overdue
Tier B: healthy reserve, healthy revenue or 3+ months runway, <= 5 overdues
Tier C: reserve covers debt, <= 7 overdues
Rejected: otherwise
```

Credit lines:

```text
A -> 50,000 mockUSDC
B -> 20,000 mockUSDC
C -> 5,000 mockUSDC
Rejected -> 0
```

## Local Verification

Install and test contracts:

```bash
cd contracts
npm install
npm run compile
npm test
```

The test suite uses Zama's Hardhat mock FHEVM mode and covers:

- encrypted profile submission
- Tier A/B/C risk computation
- public decryption of public outcomes
- loan approval and over-limit rejection
- auditor user-decryption access to raw encrypted fields

Build the frontend:

```bash
cd frontend
npm install
npm run lint
npm run build
```

## Sepolia Deployment

Create `contracts/.env` from `contracts/.env.example`:

```bash
SEPOLIA_RPC_URL=https://...
PRIVATE_KEY=0x...
```

Deploy:

```bash
cd contracts
npm run deploy:sepolia
```

Copy the printed addresses into `frontend/.env.local`:

```bash
NEXT_PUBLIC_PROFILE_CONTRACT=0x...
NEXT_PUBLIC_SCORE_ENGINE_CONTRACT=0x...
NEXT_PUBLIC_LOAN_VAULT_CONTRACT=0x...
NEXT_PUBLIC_SEPOLIA_RPC_URL=https://...
```

Run the dApp:

```bash
cd frontend
npm run dev
```

## Demo Script

### 0:00 - 0:20

Onchain lending is usually overcollateralized or fully transparent. Real borrowers do not want to reveal cash reserves, liabilities, revenue, burn, and repayment history just to prove they are creditworthy.

### 0:20 - 0:45

CipherCapital uses Zama FHE to compute solvency and creditworthiness directly on encrypted financial data. The chain stores ciphertext handles, while the public only sees risk outcomes.

### 0:45 - 1:25

Submit the encrypted profile, compute the risk profile, show Tier A and a 50,000 mockUSDC max line, then request a 10,000 mockUSDC credit line.

### 1:25 - 1:50

Show the auditor portal. A borrower can grant an auditor user-decryption access to raw encrypted fields for consent-based compliance review.

### 1:50 - 2:00

CipherCapital makes confidential credit possible on public blockchains: private for borrowers, useful for lenders, and auditable for compliance.
# CipherCapital
