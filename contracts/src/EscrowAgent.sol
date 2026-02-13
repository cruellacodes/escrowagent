// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
/**
 * @title EscrowAgent
 * @notice Non-upgradeable version — for testnet/reference only. Use EscrowAgentUUPS for mainnet.
 * @dev Ports the Solana/Anchor EscrowAgent program to EVM. The contract itself acts as the
 *      token custodian (no PDA vaults needed). Uses OpenZeppelin for security primitives.
 */
contract EscrowAgent is ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ──────────────────────────────────────────────────────
    // Types (inline — not using IEscrowAgent to avoid interface drift)
    // ──────────────────────────────────────────────────────

    enum EscrowStatus { AwaitingProvider, Active, ProofSubmitted, Completed, Disputed, Resolved, Expired, Cancelled }
    enum VerificationType { OnChain, OracleCallback, MultiSigConfirm, AutoRelease }
    enum ProofType { TransactionSignature, OracleAttestation, SignedConfirmation }
    enum DisputeRulingType { PayClient, PayProvider, Split }

    struct Escrow {
        address client; address provider; address arbitrator; address tokenAddress;
        uint256 amount; uint16 protocolFeeBps; uint16 arbitratorFeeBps; bytes32 taskHash;
        VerificationType verificationType; uint8 criteriaCount;
        uint64 createdAt; uint64 deadline; uint64 gracePeriod; EscrowStatus status;
        ProofType proofType; bool proofSubmitted; bytes proofData;
        uint64 proofSubmittedAt; address disputeRaisedBy;
    }

    struct DisputeRuling {
        DisputeRulingType rulingType; uint16 clientBps; uint16 providerBps;
    }

    struct ConfigUpdate {
        address feeAuthority; uint16 protocolFeeBps; uint16 arbitratorFeeBps;
        uint256 minEscrowAmount; uint256 maxEscrowAmount;
        uint64 minGracePeriod; uint64 maxDeadlineSeconds; bool paused; address newAdmin;
        bool updateFeeAuthority; bool updateProtocolFeeBps; bool updateArbitratorFeeBps;
        bool updateMinEscrowAmount; bool updateMaxEscrowAmount;
        bool updateMinGracePeriod; bool updateMaxDeadlineSeconds; bool updatePaused; bool updateAdmin;
    }

    // ── Events ──
    event EscrowCreated(uint256 indexed escrowId, address indexed client, address indexed provider, uint256 amount, address tokenAddress, uint64 deadline, bytes32 taskHash, VerificationType verificationType);
    event EscrowAccepted(uint256 indexed escrowId, address indexed provider, uint64 acceptedAt);
    event EscrowProofSubmitted(uint256 indexed escrowId, address indexed provider, ProofType proofType, uint64 submittedAt);
    event EscrowCompleted(uint256 indexed escrowId, uint256 amountPaid, uint256 feeCollected, uint64 completedAt);
    event EscrowCancelled(uint256 indexed escrowId, address indexed client, uint64 cancelledAt);
    event EscrowExpired(uint256 indexed escrowId, uint64 expiredAt, uint256 refundAmount);
    event DisputeRaised(uint256 indexed escrowId, address indexed raisedBy, uint64 raisedAt);
    event DisputeResolved(uint256 indexed escrowId, address indexed arbitrator, DisputeRulingType ruling, uint64 resolvedAt);

    // ──────────────────────────────────────────────────────
    // Errors
    // ──────────────────────────────────────────────────────

    // Creation errors
    error AmountZero();
    error DeadlineInPast();
    error InvalidGracePeriod();
    error FeeTooHigh();
    error BelowMinimumAmount();
    error AboveMaximumAmount();

    // Status errors
    error InvalidStatus();
    error NotAwaitingProvider();
    error NotActive();
    error NoProofSubmitted();

    // Authorization errors
    error UnauthorizedClient();
    error UnauthorizedProvider();
    error UnauthorizedArbitrator();
    error NotParticipant();
    error NoArbitrator();
    error UnauthorizedAdmin();

    // Timing errors
    error DeadlinePassed();
    error NotYetExpired();
    error GracePeriodExpired();

    // Verification errors
    error InvalidProof();
    error VerificationTypeMismatch();

    // Dispute errors
    error InvalidSplitRuling();
    error AlreadyDisputed();

    // Arithmetic / fund errors
    error Overflow();
    error InsufficientFunds();

    // Security errors
    error SelfEscrow();
    error ArbitratorConflict();
    error GracePeriodTooShort();
    error DeadlineTooFar();
    error ConfirmationTimeout();
    error AutoReleaseNotReady();
    error DuplicateEscrow();

    // Protocol errors
    error InvalidFeeAccount();

    // ──────────────────────────────────────────────────────
    // Protocol Config (replaces ProtocolConfig PDA)
    // ──────────────────────────────────────────────────────

    address public admin;
    address public feeAuthority;
    uint16 public protocolFeeBps;
    uint16 public arbitratorFeeBps;
    uint256 public minEscrowAmount;
    uint256 public maxEscrowAmount;
    uint64 public minGracePeriod;
    uint64 public maxDeadlineSeconds;

    // ──────────────────────────────────────────────────────
    // Escrow Storage
    // ──────────────────────────────────────────────────────

    /// @notice Auto-incrementing escrow ID counter
    uint256 public nextEscrowId;

    /// @notice Escrow ID => Escrow data
    mapping(uint256 => Escrow) private _escrows;

    /// @notice keccak256(client, provider, taskHash) => escrowId (for duplicate prevention)
    mapping(bytes32 => uint256) public escrowByKey;

    // ──────────────────────────────────────────────────────
    // Modifiers
    // ──────────────────────────────────────────────────────

    modifier onlyAdmin() {
        if (msg.sender != admin) revert UnauthorizedAdmin();
        _;
    }

    // ──────────────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────────────

    constructor(
        address _admin,
        address _feeAuthority,
        uint16 _protocolFeeBps,
        uint16 _arbitratorFeeBps,
        uint256 _minEscrowAmount,
        uint256 _maxEscrowAmount,
        uint64 _minGracePeriod,
        uint64 _maxDeadlineSeconds
    ) {
        if (_protocolFeeBps > 500) revert FeeTooHigh();
        if (_arbitratorFeeBps > 500) revert FeeTooHigh();
        if (_minEscrowAmount == 0) revert AmountZero();
        if (_maxDeadlineSeconds == 0) revert DeadlineInPast();

        admin = _admin;
        feeAuthority = _feeAuthority;
        protocolFeeBps = _protocolFeeBps;
        arbitratorFeeBps = _arbitratorFeeBps;
        minEscrowAmount = _minEscrowAmount;
        maxEscrowAmount = _maxEscrowAmount;
        minGracePeriod = _minGracePeriod;
        maxDeadlineSeconds = _maxDeadlineSeconds;
        nextEscrowId = 1; // Start at 1 so 0 means "not found"
    }

    // ──────────────────────────────────────────────────────
    // ADMIN
    // ──────────────────────────────────────────────────────

    /// @notice Update protocol configuration. Admin only. Each field is opt-in via bool flags.
    function updateConfig(ConfigUpdate calldata update) external onlyAdmin {
        if (update.updateFeeAuthority) {
            feeAuthority = update.feeAuthority;
        }
        if (update.updateProtocolFeeBps) {
            if (update.protocolFeeBps > 500) revert FeeTooHigh();
            protocolFeeBps = update.protocolFeeBps;
        }
        if (update.updateArbitratorFeeBps) {
            if (update.arbitratorFeeBps > 500) revert FeeTooHigh();
            arbitratorFeeBps = update.arbitratorFeeBps;
        }
        if (update.updateMinEscrowAmount) {
            if (update.minEscrowAmount == 0) revert AmountZero();
            minEscrowAmount = update.minEscrowAmount;
        }
        if (update.updateMaxEscrowAmount) {
            maxEscrowAmount = update.maxEscrowAmount;
        }
        if (update.updateMinGracePeriod) {
            minGracePeriod = update.minGracePeriod;
        }
        if (update.updateMaxDeadlineSeconds) {
            if (update.maxDeadlineSeconds == 0) revert DeadlineInPast();
            maxDeadlineSeconds = update.maxDeadlineSeconds;
        }
        if (update.updatePaused) {
            if (update.paused) {
                _pause();
            } else {
                _unpause();
            }
        }
        if (update.updateAdmin) {
            admin = update.newAdmin;
        }
    }

    // ──────────────────────────────────────────────────────
    // ESCROW LIFECYCLE
    // ──────────────────────────────────────────────────────

    /// @notice Create a new escrow and deposit ERC-20 tokens.
    /// @dev Caller must have approved this contract to spend `amount` of `tokenAddress`.
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
    ) external whenNotPaused returns (uint256 escrowId) {
        // Prevent self-escrow
        if (msg.sender == provider) revert SelfEscrow();

        // Prevent arbitrator conflicts
        if (arbitrator != address(0)) {
            if (arbitrator == msg.sender || arbitrator == provider) revert ArbitratorConflict();
        }

        // Validate amount
        if (amount == 0) revert AmountZero();
        if (amount < minEscrowAmount) revert BelowMinimumAmount();
        if (maxEscrowAmount > 0 && amount > maxEscrowAmount) revert AboveMaximumAmount();

        // Validate timing
        if (deadline <= uint64(block.timestamp)) revert DeadlineInPast();
        if (maxDeadlineSeconds > 0 && deadline > uint64(block.timestamp) + maxDeadlineSeconds) revert DeadlineTooFar();
        if (gracePeriod < minGracePeriod) revert GracePeriodTooShort();

        // Prevent duplicates (mirrors Solana PDA uniqueness)
        bytes32 key = keccak256(abi.encodePacked(msg.sender, provider, taskHash));
        if (escrowByKey[key] != 0) revert DuplicateEscrow();

        // Assign escrow ID
        escrowId = nextEscrowId++;

        // Store escrow
        Escrow storage escrow = _escrows[escrowId];
        escrow.client = msg.sender;
        escrow.provider = provider;
        escrow.arbitrator = arbitrator;
        escrow.tokenAddress = tokenAddress;
        escrow.amount = amount;
        escrow.protocolFeeBps = protocolFeeBps;
        escrow.arbitratorFeeBps = arbitratorFeeBps;
        escrow.taskHash = taskHash;
        escrow.verificationType = verificationType;
        escrow.criteriaCount = criteriaCount;
        escrow.createdAt = uint64(block.timestamp);
        escrow.deadline = deadline;
        escrow.gracePeriod = gracePeriod;
        escrow.status = EscrowStatus.AwaitingProvider;

        // Store reverse lookup
        escrowByKey[key] = escrowId;

        // Transfer tokens from client to contract
        IERC20(tokenAddress).safeTransferFrom(msg.sender, address(this), amount);

        emit EscrowCreated(escrowId, msg.sender, provider, amount, tokenAddress, deadline, taskHash, verificationType);
    }

    /// @notice Provider (Agent B) accepts the escrow task.
    function acceptEscrow(uint256 escrowId) external whenNotPaused {
        Escrow storage escrow = _escrows[escrowId];
        if (escrow.provider != msg.sender) revert UnauthorizedProvider();
        if (escrow.status != EscrowStatus.AwaitingProvider) revert NotAwaitingProvider();
        if (uint64(block.timestamp) >= escrow.deadline) revert DeadlinePassed();

        escrow.status = EscrowStatus.Active;

        emit EscrowAccepted(escrowId, msg.sender, uint64(block.timestamp));
    }

    /// @notice Provider submits proof of task completion.
    function submitProof(uint256 escrowId, ProofType proofType, bytes calldata proofData) external whenNotPaused {
        Escrow storage escrow = _escrows[escrowId];
        if (escrow.provider != msg.sender) revert UnauthorizedProvider();
        if (escrow.status != EscrowStatus.Active) revert NotActive();
        if (uint64(block.timestamp) > escrow.deadline) revert DeadlinePassed();

        escrow.proofType = proofType;
        escrow.proofSubmitted = true;
        escrow.proofData = proofData;
        escrow.proofSubmittedAt = uint64(block.timestamp);
        escrow.status = EscrowStatus.ProofSubmitted;

        emit EscrowProofSubmitted(escrowId, msg.sender, proofType, uint64(block.timestamp));
    }

    /// @notice Client confirms task completion. Releases funds to provider minus protocol fee.
    function confirmCompletion(uint256 escrowId) external whenNotPaused nonReentrant {
        Escrow storage escrow = _escrows[escrowId];
        if (escrow.client != msg.sender) revert UnauthorizedClient();
        if (escrow.status != EscrowStatus.ProofSubmitted) revert NoProofSubmitted();
        if (
            escrow.verificationType != VerificationType.MultiSigConfirm
                && escrow.verificationType != VerificationType.OnChain
        ) revert VerificationTypeMismatch();

        // Calculate fees
        uint256 protocolFee = _calculateFee(escrow.amount, escrow.protocolFeeBps);
        uint256 providerAmount = escrow.amount - protocolFee;

        // Update state before transfers (CEI pattern)
        escrow.status = EscrowStatus.Completed;

        // Transfer to provider
        IERC20(escrow.tokenAddress).safeTransfer(escrow.provider, providerAmount);

        // Transfer protocol fee
        if (protocolFee > 0) {
            IERC20(escrow.tokenAddress).safeTransfer(feeAuthority, protocolFee);
        }

        emit EscrowCompleted(escrowId, providerAmount, protocolFee, uint64(block.timestamp));
    }

    /// @notice Client cancels escrow before provider accepts. Full refund, no fee.
    function cancelEscrow(uint256 escrowId) external whenNotPaused nonReentrant {
        Escrow storage escrow = _escrows[escrowId];
        if (escrow.client != msg.sender) revert UnauthorizedClient();
        if (escrow.status != EscrowStatus.AwaitingProvider) revert InvalidStatus();

        uint256 refundAmount = escrow.amount;

        // Update state before transfer (CEI pattern)
        escrow.status = EscrowStatus.Cancelled;

        // Full refund
        IERC20(escrow.tokenAddress).safeTransfer(escrow.client, refundAmount);

        emit EscrowCancelled(escrowId, msg.sender, uint64(block.timestamp));
    }

    /// @notice Anyone can expire an escrow after deadline + grace period.
    /// @dev ProofSubmitted escrows are protected — cannot be expired.
    function expireEscrow(uint256 escrowId) external whenNotPaused nonReentrant {
        Escrow storage escrow = _escrows[escrowId];
        if (escrow.status != EscrowStatus.Active && escrow.status != EscrowStatus.AwaitingProvider) {
            revert InvalidStatus();
        }
        if (uint64(block.timestamp) <= escrow.deadline + escrow.gracePeriod) revert NotYetExpired();

        uint256 refundAmount = escrow.amount;

        // Update state before transfer (CEI pattern)
        escrow.status = EscrowStatus.Expired;

        // Full refund to client
        IERC20(escrow.tokenAddress).safeTransfer(escrow.client, refundAmount);

        emit EscrowExpired(escrowId, uint64(block.timestamp), refundAmount);
    }

    /// @notice Provider self-releases funds after confirmation timeout (grace period after proof).
    function providerRelease(uint256 escrowId) external whenNotPaused nonReentrant {
        Escrow storage escrow = _escrows[escrowId];
        if (escrow.provider != msg.sender) revert UnauthorizedProvider();
        if (escrow.status != EscrowStatus.ProofSubmitted) revert NoProofSubmitted();
        if (uint64(block.timestamp) <= escrow.proofSubmittedAt + escrow.gracePeriod) revert AutoReleaseNotReady();

        // Calculate fees
        uint256 protocolFee = _calculateFee(escrow.amount, escrow.protocolFeeBps);
        uint256 providerAmount = escrow.amount - protocolFee;

        // Update state before transfers (CEI pattern)
        escrow.status = EscrowStatus.Completed;

        // Transfer to provider
        IERC20(escrow.tokenAddress).safeTransfer(escrow.provider, providerAmount);

        // Transfer protocol fee
        if (protocolFee > 0) {
            IERC20(escrow.tokenAddress).safeTransfer(feeAuthority, protocolFee);
        }

        emit EscrowCompleted(escrowId, providerAmount, protocolFee, uint64(block.timestamp));
    }

    // ──────────────────────────────────────────────────────
    // DISPUTE HANDLING
    // ──────────────────────────────────────────────────────

    /// @notice Either party raises a dispute. Freezes funds and requires arbitrator resolution.
    function raiseDispute(uint256 escrowId) external whenNotPaused {
        Escrow storage escrow = _escrows[escrowId];
        if (escrow.client != msg.sender && escrow.provider != msg.sender) revert NotParticipant();

        // Can only dispute Active or ProofSubmitted
        if (escrow.status != EscrowStatus.Active && escrow.status != EscrowStatus.ProofSubmitted) {
            revert InvalidStatus();
        }

        // Must have an arbitrator assigned
        if (escrow.arbitrator == address(0)) revert NoArbitrator();

        // Verify within grace period if past deadline
        if (uint64(block.timestamp) > escrow.deadline) {
            if (uint64(block.timestamp) > escrow.deadline + escrow.gracePeriod) revert GracePeriodExpired();
        }

        escrow.status = EscrowStatus.Disputed;
        escrow.disputeRaisedBy = msg.sender;

        emit DisputeRaised(escrowId, msg.sender, uint64(block.timestamp));
    }

    /// @notice Arbitrator resolves a dispute with a ruling.
    function resolveDispute(uint256 escrowId, DisputeRuling calldata ruling) external whenNotPaused nonReentrant {
        Escrow storage escrow = _escrows[escrowId];
        if (escrow.arbitrator != msg.sender) revert UnauthorizedArbitrator();
        if (escrow.status != EscrowStatus.Disputed) revert InvalidStatus();

        // Calculate fees
        uint256 protocolFee = _calculateFee(escrow.amount, escrow.protocolFeeBps);
        uint256 arbFee = _calculateFee(escrow.amount, escrow.arbitratorFeeBps);
        uint256 distributable = escrow.amount - protocolFee - arbFee;

        // Update state before transfers (CEI pattern)
        escrow.status = EscrowStatus.Resolved;

        // Distribute based on ruling
        if (ruling.rulingType == DisputeRulingType.PayClient) {
            IERC20(escrow.tokenAddress).safeTransfer(escrow.client, distributable);
        } else if (ruling.rulingType == DisputeRulingType.PayProvider) {
            IERC20(escrow.tokenAddress).safeTransfer(escrow.provider, distributable);
        } else if (ruling.rulingType == DisputeRulingType.Split) {
            if (uint32(ruling.clientBps) + uint32(ruling.providerBps) != 10_000) revert InvalidSplitRuling();

            uint256 clientAmount = (distributable * ruling.clientBps) / 10_000;
            uint256 providerAmount = distributable - clientAmount;

            if (clientAmount > 0) {
                IERC20(escrow.tokenAddress).safeTransfer(escrow.client, clientAmount);
            }
            if (providerAmount > 0) {
                IERC20(escrow.tokenAddress).safeTransfer(escrow.provider, providerAmount);
            }
        }

        // Pay arbitrator fee
        if (arbFee > 0) {
            IERC20(escrow.tokenAddress).safeTransfer(escrow.arbitrator, arbFee);
        }

        // Pay protocol fee
        if (protocolFee > 0) {
            IERC20(escrow.tokenAddress).safeTransfer(feeAuthority, protocolFee);
        }

        emit DisputeResolved(escrowId, msg.sender, ruling.rulingType, uint64(block.timestamp));
    }

    // ──────────────────────────────────────────────────────
    // VIEWS
    // ──────────────────────────────────────────────────────

    /// @notice Get full escrow details by ID.
    function getEscrow(uint256 escrowId) external view returns (Escrow memory) {
        return _escrows[escrowId];
    }

    /// @notice Look up escrow ID by unique key (client + provider + taskHash).
    function getEscrowByKey(address client, address provider, bytes32 taskHash) external view returns (uint256) {
        bytes32 key = keccak256(abi.encodePacked(client, provider, taskHash));
        return escrowByKey[key];
    }

    // ──────────────────────────────────────────────────────
    // INTERNAL
    // ──────────────────────────────────────────────────────

    /// @dev Calculate fee amount from total and basis points. Uses uint256 to avoid overflow.
    function _calculateFee(uint256 amount, uint16 bps) internal pure returns (uint256) {
        return (amount * bps) / 10_000;
    }
}
