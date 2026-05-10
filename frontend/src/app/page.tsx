"use client";

import {
  Activity,
  BadgeCheck,
  Building2,
  Database,
  Eye,
  Landmark,
  Languages,
  LockKeyhole,
  Network,
  RefreshCw,
  Send,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState, type ReactNode } from "react";
import { isAddress, keccak256, stringToHex, type Address } from "viem";
import { useAccount, usePublicClient, useSignTypedData, useWriteContract } from "wagmi";
import { CONTRACTS, loanVaultAbi, profileAbi, scoreEngineAbi } from "@/lib/contracts";
import { encryptCreditProfile, publicDecryptHandles } from "@/lib/fhe";

const WalletConnectButton = dynamic(() => import("@/components/WalletConnectButton"), { ssr: false });

type Language = "zh" | "en";

type ProfileForm = {
  assets: number;
  liabilities: number;
  monthlyRevenue: number;
  monthlyBurn: number;
  repaymentCount: number;
  overdueCount: number;
};

type RiskView = {
  solvencyVerified: boolean;
  creditTier: number;
  maxCreditLine: number;
  reserveStatus: number;
  runwayTier: number;
  riskBand: number;
  auditorRequired: boolean;
  attestationActive: boolean;
  updatedAt?: number;
};

type LoanView = RiskView & {
  approved: boolean;
  issuedAmount: number;
  requestedAmount: number;
};

type AttestationDraft = {
  borrower: Address;
  profileVersion: number;
  verificationTier: number;
  expiresAt: number;
  evidenceHash: `0x${string}`;
  signature: `0x${string}`;
};

type AttestationView = {
  auditor: Address;
  profileVersion: number;
  expiresAt: number;
  verificationTier: number;
  active: boolean;
  exists: boolean;
};

const initialProfile: ProfileForm = {
  assets: 50_000,
  liabilities: 20_000,
  monthlyRevenue: 12_000,
  monthlyBurn: 3_000,
  repaymentCount: 12,
  overdueCount: 0,
};

const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";

