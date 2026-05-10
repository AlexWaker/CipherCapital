import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  const Profile = await ethers.getContractFactory("ConfidentialCreditProfile");
  const profile = await Profile.deploy();
  await profile.waitForDeployment();
  const profileAddress = await profile.getAddress();
  console.log("ConfidentialCreditProfile:", profileAddress);

  const ScoreEngine = await ethers.getContractFactory("SilentScoreEngine");
  const scoreEngine = await ScoreEngine.deploy(profileAddress);
  await scoreEngine.waitForDeployment();
  const scoreEngineAddress = await scoreEngine.getAddress();
  console.log("SilentScoreEngine:", scoreEngineAddress);

  const LoanVault = await ethers.getContractFactory("PrivateLoanVault");
  const loanVault = await LoanVault.deploy(scoreEngineAddress);
  await loanVault.waitForDeployment();
  const loanVaultAddress = await loanVault.getAddress();
  console.log("PrivateLoanVault:", loanVaultAddress);

  const tx = await profile.setProtocolContracts(scoreEngineAddress, loanVaultAddress);
  await tx.wait();
  console.log("Protocol contracts configured.");

  const auditorTx = await profile.setApprovedAuditor(deployer.address, true);
  await auditorTx.wait();
  console.log("Default approved auditor:", deployer.address);

  console.log("\nFrontend env:");
  console.log(`NEXT_PUBLIC_PROFILE_CONTRACT=${profileAddress}`);
  console.log(`NEXT_PUBLIC_SCORE_ENGINE_CONTRACT=${scoreEngineAddress}`);
  console.log(`NEXT_PUBLIC_LOAN_VAULT_CONTRACT=${loanVaultAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
