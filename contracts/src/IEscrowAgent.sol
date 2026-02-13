// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IEscrowAgent
 * @notice Interface for the EscrowAgent escrow protocol on Base.
 */
interface IEscrowAgent {
    // ──────────────────────────────────────────────────────
    // Enums
    // ──────────────────────────────────────────────────────

    enum EscrowStatus {
        AwaitingProvider, // Created, waiting for agent B to accept
        Active,           // Agent B accepted, work in progress
        ProofSubmitted,   // Agent B says "done", proof submitted
        Completed,        // Verified and funds released
        Disputed,         // One party challenged the outcome
        Resolved,         // Dispute settled by arbitrator
        Expired,          // Deadline passed, no completion
        Cancelled         // Cancelled before acceptance
    }

    enum VerificationType {
        OnChain,          // Proof is a tx hash
        OracleCallback,   // External oracle confirms completion
        MultiSigConfirm,  // Both parties (or arbitrator) confirm
        AutoRelease       // Timer-based release if no dispute
    }

    enum ProofType {
        TransactionSignature,
        OracleAttestation,
        SignedConfirmation
    }

    enum DisputeRulingType {
        PayClient,
        PayProvider,
        Split
    }

    // ──────────────────────────────────────────────────────
    // Structs
    // ──────────────────────────────────────────────────────

    struct Escrow {
        address client;
        address provider;
        address arbitrator;
        address tokenAddress;
        uint256 amount;
        uint16 protocolFeeBps;
        uint16 arbitratorFeeBps;
        bytes32 taskHash;
        VerificationType verificationType;
        uint8 criteriaCount;
        uint64 createdAt;
        uint64 deadline;
        uint64 gracePeriod;
        EscrowStatus status;
        ProofType proofType;
        bool proofSubmitted;
        bytes proofData;
        uint64 proofSubmittedAt;
        address disputeRaisedBy;
    }

    struct DisputeRuling {
        DisputeRulingType rulingType;
        uint16 clientBps;
        uint16 providerBps;
    }

    struct ConfigUpdate {
        address feeAuthority;
        uint16 protocolFeeBps;
        uint16 arbitratorFeeBps;
        uint256 minEscrowAmount;
        uint256 maxEscrowAmount;
        uint64 minGracePeriod;
        uint64 maxDeadlineSeconds;
        bool paused;
        address newAdmin;
        bool updateFeeAuthority;
        bool updateProtocolFeeBps;
        bool updateArbitratorFeeBps;
        bool updateMinEscrowAmount;
        bool updateMaxEscrowAmount;
        bool updateMinGracePeriod;
        bool updateMaxDeadlineSeconds;
        bool updatePaused;
        bool updateAdmin;
    }

    // ──────────────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────────────

    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed client,
        address indexed provider,
        uint256 amount,
        address tokenAddress,
        uint64 deadline,
        bytes32 taskHash,
        VerificationType verificationType
    );

    event EscrowAccepted(uint256 indexed escrowId, address indexed provider, uint64 acceptedAt);

    event EscrowProofSubmitted(uint256 indexed escrowId, address indexed provider, ProofType proofType, uint64 submittedAt);

    event EscrowCompleted(uint256 indexed escrowId, uint256 amountPaid, uint256 feeCollected, uint64 completedAt);

    event EscrowCancelled(uint256 indexed escrowId, address indexed client, uint64 cancelledAt);

    event EscrowExpired(uint256 indexed escrowId, uint64 expiredAt, uint256 refundAmount);

    event DisputeRaised(uint256 indexed escrowId, address indexed raisedBy, uint64 raisedAt);

    event DisputeResolved(
        uint256 indexed escrowId,
        address indexed arbitrator,
        DisputeRulingType ruling,
        uint64 resolvedAt
    );

    // ──────────────────────────────────────────────────────
    // Escrow lifecycle
    // ──────────────────────────────────────────────────────

    function createEscrow(
        address provider,
        address arbitrator,
        address tokenAddress,
        uint256 amount,
        uint64 deadline,
        uint64 gracePeriod,
        bytes32 taskHash,
        VerificationType verificationType,
        uint8 criteriaCount
    ) external returns (uint256 escrowId);

    function acceptEscrow(uint256 escrowId) external;

    function submitProof(uint256 escrowId, ProofType proofType, bytes calldata proofData) external;

    function confirmCompletion(uint256 escrowId) external;

    function cancelEscrow(uint256 escrowId) external;

    function expireEscrow(uint256 escrowId) external;

    function providerRelease(uint256 escrowId) external;

    function raiseDispute(uint256 escrowId) external;

    function resolveDispute(uint256 escrowId, DisputeRuling calldata ruling) external;

    // ──────────────────────────────────────────────────────
    // Admin
    // ──────────────────────────────────────────────────────

    function updateConfig(ConfigUpdate calldata update) external;

    // ──────────────────────────────────────────────────────
    // Views
    // ──────────────────────────────────────────────────────

    function getEscrow(uint256 escrowId) external view returns (Escrow memory);

    function getEscrowByKey(address client, address provider, bytes32 taskHash) external view returns (uint256);

    function nextEscrowId() external view returns (uint256);
}