const copy = {
  zh: {
    appSubtitle: "隐私信用基础设施",
    connected: "已连接",
    connect: "连接钱包",
    disconnect: "断开钱包",
    switchNetwork: "切换网络",
    selectWallet: "选择钱包",
    configured: "Sepolia 合约已配置",
    previewMode: "预览模式",
    company: "机构",
    companyName: "Demo DAO",
    noWallet: "未连接钱包",
    profile: "档案",
    encrypted: "已加密",
    draft: "草稿",
    network: "网络",
    publicResult: "公开结果",
    solvency: "偿付能力",
    verified: "已验证",
    notVerified: "未验证",
    creditTier: "信用等级",
    maxLine: "最高额度",
    riskBand: "风险带",
    reserve: "储备",
    runway: "Runway",
    creditLine: "信用额度",
    auditor: "审计",
    auditorRequired: "需审计",
    auditorOptional: "可选",
    attestation: "审计证明",
    attested: "已验证",
    unattested: "未验证",
    status: "状态",
    privateFinancials: "加密财务数据",
    encryptedHandles: "密文句柄",
    cashReserve: "现金储备",
    totalLiabilities: "总负债",
    monthlyRevenue: "月收入",
    monthlyBurn: "月支出",
    repayments: "还款次数",
    overdues: "逾期次数",
    encryptSubmit: "加密并提交",
    computeRisk: "计算风险",
    submitToGenerate: "提交后生成密文句柄",
    creditVault: "信用金库",
    borrowAmount: "借款金额",
    decision: "决策",
    issued: "已发放",
    pending: "待处理",
    approved: "通过",
    rejected: "拒绝",
    requestCredit: "申请额度",
    noLoanHandles: "暂无贷款决策句柄",
    auditorPortal: "审计员门户",
    auditorAddress: "审计员地址",
    grantAccess: "授权访问",
    attestationPanel: "财务真实性证明",
    borrowerAddress: "借款人地址",
    verificationTier: "验证等级",
    expiryDays: "有效天数",
    auditorSign: "审计员签名",
    submitAttestation: "提交证明",
    noSignature: "暂无签名",
    signatureReady: "签名已生成",
    approvedAuditorOnly: "当前钱包不是认可审计员，无法签名",
    attestationSubmitted: "审计证明已提交",
    attestationSigned: "审计员证明签名已生成",
    invalidBorrower: "请输入有效的借款人地址",
    missingSignature: "请先生成审计员签名",
    borrowerMismatch: "请切回该借款人钱包后提交证明",
    riskHandles: "风险句柄",
    rawFields: "原始字段",
    decryptable: "个可解密",
    none: "无",
    consentGated: "需借款人授权",
    noAuditor: "未设置审计员",
    handle: "句柄",
    protocol: "协议",
    live: "运行中",
    ready: "就绪",
    walletDisconnected: "钱包已断开，可重新连接",
    previewProfileStaged: "预览档案已生成",
    encryptingProfile: "正在加密财务档案",
    submittingProfile: "正在提交加密档案",
    encryptedProfileStored: "加密档案已上链",
    computingRisk: "正在计算隐私风险画像",
    previewRiskComputed: "预览风险画像已计算",
    riskDecrypted: "风险画像已解密展示",
    requestingCredit: "正在申请隐私信用额度",
    previewLoanComputed: "预览贷款决策已计算",
    loanDecrypted: "贷款决策已解密展示",
    previewAuditorStaged: "预览审计授权已生成",
    auditorAccessGranted: "审计访问权限已授权",
    invalidAuditor: "请输入有效的审计员地址",
    noInjectedWallet: "没有找到钱包，请使用 MetaMask 或兼容 EIP-1193 的钱包打开。",
    walletNoAccount: "钱包连接没有返回账户。",
    noConnector: "请先点击右上角“选择钱包”并完成连接。",
    missingProfileContract: "缺少 Profile 合约地址。",
    fewHandles: "Relayer SDK 返回的句柄数量不足。",
    noRiskProfile: "未找到风险画像。",
    noLoanDecision: "未找到贷款决策。",
    couldNotDetectNetwork: "无法检测钱包网络。请解锁 MetaMask，切换到 Sepolia 后重试。",
    couldNotReadContract: "无法读取当前链上的合约数据。请切换到 Ethereum Sepolia 并刷新页面。",
    walletRejected: "钱包请求已被拒绝。",
    riskLow: "低",
    riskMedium: "中",
    riskHigh: "高",
    reserveUnsafe: "危险",
    reserveWatch: "观察",
    reserveHealthy: "健康",
    tierRejected: "拒绝",
  },
  en: {
    appSubtitle: "Confidential Credit Infrastructure",
    connected: "Connected",
    connect: "Connect",
    disconnect: "Disconnect",
    switchNetwork: "Switch network",
    selectWallet: "Select wallet",
    configured: "Sepolia contracts configured",
    previewMode: "Preview mode",
    company: "Company",
    companyName: "Demo DAO",
    noWallet: "No wallet connected",
    profile: "Profile",
    encrypted: "Encrypted",
    draft: "Draft",
    network: "Network",
    publicResult: "Public Result",
    solvency: "Solvency",
    verified: "Verified",
    notVerified: "Not verified",
    creditTier: "Credit Tier",
    maxLine: "Max Line",
    riskBand: "Risk Band",
    reserve: "Reserve",
    runway: "Runway",
    creditLine: "Credit Line",
    auditor: "Auditor",
    auditorRequired: "Required",
    auditorOptional: "Optional",
    attestation: "Attestation",
    attested: "Verified",
    unattested: "Unverified",
    status: "Status",
    privateFinancials: "Encrypted Financials",
    encryptedHandles: "Ciphertext Handles",
    cashReserve: "Cash Reserve",
    totalLiabilities: "Total Liabilities",
    monthlyRevenue: "Monthly Revenue",
    monthlyBurn: "Monthly Burn",
    repayments: "Repayments",
    overdues: "Overdues",
    encryptSubmit: "Encrypt and Submit",
    computeRisk: "Compute Risk",
    submitToGenerate: "Submit to generate handles",
    creditVault: "Credit Vault",
    borrowAmount: "Borrow Amount",
    decision: "Decision",
    issued: "Issued",
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    requestCredit: "Request Credit",
    noLoanHandles: "No loan decision handles",
    auditorPortal: "Auditor Portal",
    auditorAddress: "Auditor address",
    grantAccess: "Grant Access",
    attestationPanel: "Verified Financial Data",
    borrowerAddress: "Borrower address",
    verificationTier: "Verification tier",
    expiryDays: "Expiry days",
    auditorSign: "Auditor Sign",
    submitAttestation: "Submit Attestation",
    noSignature: "No signature",
    signatureReady: "Signature ready",
    approvedAuditorOnly: "The connected wallet is not an approved auditor.",
    attestationSubmitted: "Auditor attestation submitted",
    attestationSigned: "Auditor attestation signature created",
    invalidBorrower: "Enter a valid borrower address",
    missingSignature: "Create an auditor signature first",
    borrowerMismatch: "Switch back to the borrower wallet before submitting",
    riskHandles: "Risk handles",
    rawFields: "Raw fields",
    decryptable: "decryptable",
    none: "None",
    consentGated: "Consent gated",
    noAuditor: "No auditor",
    handle: "handle",
    protocol: "Protocol",
    live: "Live",
    ready: "Ready",
    walletDisconnected: "Wallet disconnected. You can reconnect now.",
    previewProfileStaged: "Preview profile staged",
    encryptingProfile: "Encrypting financial profile",
    submittingProfile: "Submitting encrypted profile",
    encryptedProfileStored: "Encrypted profile stored onchain",
    computingRisk: "Computing confidential risk profile",
    previewRiskComputed: "Preview risk profile computed",
    riskDecrypted: "Risk profile decrypted",
    requestingCredit: "Requesting confidential credit line",
    previewLoanComputed: "Preview loan decision computed",
    loanDecrypted: "Loan decision decrypted",
    previewAuditorStaged: "Preview auditor access staged",
    auditorAccessGranted: "Auditor access granted",
    invalidAuditor: "Enter a valid auditor address",
    noInjectedWallet: "No injected wallet found. Please open this dApp with MetaMask or another EIP-1193 wallet.",
    walletNoAccount: "Wallet connection did not return an account.",
    noConnector: "Select a wallet from the top-right wallet picker first.",
    missingProfileContract: "Profile contract address missing.",
    fewHandles: "Relayer SDK returned fewer handles than expected.",
    noRiskProfile: "No risk profile found.",
    noLoanDecision: "No loan decision found.",
    couldNotDetectNetwork: "Could not detect wallet network. Unlock MetaMask, switch to Sepolia, then try again.",
    couldNotReadContract: "Could not read contract data on the selected chain. Switch to Ethereum Sepolia and refresh.",
    walletRejected: "Wallet request was rejected.",
    riskLow: "Low",
    riskMedium: "Medium",
    riskHigh: "High",
    reserveUnsafe: "Unsafe",
    reserveWatch: "Watch",
    reserveHealthy: "Healthy",
    tierRejected: "Rejected",
  },
} as const;

