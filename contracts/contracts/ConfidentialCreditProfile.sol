// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {
    FHE,
    euint32,
    euint64,
    externalEuint32,
    externalEuint64
} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

contract ConfidentialCreditProfile is ZamaEthereumConfig, EIP712 {
    bytes32 private constant ATTESTATION_TYPEHASH =
        keccak256(
            "FinancialProfileAttestation(address borrower,uint32 profileVersion,uint8 verificationTier,uint64 expiresAt,bytes32 evidenceHash)"
        );

    struct CreditProfile {
        euint64 assets;
        euint64 liabilities;
        euint64 monthlyRevenue;
        euint64 monthlyBurn;
        euint32 repaymentCount;
        euint32 overdueCount;
        uint64 updatedAt;
        uint32 version;
        bool exists;
    }

    struct ProfileAttestation {
        address auditor;
        uint32 profileVersion;
        uint64 issuedAt;
        uint64 expiresAt;
        uint8 verificationTier;
        bytes32 evidenceHash;
        bool exists;
    }

    address public owner;
    address public scoreEngine;
    address public loanVault;

    mapping(address user => CreditProfile profile) private profiles;
    mapping(address auditor => bool approved) public approvedAuditors;
    mapping(address user => mapping(address auditor => bool allowed)) public auditorAccess;
    mapping(address user => ProfileAttestation attestation) private attestations;

    event ProfileSubmitted(address indexed user, uint32 indexed version);
    event ProtocolContractsUpdated(address indexed scoreEngine, address indexed loanVault);
    event AuditorStatusUpdated(address indexed auditor, bool approved);
    event AuditorAccessGranted(address indexed user, address indexed auditor);
    event ProfileAttested(address indexed user, address indexed auditor, uint32 indexed profileVersion, uint64 expiresAt, uint8 verificationTier);
    event ProtocolAccessRefreshed(address indexed user, address indexed scoreEngine, address indexed loanVault);

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    constructor() EIP712("CipherCapitalAttestation", "1") {
        owner = msg.sender;
    }

    function setProtocolContracts(address newScoreEngine, address newLoanVault) external onlyOwner {
        scoreEngine = newScoreEngine;
        loanVault = newLoanVault;

        emit ProtocolContractsUpdated(newScoreEngine, newLoanVault);
    }

    function setApprovedAuditor(address auditor, bool approved) external onlyOwner {
        require(auditor != address(0), "invalid auditor");
        approvedAuditors[auditor] = approved;

        emit AuditorStatusUpdated(auditor, approved);
    }

    function submitProfile(
        externalEuint64 encryptedAssets,
        externalEuint64 encryptedLiabilities,
        externalEuint64 encryptedMonthlyRevenue,
        externalEuint64 encryptedMonthlyBurn,
        externalEuint32 encryptedRepaymentCount,
        externalEuint32 encryptedOverdueCount,
        bytes calldata inputProof
    ) external {
        CreditProfile storage profile = profiles[msg.sender];

        profile.assets = FHE.fromExternal(encryptedAssets, inputProof);
        profile.liabilities = FHE.fromExternal(encryptedLiabilities, inputProof);
        profile.monthlyRevenue = FHE.fromExternal(encryptedMonthlyRevenue, inputProof);
        profile.monthlyBurn = FHE.fromExternal(encryptedMonthlyBurn, inputProof);
        profile.repaymentCount = FHE.fromExternal(encryptedRepaymentCount, inputProof);
        profile.overdueCount = FHE.fromExternal(encryptedOverdueCount, inputProof);
        profile.updatedAt = uint64(block.timestamp);
        profile.version += 1;
        profile.exists = true;

        _allowProfile(profile, msg.sender);
        _allowConfiguredProtocols(profile);

        emit ProfileSubmitted(msg.sender, profile.version);
    }

    function refreshProtocolAccess() external {
        CreditProfile storage profile = profiles[msg.sender];
        require(profile.exists, "profile missing");

        _allowConfiguredProtocols(profile);

        emit ProtocolAccessRefreshed(msg.sender, scoreEngine, loanVault);
    }

    function grantAuditorAccess(address auditor) external {
        require(auditor != address(0), "invalid auditor");

        CreditProfile storage profile = profiles[msg.sender];
        require(profile.exists, "profile missing");

        auditorAccess[msg.sender][auditor] = true;
        _allowProfile(profile, auditor);

        emit AuditorAccessGranted(msg.sender, auditor);
    }

    function submitAttestation(
        uint8 verificationTier,
        uint64 expiresAt,
        bytes32 evidenceHash,
        bytes calldata signature
    ) external {
        require(verificationTier > 0 && verificationTier <= 3, "invalid tier");
        require(expiresAt > block.timestamp, "attestation expired");

        CreditProfile storage profile = profiles[msg.sender];
        require(profile.exists, "profile missing");

        bytes32 structHash = keccak256(
            abi.encode(
                ATTESTATION_TYPEHASH,
                msg.sender,
                profile.version,
                verificationTier,
                expiresAt,
                evidenceHash
            )
        );
        address auditor = ECDSA.recover(_hashTypedDataV4(structHash), signature);
        require(approvedAuditors[auditor], "auditor not approved");

        attestations[msg.sender] = ProfileAttestation({
            auditor: auditor,
            profileVersion: profile.version,
            issuedAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            verificationTier: verificationTier,
            evidenceHash: evidenceHash,
            exists: true
        });

        emit ProfileAttested(msg.sender, auditor, profile.version, expiresAt, verificationTier);
    }

    function getProfile(
        address user
    )
        external
        view
        returns (
            euint64 assets,
            euint64 liabilities,
            euint64 monthlyRevenue,
            euint64 monthlyBurn,
            euint32 repaymentCount,
            euint32 overdueCount,
            uint64 updatedAt,
            uint32 version,
            bool exists
        )
    {
        CreditProfile storage profile = profiles[user];
        return (
            profile.assets,
            profile.liabilities,
            profile.monthlyRevenue,
            profile.monthlyBurn,
            profile.repaymentCount,
            profile.overdueCount,
            profile.updatedAt,
            profile.version,
            profile.exists
        );
    }

    function hasProfile(address user) external view returns (bool) {
        return profiles[user].exists;
    }

    function hasValidAttestation(address user) public view returns (bool) {
        ProfileAttestation storage attestation = attestations[user];
        CreditProfile storage profile = profiles[user];

        return
            profile.exists &&
            attestation.exists &&
            approvedAuditors[attestation.auditor] &&
            attestation.profileVersion == profile.version &&
            attestation.expiresAt > block.timestamp;
    }

    function getAttestation(
        address user
    )
        external
        view
        returns (
            address auditor,
            uint32 profileVersion,
            uint64 issuedAt,
            uint64 expiresAt,
            uint8 verificationTier,
            bytes32 evidenceHash,
            bool active,
            bool exists
        )
    {
        ProfileAttestation storage attestation = attestations[user];
        return (
            attestation.auditor,
            attestation.profileVersion,
            attestation.issuedAt,
            attestation.expiresAt,
            attestation.verificationTier,
            attestation.evidenceHash,
            hasValidAttestation(user),
            attestation.exists
        );
    }

    function _allowConfiguredProtocols(CreditProfile storage profile) private {
        if (scoreEngine != address(0)) {
            _allowProfile(profile, scoreEngine);
        }

        if (loanVault != address(0)) {
            _allowProfile(profile, loanVault);
        }
    }

    function _allowProfile(CreditProfile storage profile, address account) private {
        FHE.allowThis(profile.assets);
        FHE.allowThis(profile.liabilities);
        FHE.allowThis(profile.monthlyRevenue);
        FHE.allowThis(profile.monthlyBurn);
        FHE.allowThis(profile.repaymentCount);
        FHE.allowThis(profile.overdueCount);

        FHE.allow(profile.assets, account);
        FHE.allow(profile.liabilities, account);
        FHE.allow(profile.monthlyRevenue, account);
        FHE.allow(profile.monthlyBurn, account);
        FHE.allow(profile.repaymentCount, account);
        FHE.allow(profile.overdueCount, account);
    }
}
