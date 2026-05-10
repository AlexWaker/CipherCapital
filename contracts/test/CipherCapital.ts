import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

type ProfileInput = {
  assets: number;
  liabilities: number;
  monthlyRevenue: number;
  monthlyBurn: number;
  repaymentCount: number;
  overdueCount: number;
};

type Fixture = {
  owner: HardhatEthersSigner;
  borrower: HardhatEthersSigner;
  auditor: HardhatEthersSigner;
  profile: any;
  scoreEngine: any;
  loanVault: any;
  profileAddress: string;
  scoreEngineAddress: string;
  loanVaultAddress: string;
};

const tierAProfile: ProfileInput = {
  assets: 50_000,
  liabilities: 20_000,
  monthlyRevenue: 12_000,
  monthlyBurn: 3_000,
  repaymentCount: 12,
  overdueCount: 0,
};

async function deployFixture(): Promise<Fixture> {
  const [owner, borrower, auditor] = await ethers.getSigners();

  const Profile = await ethers.getContractFactory("ConfidentialCreditProfile");
  const profile = await Profile.deploy();
  await profile.waitForDeployment();
  const profileAddress = await profile.getAddress();

  const ScoreEngine = await ethers.getContractFactory("SilentScoreEngine");
  const scoreEngine = await ScoreEngine.deploy(profileAddress);
  await scoreEngine.waitForDeployment();
  const scoreEngineAddress = await scoreEngine.getAddress();

  const LoanVault = await ethers.getContractFactory("PrivateLoanVault");
  const loanVault = await LoanVault.deploy(scoreEngineAddress);
  await loanVault.waitForDeployment();
  const loanVaultAddress = await loanVault.getAddress();

  await (await profile.setProtocolContracts(scoreEngineAddress, loanVaultAddress)).wait();
  await (await profile.setApprovedAuditor(auditor.address, true)).wait();

  return {
    owner,
    borrower,
    auditor,
    profile,
    scoreEngine,
    loanVault,
    profileAddress,
    scoreEngineAddress,
    loanVaultAddress,
  };
}

async function submitAuditorAttestation(fixture: Fixture, overrides?: { auditor?: HardhatEthersSigner; expiresAt?: number; verificationTier?: number }) {
  const storedProfile = await fixture.profile.getProfile(fixture.borrower.address);
  const network = await ethers.provider.getNetwork();
  const latestBlock = await ethers.provider.getBlock("latest");
  const expiresAt = overrides?.expiresAt ?? Number(latestBlock?.timestamp ?? 0) + 30 * 24 * 60 * 60;
  const verificationTier = overrides?.verificationTier ?? 2;
  const evidenceHash = ethers.id("mock-auditor-report");
  const auditor = overrides?.auditor ?? fixture.auditor;

  const signature = await auditor.signTypedData(
    {
      name: "CipherCapitalAttestation",
      version: "1",
      chainId: network.chainId,
      verifyingContract: fixture.profileAddress,
    },
    {
      FinancialProfileAttestation: [
        { name: "borrower", type: "address" },
        { name: "profileVersion", type: "uint32" },
        { name: "verificationTier", type: "uint8" },
        { name: "expiresAt", type: "uint64" },
        { name: "evidenceHash", type: "bytes32" },
      ],
    },
    {
      borrower: fixture.borrower.address,
      profileVersion: storedProfile.version,
      verificationTier,
      expiresAt,
      evidenceHash,
    },
  );

  await (
    await fixture.profile.connect(fixture.borrower).submitAttestation(verificationTier, expiresAt, evidenceHash, signature)
  ).wait();
}

async function submitEncryptedProfile(fixture: Fixture, input: ProfileInput) {
  const encrypted = await fhevm
    .createEncryptedInput(fixture.profileAddress, fixture.borrower.address)
    .add64(input.assets)
    .add64(input.liabilities)
    .add64(input.monthlyRevenue)
    .add64(input.monthlyBurn)
    .add32(input.repaymentCount)
    .add32(input.overdueCount)
    .encrypt();

  await (
    await fixture.profile
      .connect(fixture.borrower)
      .submitProfile(
        encrypted.handles[0],
        encrypted.handles[1],
        encrypted.handles[2],
        encrypted.handles[3],
        encrypted.handles[4],
        encrypted.handles[5],
        encrypted.inputProof,
      )
  ).wait();
}