function estimateRisk(profile: ProfileForm): RiskView {
  const liabilityRisk = profile.liabilities + profile.overdueCount * 1_000;
  const healthyReserve = profile.assets * 10 >= liabilityRisk * 12;
  const reserveCoversDebt = profile.assets >= profile.liabilities;
  const revenueHealthy = profile.monthlyRevenue * 10 >= profile.monthlyBurn * 6;
  const runwayMonths = profile.monthlyBurn === 0 ? 99 : Math.floor(profile.assets / profile.monthlyBurn);
  const runwayAtLeast6 = runwayMonths >= 6;
  const runwayAtLeast3 = runwayMonths >= 3;
  const repaymentSeasoned = profile.repaymentCount >= 6;
  const overdueExcellent = profile.overdueCount <= 1;
  const overdueAcceptable = profile.overdueCount <= 5;
  const overdueWatchlist = profile.overdueCount <= 7;
  const tierA = healthyReserve && revenueHealthy && runwayAtLeast6 && repaymentSeasoned && overdueExcellent;
  const tierB = healthyReserve && (revenueHealthy || runwayAtLeast3) && overdueAcceptable;
  const tierC = reserveCoversDebt && overdueWatchlist;
  const creditTier = tierA ? 3 : tierB ? 2 : tierC ? 1 : 0;
  const rawMaxCreditLine = tierA ? 50_000 : tierB ? 20_000 : tierC ? 5_000 : 0;

  return {
    solvencyVerified: reserveCoversDebt && (revenueHealthy || runwayAtLeast3),
    creditTier,
    maxCreditLine: Math.min(rawMaxCreditLine, 5_000),
    reserveStatus: healthyReserve ? 3 : reserveCoversDebt ? 2 : 1,
    runwayTier: runwayAtLeast6 ? 3 : runwayAtLeast3 ? 2 : 1,
    riskBand: tierA ? 1 : tierB ? 2 : tierC ? 3 : 4,
    auditorRequired: true,
    attestationActive: false,
  };
}

function clearToNumber(value: bigint | boolean | `0x${string}` | undefined) {
  return typeof value === "bigint" ? Number(value) : 0;
}

function clearToBoolean(value: bigint | boolean | `0x${string}` | undefined) {
  return value === true;
}

function formatError(error: unknown, language: Language) {
  const t = copy[language];
  const message = error instanceof Error ? error.message : String(error);

  if (/could not detect network/i.test(message)) {
    return t.couldNotDetectNetwork;
  }

  if (/could not decode result data|returned no data/i.test(message)) {
    return t.couldNotReadContract;
  }

  if (/user rejected|rejected the request/i.test(message)) {
    return t.walletRejected;
  }

  return message;
}

function getInjectedProvider() {
  return window.ethereum as
    | {
        request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      }
    | undefined;
}

