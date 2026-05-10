// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint8, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {SilentScoreEngine} from "./SilentScoreEngine.sol";

contract PrivateLoanVault is ZamaEthereumConfig {
    struct LoanDecision {
        ebool approved;
        euint8 creditTier;
        euint64 maxCreditLine;
        euint64 issuedAmount;
        euint8 reserveStatus;
        euint8 runwayTier;
        euint8 riskBand;
        ebool auditorRequired;
        bool attestationActive;
        uint64 requestedAmount;
        uint64 updatedAt;
        bool exists;
    }

    SilentScoreEngine public immutable scoreEngine;
    mapping(address user => LoanDecision decision) private decisions;

    event LoanRequested(address indexed user, uint64 requestedAmount);
    event LoanDecisionStored(address indexed user);
    event MockRepayment(address indexed user, uint64 amount);

    constructor(address scoreEngineAddress) {
        require(scoreEngineAddress != address(0), "invalid score engine");
        scoreEngine = SilentScoreEngine(scoreEngineAddress);
    }

    function requestLoan(uint64 requestedAmount) external {
        require(requestedAmount > 0, "zero amount");

        (
            ebool approved,
            euint8 creditTier,
            euint64 maxCreditLine,
            euint8 reserveStatus,
            euint8 runwayTier,
            euint8 riskBand,
            ebool auditorRequired,
            bool attestationActive
        ) = scoreEngine.checkLoanRequest(msg.sender, requestedAmount);

        euint64 issuedAmount = FHE.select(approved, FHE.asEuint64(requestedAmount), FHE.asEuint64(0));

        LoanDecision storage decision = decisions[msg.sender];
        decision.approved = approved;
        decision.creditTier = creditTier;
        decision.maxCreditLine = maxCreditLine;
        decision.issuedAmount = issuedAmount;
        decision.reserveStatus = reserveStatus;
        decision.runwayTier = runwayTier;
        decision.riskBand = riskBand;
        decision.auditorRequired = auditorRequired;
        decision.attestationActive = attestationActive;
        decision.requestedAmount = requestedAmount;
        decision.updatedAt = uint64(block.timestamp);
        decision.exists = true;

        _allowDecision(msg.sender, decision);

        emit LoanRequested(msg.sender, requestedAmount);
        emit LoanDecisionStored(msg.sender);
    }

    function repay(uint64 amount) external {
        require(amount > 0, "zero amount");
        emit MockRepayment(msg.sender, amount);
    }

    function getLoanDecision(
        address user
    ) external view returns (
        ebool approved,
        euint8 creditTier,
        euint64 maxCreditLine,
        euint64 issuedAmount,
        euint8 reserveStatus,
        euint8 runwayTier,
        euint8 riskBand,
        ebool auditorRequired,
        bool attestationActive,
        uint64 requestedAmount,
        uint64 updatedAt,
        bool exists
    ) {
        LoanDecision storage decision = decisions[user];
        return (
            decision.approved,
            decision.creditTier,
            decision.maxCreditLine,
            decision.issuedAmount,
            decision.reserveStatus,
            decision.runwayTier,
            decision.riskBand,
            decision.auditorRequired,
            decision.attestationActive,
            decision.requestedAmount,
            decision.updatedAt,
            decision.exists
        );
    }

    function _allowDecision(address user, LoanDecision storage decision) private {
        FHE.allowThis(decision.approved);
        FHE.allowThis(decision.creditTier);
        FHE.allowThis(decision.maxCreditLine);
        FHE.allowThis(decision.issuedAmount);
        FHE.allowThis(decision.reserveStatus);
        FHE.allowThis(decision.runwayTier);
        FHE.allowThis(decision.riskBand);
        FHE.allowThis(decision.auditorRequired);

        FHE.allow(decision.approved, user);
        FHE.allow(decision.creditTier, user);
        FHE.allow(decision.maxCreditLine, user);
        FHE.allow(decision.issuedAmount, user);
        FHE.allow(decision.reserveStatus, user);
        FHE.allow(decision.runwayTier, user);
        FHE.allow(decision.riskBand, user);
        FHE.allow(decision.auditorRequired, user);

        FHE.makePubliclyDecryptable(decision.approved);
        FHE.makePubliclyDecryptable(decision.creditTier);
        FHE.makePubliclyDecryptable(decision.maxCreditLine);
        FHE.makePubliclyDecryptable(decision.issuedAmount);
        FHE.makePubliclyDecryptable(decision.reserveStatus);
        FHE.makePubliclyDecryptable(decision.runwayTier);
        FHE.makePubliclyDecryptable(decision.riskBand);
        FHE.makePubliclyDecryptable(decision.auditorRequired);
    }
}