async function publicDecryptValues(handles: string[]) {
  const result = await fhevm.publicDecrypt(handles);
  return handles.map((handle) => result.clearValues[handle as `0x${string}`]);
}

describe("CipherCapital confidential credit pipeline", function () {
  beforeEach(function () {
    if (!fhevm.isMock) {
      this.skip();
    }
  });

  it("caps an unverified Tier A profile without revealing raw financials", async function () {
    const fixture = await deployFixture();
    await submitEncryptedProfile(fixture, tierAProfile);

    await (await fixture.scoreEngine.connect(fixture.borrower).computeRiskProfile(fixture.borrower.address)).wait();
    const riskProfile = await fixture.scoreEngine.getLatestRiskProfile(fixture.borrower.address);

    expect(riskProfile.exists).to.eq(true);

    expect(riskProfile.attestationActive).to.eq(false);

    const [solvencyVerified, creditTier, maxCreditLine, reserveStatus, runwayTier, riskBand, auditorRequired] =
      await publicDecryptValues([
        riskProfile.solvencyVerified,
        riskProfile.creditTier,
        riskProfile.maxCreditLine,
        riskProfile.reserveStatus,
        riskProfile.runwayTier,
        riskProfile.riskBand,
        riskProfile.auditorRequired,
      ]);

    expect(solvencyVerified).to.eq(true);
    expect(creditTier).to.eq(3n);
    expect(maxCreditLine).to.eq(5_000n);
    expect(reserveStatus).to.eq(3n);
    expect(runwayTier).to.eq(3n);
    expect(riskBand).to.eq(1n);
    expect(auditorRequired).to.eq(true);

    const storedProfile = await fixture.profile.getProfile(fixture.borrower.address);
    expect(storedProfile.assets).to.not.eq(ethers.ZeroHash);
    expect(storedProfile.assets).to.not.eq(50_000n);
  });

  it("approves and records an encrypted mockUSDC credit line within the confidential limit", async function () {
    const fixture = await deployFixture();
    await submitEncryptedProfile(fixture, tierAProfile);
    await submitAuditorAttestation(fixture);

    await (await fixture.loanVault.connect(fixture.borrower).requestLoan(10_000)).wait();
    const decision = await fixture.loanVault.getLoanDecision(fixture.borrower.address);

    const [approved, creditTier, maxCreditLine, issuedAmount] = await publicDecryptValues([
      decision.approved,
      decision.creditTier,
      decision.maxCreditLine,
      decision.issuedAmount,
    ]);

    expect(approved).to.eq(true);
    expect(creditTier).to.eq(3n);
    expect(maxCreditLine).to.eq(50_000n);
    expect(issuedAmount).to.eq(10_000n);
    expect(decision.requestedAmount).to.eq(10_000n);
    expect(decision.attestationActive).to.eq(true);
  });

  it("rejects a loan request above the encrypted credit line", async function () {
    const fixture = await deployFixture();
    await submitEncryptedProfile(fixture, tierAProfile);
    await submitAuditorAttestation(fixture);

    await (await fixture.loanVault.connect(fixture.borrower).requestLoan(60_000)).wait();
    const decision = await fixture.loanVault.getLoanDecision(fixture.borrower.address);

    const [approved, issuedAmount] = await publicDecryptValues([decision.approved, decision.issuedAmount]);

    expect(approved).to.eq(false);
    expect(issuedAmount).to.eq(0n);
  });

  it("computes Tier B and Tier C outcomes for weaker borrowers", async function () {
    const fixture = await deployFixture();
    await submitEncryptedProfile(fixture, {
      assets: 30_000,
      liabilities: 22_000,
      monthlyRevenue: 1_000,
      monthlyBurn: 4_000,
      repaymentCount: 4,
      overdueCount: 2,
    });
    await submitAuditorAttestation(fixture);

    await (await fixture.scoreEngine.connect(fixture.borrower).computeRiskProfile(fixture.borrower.address)).wait();
    let riskProfile = await fixture.scoreEngine.getLatestRiskProfile(fixture.borrower.address);
    let [, creditTier, maxCreditLine, , , riskBand] = await publicDecryptValues([
      riskProfile.solvencyVerified,
      riskProfile.creditTier,
      riskProfile.maxCreditLine,
      riskProfile.reserveStatus,
      riskProfile.runwayTier,
      riskProfile.riskBand,
    ]);

    expect(creditTier).to.eq(2n);
    expect(maxCreditLine).to.eq(20_000n);
    expect(riskBand).to.eq(2n);

    await submitEncryptedProfile(fixture, {
      assets: 12_000,
      liabilities: 10_000,
      monthlyRevenue: 500,
      monthlyBurn: 5_000,
      repaymentCount: 1,
      overdueCount: 6,
    });
    await submitAuditorAttestation(fixture);

    await (await fixture.scoreEngine.connect(fixture.borrower).computeRiskProfile(fixture.borrower.address)).wait();
    riskProfile = await fixture.scoreEngine.getLatestRiskProfile(fixture.borrower.address);
    [, creditTier, maxCreditLine, , , riskBand] = await publicDecryptValues([
      riskProfile.solvencyVerified,
      riskProfile.creditTier,
      riskProfile.maxCreditLine,
      riskProfile.reserveStatus,
      riskProfile.runwayTier,
      riskProfile.riskBand,
    ]);

    expect(creditTier).to.eq(1n);
    expect(maxCreditLine).to.eq(5_000n);
    expect(riskBand).to.eq(3n);
  });

  it("rejects an attestation from an unapproved auditor", async function () {
    const fixture = await deployFixture();
    const [, , , unapprovedAuditor] = await ethers.getSigners();
    await submitEncryptedProfile(fixture, tierAProfile);

    const storedProfile = await fixture.profile.getProfile(fixture.borrower.address);
    const network = await ethers.provider.getNetwork();
    const latestBlock = await ethers.provider.getBlock("latest");
    const expiresAt = Number(latestBlock?.timestamp ?? 0) + 30 * 24 * 60 * 60;
    const evidenceHash = ethers.id("mock-auditor-report");
    const signature = await unapprovedAuditor.signTypedData(
      {
        name: "CipherCapitalAttestation",
        version: "1",
        chainId: network.chainId,
        verifyingContract: fixture.profileAddress,
      },
      {
        FinancialProfileAttestation: [
          { name: "borrower", type: "address" },
          { name: "profileVersion", type: "uint32" },
          { name: "verificationTier", type: "uint8" },
          { name: "expiresAt", type: "uint64" },
          { name: "evidenceHash", type: "bytes32" },
        ],
      },
      {
        borrower: fixture.borrower.address,
        profileVersion: storedProfile.version,
        verificationTier: 2,
        expiresAt,
        evidenceHash,
      },
    );

    await expect(
      fixture.profile
        .connect(fixture.borrower)
        .submitAttestation(2, expiresAt, evidenceHash, signature),
    ).to.be.revertedWith("auditor not approved");
  });

  it("lets a borrower grant an auditor user-decryption access to raw encrypted fields", async function () {
    const fixture = await deployFixture();
    await submitEncryptedProfile(fixture, tierAProfile);

    await (await fixture.profile.connect(fixture.borrower).grantAuditorAccess(fixture.auditor.address)).wait();
    expect(await fixture.profile.auditorAccess(fixture.borrower.address, fixture.auditor.address)).to.eq(true);

    const storedProfile = await fixture.profile.getProfile(fixture.borrower.address);
    const decryptedRevenue = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      storedProfile.monthlyRevenue,
      fixture.profileAddress,
      fixture.auditor,
    );

    expect(decryptedRevenue).to.eq(BigInt(tierAProfile.monthlyRevenue));
  });
});