export default function Home() {
  const { address, isConnected } = useAccount();
  const { writeContractAsync, isPending: isWriting } = useWriteContract();
  const { signTypedDataAsync, isPending: isSigning } = useSignTypedData();
  const publicClient = usePublicClient();

  const [language, setLanguage] = useState<Language>("zh");
  const [profile, setProfile] = useState<ProfileForm>(initialProfile);
  const [loanAmount, setLoanAmount] = useState(10_000);
  const [auditor, setAuditor] = useState("");
  const [statusKey, setStatusKey] = useState<keyof (typeof copy)["zh"]>("ready");
  const [customStatus, setCustomStatus] = useState<string | null>(null);
  const [encryptedHandles, setEncryptedHandles] = useState<readonly `0x${string}`[]>([]);
  const [riskHandles, setRiskHandles] = useState<readonly `0x${string}`[]>([]);
  const [loanHandles, setLoanHandles] = useState<readonly `0x${string}`[]>([]);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [riskView, setRiskView] = useState<RiskView | null>(null);
  const [loanView, setLoanView] = useState<LoanView | null>(null);
  const [attestationBorrower, setAttestationBorrower] = useState("");
  const [verificationTier, setVerificationTier] = useState(2);
  const [expiryDays, setExpiryDays] = useState(30);
  const [attestationDraft, setAttestationDraft] = useState<AttestationDraft | null>(null);
  const [attestationView, setAttestationView] = useState<AttestationView | null>(null);

  const t = copy[language];
  const localRisk = useMemo(() => estimateRisk(profile), [profile]);
  const contractsReady = Boolean(CONTRACTS.profile && CONTRACTS.scoreEngine && CONTRACTS.loanVault);
  const busy = isWriting || isSigning;
  const status = customStatus ?? t[statusKey];

  const tierLabels: Record<number, string> = {
    0: t.tierRejected,
    1: "C",
    2: "B",
    3: "A",
  };

  const reserveLabels: Record<number, string> = {
    1: t.reserveUnsafe,
    2: t.reserveWatch,
    3: t.reserveHealthy,
  };

  const runwayLabels: Record<number, string> = {
    1: "< 3M",
    2: "3-6M",
    3: "> 6M",
  };

  const riskLabels: Record<number, string> = {
    1: t.riskLow,
    2: t.riskMedium,
    3: t.riskHigh,
    4: t.tierRejected,
  };

  function setLocalizedStatus(key: keyof (typeof copy)["zh"]) {
    setCustomStatus(null);
    setStatusKey(key);
  }

  async function ensureWallet() {
    if (isConnected && address) {
      return address;
    }

    throw new Error(t.noConnector);
  }

  async function ensureSepolia() {
    const ethereum = getInjectedProvider();
    if (!ethereum) {
      throw new Error(t.noInjectedWallet);
    }

    const chainId = (await ethereum.request({ method: "eth_chainId" })) as string;
    if (Number(BigInt(chainId)) === SEPOLIA_CHAIN_ID) {
      return;
    }

    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
      });
    } catch (switchError) {
      const errorCode = typeof switchError === "object" && switchError !== null && "code" in switchError ? switchError.code : undefined;

      if (errorCode === 4902) {
        await ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: SEPOLIA_CHAIN_ID_HEX,
              chainName: "Ethereum Sepolia",
              nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: [process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com"],
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
            },
          ],
        });
        return;
      }

      throw switchError;
    }
  }

  async function waitForTransaction(hash: `0x${string}`) {
    if (publicClient) {
      await publicClient.waitForTransactionReceipt({ hash });
    }
  }

  function resolveBorrowerAddress() {
    const rawBorrower = attestationBorrower.trim() || address;

    if (!rawBorrower || !isAddress(rawBorrower)) {
      throw new Error(t.invalidBorrower);
    }

    return rawBorrower as Address;
  }

  async function readProfileVersion(userAddress: Address) {
    if (!CONTRACTS.profile || !publicClient) {
      throw new Error(t.missingProfileContract);
    }

    const result = (await publicClient.readContract({
      address: CONTRACTS.profile,
      abi: profileAbi,
      functionName: "getProfile",
      args: [userAddress],
    })) as readonly [
      `0x${string}`,
      `0x${string}`,
      `0x${string}`,
      `0x${string}`,
      `0x${string}`,
      `0x${string}`,
      bigint,
      number,
      boolean,
    ];

    if (!result[8]) {
      throw new Error(t.noRiskProfile);
    }

    return result[7];
  }

  async function loadAttestation(userAddress: Address) {
    if (!CONTRACTS.profile || !publicClient) {
      return;
    }

    const result = (await publicClient.readContract({
      address: CONTRACTS.profile,
      abi: profileAbi,
      functionName: "getAttestation",
      args: [userAddress],
    })) as readonly [Address, number, bigint, bigint, number, `0x${string}`, boolean, boolean];

    setAttestationView({
      auditor: result[0],
      profileVersion: result[1],
      expiresAt: Number(result[3]),
      verificationTier: result[4],
      active: result[6],
      exists: result[7],
    });
  }

  async function signAttestation() {
    try {
      const auditorAddress = await ensureWallet();
      await ensureSepolia();

      if (!CONTRACTS.profile || !publicClient) {
        throw new Error(t.missingProfileContract);
      }

      const borrower = resolveBorrowerAddress();
      const isApprovedAuditor = (await publicClient.readContract({
        address: CONTRACTS.profile,
        abi: profileAbi,
        functionName: "approvedAuditors",
        args: [auditorAddress],
      })) as boolean;

      if (!isApprovedAuditor) {
        throw new Error(t.approvedAuditorOnly);
      }

      const profileVersion = await readProfileVersion(borrower);
      const boundedTier = Math.max(1, Math.min(3, Math.floor(verificationTier)));
      const boundedExpiryDays = Math.max(1, Math.floor(expiryDays));
      const expiresAt = Math.floor(Date.now() / 1000) + boundedExpiryDays * 24 * 60 * 60;
      const evidenceHash = keccak256(
        stringToHex(
          `${borrower.toLowerCase()}:${profileVersion}:${boundedTier}:${expiresAt}:${auditorAddress.toLowerCase()}:ciphercapital`,
        ),
      );

      const signature = await signTypedDataAsync({
        domain: {
          name: "CipherCapitalAttestation",
          version: "1",
          chainId: SEPOLIA_CHAIN_ID,
          verifyingContract: CONTRACTS.profile,
        },
        types: {
          FinancialProfileAttestation: [
            { name: "borrower", type: "address" },
            { name: "profileVersion", type: "uint32" },
            { name: "verificationTier", type: "uint8" },
            { name: "expiresAt", type: "uint64" },
            { name: "evidenceHash", type: "bytes32" },
          ],
        },
        primaryType: "FinancialProfileAttestation",
        message: {
          borrower,
          profileVersion,
          verificationTier: boundedTier,
          expiresAt: BigInt(expiresAt),
          evidenceHash,
        },
      });

      setVerificationTier(boundedTier);
      setExpiryDays(boundedExpiryDays);
      setAttestationDraft({
        borrower,
        profileVersion,
        verificationTier: boundedTier,
        expiresAt,
        evidenceHash,
        signature,
      });
      setLocalizedStatus("attestationSigned");
    } catch (error) {
      setCustomStatus(formatError(error, language));
    }
  }

  async function submitAttestation() {
    try {
      const borrowerAddress = await ensureWallet();
      await ensureSepolia();

      if (!CONTRACTS.profile) {
        throw new Error(t.missingProfileContract);
      }

      if (!attestationDraft) {
        throw new Error(t.missingSignature);
      }

      if (borrowerAddress.toLowerCase() !== attestationDraft.borrower.toLowerCase()) {
        throw new Error(t.borrowerMismatch);
      }

      const hash = await writeContractAsync({
        address: CONTRACTS.profile,
        abi: profileAbi,
        functionName: "submitAttestation",
        args: [
          attestationDraft.verificationTier,
          BigInt(attestationDraft.expiresAt),
          attestationDraft.evidenceHash,
          attestationDraft.signature,
        ],
      });

      await waitForTransaction(hash);
      await loadAttestation(borrowerAddress);
      setRiskView(null);
      setLoanView(null);
      setLocalizedStatus("attestationSubmitted");
    } catch (error) {
      setCustomStatus(formatError(error, language));
    }
  }

  async function submitProfile() {
    try {
      const userAddress = await ensureWallet();
      await ensureSepolia();
      setLocalizedStatus("encryptingProfile");

      if (!contractsReady || !CONTRACTS.profile) {
        setEncryptedHandles([
          "0x1111111111111111111111111111111111111111111111111111111111111111",
          "0x2222222222222222222222222222222222222222222222222222222222222222",
          "0x3333333333333333333333333333333333333333333333333333333333333333",
          "0x4444444444444444444444444444444444444444444444444444444444444444",
          "0x5555555555555555555555555555555555555555555555555555555555555555",
          "0x6666666666666666666666666666666666666666666666666666666666666666",
        ]);
        setHasSubmitted(true);
        setLocalizedStatus("previewProfileStaged");
        return;
      }

      const encrypted = await encryptCreditProfile({
        userAddress,
        ...profile,
      });

      if (encrypted.handles.length < 6) {
        throw new Error(t.fewHandles);
      }

      const handles = encrypted.handles as readonly `0x${string}`[];
      setEncryptedHandles(handles);
      setLocalizedStatus("submittingProfile");

      const hash = await writeContractAsync({
        address: CONTRACTS.profile,
        abi: profileAbi,
        functionName: "submitProfile",
        args: [
          handles[0],
          handles[1],
          handles[2],
          handles[3],
          handles[4],
          handles[5],
          encrypted.inputProof,
        ],
      });

      await waitForTransaction(hash);
      setHasSubmitted(true);
      setRiskView(null);
      setLoanView(null);
      setAttestationDraft(null);
      setAttestationView(null);
      setLocalizedStatus("encryptedProfileStored");
    } catch (error) {
      setCustomStatus(formatError(error, language));
    }
  }

  async function computeRiskProfile() {
    try {
      const userAddress = await ensureWallet();
      await ensureSepolia();
      setLocalizedStatus("computingRisk");

      if (!contractsReady || !CONTRACTS.scoreEngine || !publicClient) {
        setRiskView(localRisk);
        setLocalizedStatus("previewRiskComputed");
        return;
      }

      const hash = await writeContractAsync({
        address: CONTRACTS.scoreEngine,
        abi: scoreEngineAbi,
        functionName: "computeRiskProfile",
        args: [userAddress],
      });
      await waitForTransaction(hash);
      await loadRiskProfile(userAddress);
      setLocalizedStatus("riskDecrypted");
    } catch (error) {
      setCustomStatus(formatError(error, language));
    }
  }

  async function loadRiskProfile(userAddress: Address) {
    if (!CONTRACTS.scoreEngine || !publicClient) {
      return;
    }

    const result = (await publicClient.readContract({
      address: CONTRACTS.scoreEngine,
      abi: scoreEngineAbi,
      functionName: "getLatestRiskProfile",
      args: [userAddress],
    })) as readonly [
      `0x${string}`,
      `0x${string}`,
      `0x${string}`,
      `0x${string}`,
      `0x${string}`,
      `0x${string}`,
      `0x${string}`,
      boolean,
      bigint,
      boolean,
    ];

    if (!result[9]) {
      throw new Error(t.noRiskProfile);
    }

    const handles = [result[0], result[1], result[2], result[3], result[4], result[5], result[6]] as const;
    setRiskHandles(handles);
    const decrypted = await publicDecryptHandles(handles);

    setRiskView({
      solvencyVerified: clearToBoolean(decrypted[result[0]]),
      creditTier: clearToNumber(decrypted[result[1]]),
      maxCreditLine: clearToNumber(decrypted[result[2]]),
      reserveStatus: clearToNumber(decrypted[result[3]]),
      runwayTier: clearToNumber(decrypted[result[4]]),
      riskBand: clearToNumber(decrypted[result[5]]),
      auditorRequired: clearToBoolean(decrypted[result[6]]),
      attestationActive: result[7],
      updatedAt: Number(result[8]),
    });
    await loadAttestation(userAddress);
  }

  async function requestLoan() {
    try {
      const userAddress = await ensureWallet();
      await ensureSepolia();
      setLocalizedStatus("requestingCredit");

      if (!contractsReady || !CONTRACTS.loanVault || !publicClient) {
        const approved = localRisk.solvencyVerified && loanAmount <= localRisk.maxCreditLine;
        setLoanView({
          ...localRisk,
          approved,
          issuedAmount: approved ? loanAmount : 0,
          requestedAmount: loanAmount,
        });
        setLocalizedStatus("previewLoanComputed");
        return;
      }

      const hash = await writeContractAsync({
        address: CONTRACTS.loanVault,
        abi: loanVaultAbi,
        functionName: "requestLoan",
        args: [BigInt(loanAmount)],
      });
      await waitForTransaction(hash);
      await loadLoanDecision(userAddress);
      setLocalizedStatus("loanDecrypted");
    } catch (error) {
      setCustomStatus(formatError(error, language));
    }
  }

  async function loadLoanDecision(userAddress: Address) {
    if (!CONTRACTS.loanVault || !publicClient) {
      return;
    }

    const result = (await publicClient.readContract({
      address: CONTRACTS.loanVault,
      abi: loanVaultAbi,
      functionName: "getLoanDecision",
      args: [userAddress],
    })) as readonly [
      `0x${string}`,
      `0x${string}`,
      `0x${string}`,
      `0x${string}`,
      `0x${string}`,
      `0x${string}`,
      `0x${string}`,
      `0x${string}`,
      boolean,
      bigint,
      bigint,
      boolean,
    ];

    if (!result[11]) {
      throw new Error(t.noLoanDecision);
    }

    const handles = [result[0], result[1], result[2], result[3], result[4], result[5], result[6], result[7]] as const;
    setLoanHandles(handles);
    const decrypted = await publicDecryptHandles(handles);

    setLoanView({
      approved: clearToBoolean(decrypted[result[0]]),
      creditTier: clearToNumber(decrypted[result[1]]),
      maxCreditLine: clearToNumber(decrypted[result[2]]),
      issuedAmount: clearToNumber(decrypted[result[3]]),
      reserveStatus: clearToNumber(decrypted[result[4]]),
      runwayTier: clearToNumber(decrypted[result[5]]),
      riskBand: clearToNumber(decrypted[result[6]]),
      auditorRequired: clearToBoolean(decrypted[result[7]]),
      attestationActive: result[8],
      requestedAmount: Number(result[9]),
      solvencyVerified: clearToNumber(decrypted[result[2]]) > 0,
      updatedAt: Number(result[10]),
    });
    await loadAttestation(userAddress);
  }

  async function grantAuditor() {
    try {
      await ensureWallet();
      await ensureSepolia();

      if (!isAddress(auditor)) {
        throw new Error(t.invalidAuditor);
      }

      if (!contractsReady || !CONTRACTS.profile) {
        setLocalizedStatus("previewAuditorStaged");
        return;
      }

      const hash = await writeContractAsync({
        address: CONTRACTS.profile,
        abi: profileAbi,
        functionName: "grantAuditorAccess",
        args: [auditor as Address],
      });

      await waitForTransaction(hash);
      setLocalizedStatus("auditorAccessGranted");
    } catch (error) {
      setCustomStatus(formatError(error, language));
    }
  }

  const currentRisk = riskView ?? localRisk;
  const currentLoan = loanView;

  return (
    <main className="min-h-screen bg-[#eef3f8] text-[#14212b]">
      <header className="border-b border-[#d8e0ea] bg-[#111f2e] text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#2dd4bf] text-[#0f1e2b]">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-normal">CipherCapital</h1>
              <p className="text-sm text-[#b7c4cf]">{t.appSubtitle}</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <LanguageSwitch language={language} setLanguage={setLanguage} />
            <StatusPill label={contractsReady ? t.configured : t.previewMode} />
            <WalletConnectButton selectWalletLabel={t.selectWallet} switchNetworkLabel={t.switchNetwork} />
          </div>
        </div>
      </header>

      <div className="border-b border-[#d8e0ea] bg-white">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-[#cfd8e3] bg-[#f8fafc] px-3 py-2 text-sm font-semibold text-[#40515e]">
              <Network size={16} />
              Sepolia / Zama FHEVM
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-2">
              <div>
                <p className="text-xs font-semibold uppercase text-[#71808f]">{t.protocol}</p>
                <h2 className="mt-1 text-3xl font-semibold tracking-normal text-[#102033]">Confidential Credit Stack</h2>
              </div>
              <div className="mb-1 flex items-center gap-2 rounded-lg bg-[#ecfdf5] px-3 py-2 text-sm font-semibold text-[#0f766e]">
                <Activity size={16} />
                {t.live}
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-[#d8e0ea] bg-[#f8fafc] p-4">
            <p className="text-xs font-semibold uppercase text-[#71808f]">{t.status}</p>
            <p className="mt-2 break-words text-sm font-semibold text-[#102033]">{status}</p>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 xl:grid-cols-[308px_1fr]">
        <aside className="space-y-5">
          <Panel title={t.company} icon={<Building2 size={18} />} tone="dark">
            <h2 className="text-2xl font-semibold">{t.companyName}</h2>
            <p className="mt-3 break-all rounded-lg bg-white/10 p-3 font-mono text-xs text-[#d9e4ed]">{address ?? t.noWallet}</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <SideStat label={t.profile} value={hasSubmitted ? t.encrypted : t.draft} />
              <SideStat label={t.network} value="Sepolia" />
            </div>
          </Panel>

          <Panel title={t.publicResult} icon={<Eye size={18} />}>
            <div className="space-y-2">
              <SummaryRow label={t.solvency} value={currentRisk.solvencyVerified ? t.verified : t.notVerified} />
              <SummaryRow label={t.creditTier} value={tierLabels[currentRisk.creditTier]} />
              <SummaryRow label={t.maxLine} value={`${currentRisk.maxCreditLine.toLocaleString()} mockUSDC`} />
              <SummaryRow label={t.riskBand} value={riskLabels[currentRisk.riskBand]} />
              <SummaryRow label={t.attestation} value={currentRisk.attestationActive ? t.attested : t.unattested} />
            </div>
          </Panel>
        </aside>

        <section className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Metric icon={<BadgeCheck size={18} />} label={t.reserve} value={reserveLabels[currentRisk.reserveStatus]} accent="teal" />
            <Metric icon={<RefreshCw size={18} />} label={t.runway} value={runwayLabels[currentRisk.runwayTier]} accent="blue" />
            <Metric icon={<Landmark size={18} />} label={t.creditLine} value={`${currentRisk.maxCreditLine.toLocaleString()}`} accent="amber" />
            <Metric icon={<Eye size={18} />} label={t.auditor} value={currentRisk.auditorRequired ? t.auditorRequired : t.auditorOptional} accent="rose" />
            <Metric icon={<ShieldCheck size={18} />} label={t.attestation} value={currentRisk.attestationActive ? t.attested : t.unattested} accent="teal" />
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_0.85fr]">
            <Panel title={t.privateFinancials} icon={<LockKeyhole size={18} />}>
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberField label={t.cashReserve} value={profile.assets} onChange={(assets) => setProfile({ ...profile, assets })} />
                <NumberField label={t.totalLiabilities} value={profile.liabilities} onChange={(liabilities) => setProfile({ ...profile, liabilities })} />
                <NumberField label={t.monthlyRevenue} value={profile.monthlyRevenue} onChange={(monthlyRevenue) => setProfile({ ...profile, monthlyRevenue })} />
                <NumberField label={t.monthlyBurn} value={profile.monthlyBurn} onChange={(monthlyBurn) => setProfile({ ...profile, monthlyBurn })} />
                <NumberField label={t.repayments} value={profile.repaymentCount} onChange={(repaymentCount) => setProfile({ ...profile, repaymentCount })} />
                <NumberField label={t.overdues} value={profile.overdueCount} onChange={(overdueCount) => setProfile({ ...profile, overdueCount })} />
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <ActionButton disabled={busy} icon={<LockKeyhole size={17} />} onClick={submitProfile}>
                  {t.encryptSubmit}
                </ActionButton>
                <ActionButton disabled={busy || !hasSubmitted} icon={<ShieldCheck size={17} />} onClick={computeRiskProfile} variant="secondary">
                  {t.computeRisk}
                </ActionButton>
              </div>
            </Panel>

            <Panel title={t.encryptedHandles} icon={<Database size={18} />}>
              <HandleList handles={encryptedHandles} empty={t.submitToGenerate} handleLabel={t.handle} />
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title={t.creditVault} icon={<Landmark size={18} />}>
              <NumberField label={t.borrowAmount} value={loanAmount} onChange={setLoanAmount} />
              <div className="mt-4 grid grid-cols-2 gap-3">
                <DecisionBox label={t.decision} value={currentLoan ? (currentLoan.approved ? t.approved : t.rejected) : t.pending} />
                <DecisionBox label={t.issued} value={`${(currentLoan?.issuedAmount ?? 0).toLocaleString()} mockUSDC`} />
              </div>
              <ActionButton disabled={busy || !hasSubmitted} icon={<Send size={17} />} onClick={requestLoan}>
                {t.requestCredit}
              </ActionButton>
              <div className="mt-4">
                <HandleList handles={loanHandles} empty={t.noLoanHandles} handleLabel={t.handle} dense />
              </div>
            </Panel>

            <Panel title={t.auditorPortal} icon={<UserCheck size={18} />}>
              <label className="block text-sm font-medium text-[#34444f]">
                {t.auditorAddress}
                <input
                  className="mt-2 h-11 w-full rounded-lg border border-[#cfd8e3] bg-white px-3 font-mono text-sm outline-none transition focus:border-[#0f766e] focus:ring-4 focus:ring-[#0f766e]/15"
                  placeholder="0x..."
                  value={auditor}
                  onChange={(event) => setAuditor(event.target.value)}
                />
              </label>
              <ActionButton disabled={busy || !hasSubmitted} icon={<UserCheck size={17} />} onClick={grantAuditor}>
                {t.grantAccess}
              </ActionButton>
              <div className="mt-4 rounded-lg border border-[#d8e0ea] bg-[#f8fafc] p-4">
                <SummaryRow label={t.riskHandles} value={riskHandles.length ? `${riskHandles.length} ${t.decryptable}` : t.none} />
                <SummaryRow label={t.rawFields} value={auditor ? t.consentGated : t.noAuditor} />
              </div>

              <div className="mt-5 border-t border-[#e6ecf2] pt-5">
                <h3 className="text-sm font-semibold text-[#102033]">{t.attestationPanel}</h3>
                <label className="mt-3 block text-sm font-medium text-[#34444f]">
                  {t.borrowerAddress}
                  <input
                    className="mt-2 h-11 w-full rounded-lg border border-[#cfd8e3] bg-white px-3 font-mono text-sm outline-none transition focus:border-[#0f766e] focus:ring-4 focus:ring-[#0f766e]/15"
                    placeholder={address ?? "0x..."}
                    value={attestationBorrower}
                    onChange={(event) => setAttestationBorrower(event.target.value)}
                  />
                </label>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <NumberField label={t.verificationTier} max={3} min={1} value={verificationTier} onChange={setVerificationTier} />
                  <NumberField label={t.expiryDays} min={1} value={expiryDays} onChange={setExpiryDays} />
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <ActionButton disabled={busy} icon={<ShieldCheck size={17} />} onClick={signAttestation} variant="secondary">
                    {t.auditorSign}
                  </ActionButton>
                  <ActionButton disabled={busy || !attestationDraft} icon={<BadgeCheck size={17} />} onClick={submitAttestation}>
                    {t.submitAttestation}
                  </ActionButton>
                </div>
                <div className="mt-4 rounded-lg border border-[#d8e0ea] bg-[#f8fafc] p-4">
                  <SummaryRow label={t.status} value={attestationDraft ? t.signatureReady : t.noSignature} />
                  <SummaryRow label={t.attestation} value={attestationView?.active ? t.attested : t.unattested} />
                  <SummaryRow label={t.verificationTier} value={attestationView?.exists ? String(attestationView.verificationTier) : t.none} />
                  <SummaryRow
                    label={t.expiryDays}
                    value={attestationView?.exists ? new Date(attestationView.expiresAt * 1000).toLocaleDateString() : t.none}
                  />
                </div>
              </div>
            </Panel>
          </div>
        </section>
      </div>
    </main>
  );
}

