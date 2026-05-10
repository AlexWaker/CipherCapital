// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint8, euint32, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ConfidentialCreditProfile} from "./ConfidentialCreditProfile.sol";

contract SilentScoreEngine is ZamaEthereumConfig {
    struct RiskProfile {
        ebool solvencyVerified;
        euint8 creditTier;
        euint64 maxCreditLine;
        euint8 reserveStatus;
        euint8 runwayTier;
        euint8 riskBand;
        ebool auditorRequired;
        bool attestationActive;
        uint64 updatedAt;
        bool exists;
    }

    ConfidentialCreditProfile public immutable profileRegistry;

    mapping(address user => RiskProfile riskProfile) private riskProfiles;

    event RiskProfileComputed(address indexed user);
    event LoanEligibilityChecked(address indexed user, uint64 requestedAmount);

    constructor(address profileRegistryAddress) {
        require(profileRegistryAddress != address(0), "invalid profile registry");
        profileRegistry = ConfidentialCreditProfile(profileRegistryAddress);
    }

    function computeRiskProfile(
        address user
    )
        public
        returns (
            ebool solvencyVerified,
            euint8 creditTier,
            euint64 maxCreditLine,
            euint8 reserveStatus,
            euint8 runwayTier,
            euint8 riskBand,
            ebool auditorRequired,
            bool attestationActive
        )
    {
        (
            solvencyVerified,
            creditTier,
            maxCreditLine,
            reserveStatus,
            runwayTier,
            riskBand,
            auditorRequired,
            attestationActive
        ) = _calculateRiskProfile(user);

        RiskProfile storage profile = riskProfiles[user];
        profile.solvencyVerified = solvencyVerified;
        profile.creditTier = creditTier;
        profile.maxCreditLine = maxCreditLine;
        profile.reserveStatus = reserveStatus;
        profile.runwayTier = runwayTier;
        profile.riskBand = riskBand;
        profile.auditorRequired = auditorRequired;
        profile.attestationActive = attestationActive;
        profile.updatedAt = uint64(block.timestamp);
        profile.exists = true;

        _allowResult(user, profile);

        emit RiskProfileComputed(user);
    }

    function checkLoanRequest(
        address user,
        uint64 requestedAmount
    )
        external
        returns (
            ebool approved,
            euint8 creditTier,
            euint64 maxCreditLine,
            euint8 reserveStatus,
            euint8 runwayTier,
            euint8 riskBand,
            ebool auditorRequired,
            bool attestationActive
        )
    {
        (
            ebool solvencyVerified,
            euint8 computedTier,
            euint64 computedMaxCreditLine,
            euint8 computedReserveStatus,
            euint8 computedRunwayTier,
            euint8 computedRiskBand,
            ebool computedAuditorRequired,
            bool computedAttestationActive
        ) = computeRiskProfile(user);

        approved = FHE.and(solvencyVerified, FHE.le(FHE.asEuint64(requestedAmount), computedMaxCreditLine));
        creditTier = computedTier;
        maxCreditLine = computedMaxCreditLine;
        reserveStatus = computedReserveStatus;
        runwayTier = computedRunwayTier;
        riskBand = computedRiskBand;
        auditorRequired = computedAuditorRequired;
        attestationActive = computedAttestationActive;

        FHE.allowThis(approved);
        FHE.allow(approved, user);
        FHE.allow(approved, msg.sender);
        FHE.makePubliclyDecryptable(approved);

        emit LoanEligibilityChecked(user, requestedAmount);
    }

    function getLatestRiskProfile(
        address user
    )
        external
        view
        returns (
            ebool solvencyVerified,
            euint8 creditTier,
            euint64 maxCreditLine,
            euint8 reserveStatus,
            euint8 runwayTier,
            euint8 riskBand,
            ebool auditorRequired,
            bool attestationActive,
            uint64 updatedAt,
            bool exists
        )
    {
        RiskProfile storage profile = riskProfiles[user];
        return (
            profile.solvencyVerified,
            profile.creditTier,
            profile.maxCreditLine,
            profile.reserveStatus,
            profile.runwayTier,
            profile.riskBand,
            profile.auditorRequired,
            profile.attestationActive,
            profile.updatedAt,
            profile.exists
        );
    }

    function _calculateRiskProfile(
        address user
    )
        private
        returns (
            ebool solvencyVerified,
            euint8 creditTier,
            euint64 maxCreditLine,
            euint8 reserveStatus,
            euint8 runwayTier,
            euint8 riskBand,
            ebool auditorRequired,
            bool attestationActive
        )
    {
        (
            euint64 assets,
            euint64 liabilities,
            euint64 monthlyRevenue,
            euint64 monthlyBurn,
            euint32 repaymentCount,
            euint32 overdueCount,
            ,
            ,
            bool exists
        ) = profileRegistry.getProfile(user);

        require(exists, "profile missing");

        attestationActive = profileRegistry.hasValidAttestation(user);

        euint64 overduePenalty = FHE.mul(FHE.asEuint64(overdueCount), 1_000);
        euint64 liabilityRisk = FHE.add(liabilities, overduePenalty);

        ebool healthyReserve = FHE.ge(FHE.mul(assets, 10), FHE.mul(liabilityRisk, 12));
        ebool reserveCoversDebt = FHE.ge(assets, liabilities);
        ebool revenueHealthy = FHE.ge(FHE.mul(monthlyRevenue, 10), FHE.mul(monthlyBurn, 6));
        ebool runwayAtLeast6 = FHE.ge(assets, FHE.mul(monthlyBurn, 6));
        ebool runwayAtLeast3 = FHE.ge(assets, FHE.mul(monthlyBurn, 3));
        ebool repaymentSeasoned = FHE.ge(repaymentCount, FHE.asEuint32(6));
        ebool overdueExcellent = FHE.le(overdueCount, FHE.asEuint32(1));
        ebool overdueAcceptable = FHE.le(overdueCount, FHE.asEuint32(5));
        ebool overdueWatchlist = FHE.le(overdueCount, FHE.asEuint32(7));

        ebool tierA = FHE.and(
            healthyReserve,
            FHE.and(revenueHealthy, FHE.and(runwayAtLeast6, FHE.and(repaymentSeasoned, overdueExcellent)))
        );
        ebool tierB = FHE.and(healthyReserve, FHE.and(FHE.or(revenueHealthy, runwayAtLeast3), overdueAcceptable));
        ebool tierC = FHE.and(reserveCoversDebt, overdueWatchlist);

        solvencyVerified = FHE.and(reserveCoversDebt, FHE.or(revenueHealthy, runwayAtLeast3));
        creditTier = FHE.select(
            tierA,
            FHE.asEuint8(3),
            FHE.select(tierB, FHE.asEuint8(2), FHE.select(tierC, FHE.asEuint8(1), FHE.asEuint8(0)))
        );
        euint64 rawMaxCreditLine = FHE.select(
            tierA,
            FHE.asEuint64(50_000),
            FHE.select(tierB, FHE.asEuint64(20_000), FHE.select(tierC, FHE.asEuint64(5_000), FHE.asEuint64(0)))
        );
        maxCreditLine = FHE.select(
            FHE.asEbool(attestationActive),
            rawMaxCreditLine,
            FHE.min(rawMaxCreditLine, FHE.asEuint64(5_000))
        );
        reserveStatus = FHE.select(healthyReserve, FHE.asEuint8(3), FHE.select(reserveCoversDebt, FHE.asEuint8(2), FHE.asEuint8(1)));
        runwayTier = FHE.select(runwayAtLeast6, FHE.asEuint8(3), FHE.select(runwayAtLeast3, FHE.asEuint8(2), FHE.asEuint8(1)));
        riskBand = FHE.select(
            tierA,
            FHE.asEuint8(1),
            FHE.select(tierB, FHE.asEuint8(2), FHE.select(tierC, FHE.asEuint8(3), FHE.asEuint8(4)))
        );
        auditorRequired = FHE.or(FHE.or(FHE.not(healthyReserve), FHE.not(overdueAcceptable)), FHE.not(FHE.asEbool(attestationActive)));
    }

    function _allowResult(address user, RiskProfile storage profile) private {
        FHE.allowThis(profile.solvencyVerified);
        FHE.allowThis(profile.creditTier);
        FHE.allowThis(profile.maxCreditLine);
        FHE.allowThis(profile.reserveStatus);
        FHE.allowThis(profile.runwayTier);
        FHE.allowThis(profile.riskBand);
        FHE.allowThis(profile.auditorRequired);

        FHE.allow(profile.solvencyVerified, user);
        FHE.allow(profile.creditTier, user);
        FHE.allow(profile.maxCreditLine, user);
        FHE.allow(profile.reserveStatus, user);
        FHE.allow(profile.runwayTier, user);
        FHE.allow(profile.riskBand, user);
        FHE.allow(profile.auditorRequired, user);

        FHE.allow(profile.solvencyVerified, msg.sender);
        FHE.allow(profile.creditTier, msg.sender);
        FHE.allow(profile.maxCreditLine, msg.sender);
        FHE.allow(profile.reserveStatus, msg.sender);
        FHE.allow(profile.runwayTier, msg.sender);
        FHE.allow(profile.riskBand, msg.sender);
        FHE.allow(profile.auditorRequired, msg.sender);

        FHE.makePubliclyDecryptable(profile.solvencyVerified);
        FHE.makePubliclyDecryptable(profile.creditTier);
        FHE.makePubliclyDecryptable(profile.maxCreditLine);
        FHE.makePubliclyDecryptable(profile.reserveStatus);
        FHE.makePubliclyDecryptable(profile.runwayTier);
        FHE.makePubliclyDecryptable(profile.riskBand);
        FHE.makePubliclyDecryptable(profile.auditorRequired);
    }
}