function LanguageSwitch({ language, setLanguage }: { language: Language; setLanguage: (language: Language) => void }) {
  return (
    <div className="inline-flex h-10 items-center gap-1 rounded-lg border border-white/15 bg-white/10 p-1 text-sm font-semibold text-white">
      <Languages size={16} className="ml-2 text-[#b7c4cf]" />
      {(["zh", "en"] as const).map((item) => (
        <button
          className={`h-8 rounded-md px-3 transition ${language === item ? "bg-white text-[#102033]" : "text-[#d9e4ed] hover:bg-white/10"}`}
          key={item}
          onClick={() => setLanguage(item)}
          type="button"
        >
          {item === "zh" ? "中文" : "EN"}
        </button>
      ))}
    </div>
  );
}

function StatusPill({ label }: { label: string }) {
  return (
    <span className="inline-flex h-10 items-center rounded-lg border border-white/15 bg-white/10 px-3 text-sm font-medium text-[#d9e4ed]">
      {label}
    </span>
  );
}

function SideStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/10 p-3">
      <p className="text-xs text-[#b7c4cf]">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#e6ecf2] py-2 last:border-b-0">
      <span className="text-sm text-[#607080]">{label}</span>
      <span className="text-right text-sm font-semibold text-[#102033]">{value}</span>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  accent,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  accent: "teal" | "blue" | "amber" | "rose";
}) {
  const accents = {
    teal: "bg-[#ecfdf5] text-[#0f766e]",
    blue: "bg-[#eef2ff] text-[#3545a5]",
    amber: "bg-[#fff7ed] text-[#b45309]",
    rose: "bg-[#fff1f2] text-[#be123c]",
  };

  return (
    <div className="rounded-lg border border-[#d8e0ea] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between text-[#607080]">
        <span className="text-sm">{label}</span>
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${accents[accent]}`}>{icon}</span>
      </div>
      <p className="mt-3 min-h-8 break-words text-2xl font-semibold tracking-normal text-[#102033]">{value}</p>
    </div>
  );
}

function Panel({
  title,
  icon,
  children,
  tone = "light",
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  tone?: "light" | "dark";
}) {
  if (tone === "dark") {
    return (
      <section className="rounded-lg border border-[#1f3a4d] bg-[#102033] p-5 text-white shadow-sm">
        <div className="mb-5 flex items-center gap-2 text-[#2dd4bf]">
          {icon}
          <h2 className="text-lg font-semibold tracking-normal">{title}</h2>
        </div>
        {children}
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-[#d8e0ea] bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center gap-2 text-[#0f766e]">
        {icon}
        <h2 className="text-lg font-semibold tracking-normal text-[#102033]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function NumberField({
  label,
  max,
  min = 0,
  value,
  onChange,
}: {
  label: string;
  max?: number;
  min?: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-sm font-medium text-[#34444f]">
      {label}
      <input
        className="mt-2 h-11 w-full rounded-lg border border-[#cfd8e3] bg-white px-3 text-[#102033] outline-none transition focus:border-[#0f766e] focus:ring-4 focus:ring-[#0f766e]/15"
        max={max}
        min={min}
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ActionButton({
  children,
  disabled,
  icon,
  onClick,
  variant = "primary",
}: {
  children: ReactNode;
  disabled?: boolean;
  icon: ReactNode;
  onClick: () => void;
  variant?: "primary" | "secondary";
}) {
  const className =
    variant === "primary"
      ? "bg-[#0f766e] text-white hover:bg-[#115e59]"
      : "border border-[#cfd8e3] bg-white text-[#102033] hover:bg-[#f3f7f6]";

  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {icon}
      <span className="break-words">{children}</span>
    </button>
  );
}

function DecisionBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#d8e0ea] bg-[#f8fafc] p-4">
      <p className="text-xs font-semibold uppercase text-[#71808f]">{label}</p>
      <p className="mt-2 min-h-8 break-words text-xl font-semibold text-[#102033]">{value}</p>
    </div>
  );
}

function HandleList({
  handles,
  empty,
  dense,
  handleLabel,
}: {
  handles: readonly `0x${string}`[];
  empty: string;
  dense?: boolean;
  handleLabel: string;
}) {
  if (handles.length === 0) {
    return <p className="rounded-lg border border-dashed border-[#cfd8e3] p-4 text-sm text-[#71808f]">{empty}</p>;
  }

  return (
    <div className={dense ? "max-h-32 space-y-2 overflow-auto" : "max-h-80 space-y-2 overflow-auto"}>
      {handles.map((handle, index) => (
        <div key={`${handle}-${index}`} className="rounded-lg border border-[#d8e0ea] bg-[#f8fafc] p-3">
          <p className="text-xs font-semibold uppercase text-[#71808f]">
            {handleLabel} {index + 1}
          </p>
          <p className="mt-1 truncate font-mono text-xs text-[#0f766e]">{handle}</p>
        </div>
      ))}
    </div>
  );
}
