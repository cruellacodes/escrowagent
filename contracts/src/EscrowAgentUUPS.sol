// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {IEscrowAgent} from "./IEscrowAgent.sol";

/**
 * @title EscrowAgentUUPS v3
 * @notice Production-hardened upgradeable escrow for agent-to-agent transactions on Base.
 *
 * Audit fixes applied:
 *   C-1: feeAuthority != address(0)         C-2: Two-step admin transfer
 *   C-3: Dispute timeout (expireDispute)     H-1: Fee-on-transfer balance check
 *   H-2: nonReentrant on createEscrow        H-4: escrowByKey cleared on terminal
 *   M-1: maxGracePeriod cap (overflow)       M-5: OracleCallback rejected
 *   UUPS-1: Inline Pausable (no OZ import)   UUPS-2: __gap storage reservation
 *   UUPS-3/4: Updatable maxGracePeriod/disputeTimeout
 *   UUPS-6: minGracePeriod > 0               UUPS-7: maxEscrow >= minEscrow
 *   UUPS-8: Consistent deadline boundary     UUPS-9: Convenience views
 *   I-1: updateAdmin flag rejected           L-1: Config events
 */
contract EscrowAgentUUPS is IEscrowAgent, Initializable, UUPSUpgradeable {
    using SafeERC20 for IERC20;

    // ────────────────────────────────────────────
    // Inline Reentrancy Guard (UUPS-safe)
    // ────────────────────────────────────────────
    uint256 private _reentrancyStatus;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "ReentrancyGuard: reentrant call");
        _reentrancyStatus = _ENTERED;
        _;
        _reentrancyStatus = _NOT_ENTERED;
    }

    // ────────────────────────────────────────────
    // Inline Pausable (UUPS-1: avoids OZ Pausable storage landmine)
    // ────────────────────────────────────────────
    bool private _paused;

    event Paused(address account);
    event Unpaused(address account);

    modifier whenNotPaused() {
        require(!_paused, "Pausable: paused");
        _;
    }

    function paused() public view returns (bool) {
        return _paused;
    }

    function _pause() internal {
        _paused = true;
        emit Paused(msg.sender);
    }

    function _unpause() internal {
        _paused = false;
        emit Unpaused(msg.sender);
    }

    // ────────────────────────────────────────────
    // Errors
    // ────────────────────────────────────────────
    error AmountZero();
    error DeadlineInPast();
    error FeeTooHigh();
    error BelowMinimumAmount();
    error AboveMaximumAmount();
    error InvalidStatus();
    error NotAwaitingProvider();
    error NotActive();
    error NoProofSubmitted();
    error UnauthorizedClient();
    error UnauthorizedProvider();
    error UnauthorizedArbitrator();
    error NotParticipant();
    error NoArbitrator();
    error UnauthorizedAdmin();
    error DeadlinePassed();
    error NotYetExpired();
    error GracePeriodExpired();
    error VerificationTypeMismatch();
    error InvalidSplitRuling();
    error SelfEscrow();
    error ArbitratorConflict();
    error GracePeriodTooShort();
    error GracePeriodTooLong();
    error DeadlineTooFar();
    error AutoReleaseNotReady();
    error DuplicateEscrow();
    error ZeroAddress();
    error InvalidProvider();
    error DisputeNotTimedOut();
    error UnsupportedVerificationType();
    error DisputeTimeoutTooShort();
    error AdminTransferDisabled();

    // Events are inherited from IEscrowAgent:
    // ConfigUpdated, AdminTransferProposed, AdminTransferAccepted, DisputeExpired,
    // EscrowCreated, EscrowAccepted, EscrowCompleted, etc.

    // ────────────────────────────────────────────
    // Storage — NEVER reorder or remove fields!
    // ────────────────────────────────────────────
    address public admin;
    address public pendingAdmin;
    address public feeAuthority;
    uint16 public protocolFeeBps;
    uint16 public arbitratorFeeBps;
    uint256 public minEscrowAmount;
    uint256 public maxEscrowAmount;
    uint64 public minGracePeriod;
    uint64 public maxGracePeriod;
    uint64 public maxDeadlineSeconds;
    uint64 public disputeTimeout;
    uint256 public nextEscrowId;
    mapping(uint256 => Escrow) private _escrows;
    mapping(bytes32 => uint256) public escrowByKey;
    mapping(uint256 => uint64) public disputeRaisedAt;

    // UUPS-2: Reserve 50 storage slots for future upgrades
    uint256[50] private __gap;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ────────────────────────────────────────────
    // Initializer
    // ────────────────────────────────────────────

    function initialize(
        address _admin,
        address _feeAuthority,
        uint16 _protocolFeeBps,
        uint16 _arbitratorFeeBps,
        uint256 _minEscrowAmount,
        uint256 _maxEscrowAmount,
        uint64 _minGracePeriod,
        uint64 _maxDeadlineSeconds
    ) public initializer {
        if (_admin == address(0)) revert ZeroAddress();
        if (_feeAuthority == address(0)) revert ZeroAddress();
        if (_protocolFeeBps > 500) revert FeeTooHigh();
        if (_arbitratorFeeBps > 500) revert FeeTooHigh();
        if (_minEscrowAmount == 0) revert AmountZero();
        if (_minGracePeriod == 0) revert GracePeriodTooShort(); // UUPS-6

        admin = _admin;
        feeAuthority = _feeAuthority;
        protocolFeeBps = _protocolFeeBps;
        arbitratorFeeBps = _arbitratorFeeBps;
        minEscrowAmount = _minEscrowAmount;
        maxEscrowAmount = _maxEscrowAmount;
        minGracePeriod = _minGracePeriod;
        maxGracePeriod = 30 days;
        maxDeadlineSeconds = _maxDeadlineSeconds;
        disputeTimeout = 7 days;
        nextEscrowId = 1;
        _reentrancyStatus = _NOT_ENTERED;
        _paused = false;
    }

    function _authorizeUpgrade(address) internal view override {
        if (msg.sender != admin) revert UnauthorizedAdmin();
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert UnauthorizedAdmin();
        _;
    }

    // ────────────────────────────────────────────
    // ADMIN
    // ────────────────────────────────────────────

    function proposeAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        pendingAdmin = newAdmin;
        emit AdminTransferProposed(admin, newAdmin);
    }

    function acceptAdmin() external {
        if (msg.sender != pendingAdmin) revert UnauthorizedAdmin();
        address oldAdmin = admin;
        admin = pendingAdmin;
        pendingAdmin = address(0);
        emit AdminTransferAccepted(oldAdmin, admin);
    }

    function updateConfig(ConfigUpdate calldata u) external onlyAdmin {
        if (u.updateFeeAuthority) {
            if (u.feeAuthority == address(0)) revert ZeroAddress();
            feeAuthority = u.feeAuthority;
            emit ConfigUpdated(msg.sender, "feeAuthority");
        }
        if (u.updateProtocolFeeBps) {
            if (u.protocolFeeBps > 500) revert FeeTooHigh();
            protocolFeeBps = u.protocolFeeBps;
            emit ConfigUpdated(msg.sender, "protocolFeeBps");
        }
        if (u.updateArbitratorFeeBps) {
            if (u.arbitratorFeeBps > 500) revert FeeTooHigh();
            arbitratorFeeBps = u.arbitratorFeeBps;
            emit ConfigUpdated(msg.sender, "arbitratorFeeBps");
        }
        if (u.updateMinEscrowAmount) {
            if (u.minEscrowAmount == 0) revert AmountZero();
            minEscrowAmount = u.minEscrowAmount;
            emit ConfigUpdated(msg.sender, "minEscrowAmount");
        }
        if (u.updateMaxEscrowAmount) {
            // UUPS-7: Cross-validate
            if (u.maxEscrowAmount > 0 && u.maxEscrowAmount < minEscrowAmount) revert BelowMinimumAmount();
            maxEscrowAmount = u.maxEscrowAmount;
            emit ConfigUpdated(msg.sender, "maxEscrowAmount");
        }
        if (u.updateMinGracePeriod) {
            if (u.minGracePeriod == 0) revert GracePeriodTooShort();
            minGracePeriod = u.minGracePeriod;
            emit ConfigUpdated(msg.sender, "minGracePeriod");
        }
        if (u.updateMaxGracePeriod) {
            if (u.maxGracePeriod == 0) revert GracePeriodTooShort();
            maxGracePeriod = u.maxGracePeriod;
            emit ConfigUpdated(msg.sender, "maxGracePeriod");
        }
        if (u.updateMaxDeadlineSeconds) {
            if (u.maxDeadlineSeconds == 0) revert DeadlineInPast();
            maxDeadlineSeconds = u.maxDeadlineSeconds;
            emit ConfigUpdated(msg.sender, "maxDeadlineSeconds");
        }
        if (u.updateDisputeTimeout) {
            if (u.disputeTimeout < 1 days) revert DisputeTimeoutTooShort();
            disputeTimeout = u.disputeTimeout;
            emit ConfigUpdated(msg.sender, "disputeTimeout");
        }
        if (u.updatePaused) {
            if (u.paused) _pause();
            else _unpause();
            emit ConfigUpdated(msg.sender, "paused");
        }
    }

    // ────────────────────────────────────────────
    // ESCROW LIFECYCLE
    // ────────────────────────────────────────────

    function createEscrow(
        address provider, address arbitrator, address tokenAddress,
        uint256 amount, uint64 deadline, uint64 gracePeriod,
        bytes32 taskHash, VerificationType verificationType, uint8 criteriaCount
    ) external whenNotPaused nonReentrant returns (uint256 escrowId) {
        if (provider == address(0)) revert InvalidProvider();
        if (msg.sender == provider) revert SelfEscrow();
        if (arbitrator != address(0) && (arbitrator == msg.sender || arbitrator == provider)) revert ArbitratorConflict();
        if (amount == 0) revert AmountZero();
        if (amount < minEscrowAmount) revert BelowMinimumAmount();
        if (maxEscrowAmount > 0 && amount > maxEscrowAmount) revert AboveMaximumAmount();
        if (deadline <= uint64(block.timestamp)) revert DeadlineInPast();
        if (maxDeadlineSeconds > 0 && deadline > uint64(block.timestamp) + maxDeadlineSeconds) revert DeadlineTooFar();
        if (gracePeriod < minGracePeriod) revert GracePeriodTooShort();
        if (gracePeriod > maxGracePeriod) revert GracePeriodTooLong();
        if (verificationType == VerificationType.OracleCallback) revert UnsupportedVerificationType();

        bytes32 key = keccak256(abi.encodePacked(msg.sender, provider, taskHash));
        if (escrowByKey[key] != 0) revert DuplicateEscrow();

        escrowId = nextEscrowId++;

        // H-1: Measure actual tokens received
        uint256 balanceBefore = IERC20(tokenAddress).balanceOf(address(this));
        IERC20(tokenAddress).safeTransferFrom(msg.sender, address(this), amount);
        uint256 actualReceived = IERC20(tokenAddress).balanceOf(address(this)) - balanceBefore;

        Escrow storage e = _escrows[escrowId];
        e.client = msg.sender;
        e.provider = provider;
        e.arbitrator = arbitrator;
        e.tokenAddress = tokenAddress;
        e.amount = actualReceived;
        e.protocolFeeBps = protocolFeeBps;
        e.arbitratorFeeBps = arbitratorFeeBps;
        e.taskHash = taskHash;
        e.verificationType = verificationType;
        e.criteriaCount = criteriaCount;
        e.createdAt = uint64(block.timestamp);
        e.deadline = deadline;
        e.gracePeriod = gracePeriod;
        e.status = EscrowStatus.AwaitingProvider;

        escrowByKey[key] = escrowId;
        emit EscrowCreated(escrowId, msg.sender, provider, actualReceived, tokenAddress, deadline, taskHash, verificationType);
    }

    function acceptEscrow(uint256 escrowId) external whenNotPaused {
        Escrow storage e = _escrows[escrowId];
        if (e.provider != msg.sender) revert UnauthorizedProvider();
        if (e.status != EscrowStatus.AwaitingProvider) revert NotAwaitingProvider();
        // UUPS-8: Use > (consistent with submitProof)
        if (uint64(block.timestamp) > e.deadline) revert DeadlinePassed();
        e.status = EscrowStatus.Active;
        emit EscrowAccepted(escrowId, msg.sender, uint64(block.timestamp));
    }

    function submitProof(uint256 escrowId, ProofType proofType, bytes calldata proofData) external whenNotPaused {
        Escrow storage e = _escrows[escrowId];
        if (e.provider != msg.sender) revert UnauthorizedProvider();
        if (e.status != EscrowStatus.Active) revert NotActive();
        if (uint64(block.timestamp) > e.deadline) revert DeadlinePassed();
        e.proofType = proofType;
        e.proofSubmitted = true;
        e.proofData = proofData;
        e.proofSubmittedAt = uint64(block.timestamp);
        e.status = EscrowStatus.ProofSubmitted;
        emit EscrowProofSubmitted(escrowId, msg.sender, proofType, uint64(block.timestamp));
    }

    function confirmCompletion(uint256 escrowId) external whenNotPaused nonReentrant {
        Escrow storage e = _escrows[escrowId];
        if (e.client != msg.sender) revert UnauthorizedClient();
        if (e.status != EscrowStatus.ProofSubmitted) revert NoProofSubmitted();
        if (e.verificationType != VerificationType.MultiSigConfirm && e.verificationType != VerificationType.OnChain)
            revert VerificationTypeMismatch();
        uint256 pFee = _calculateFee(e.amount, e.protocolFeeBps);
        uint256 providerAmount = e.amount - pFee;
        e.status = EscrowStatus.Completed;
        _clearEscrowKey(e);
        IERC20(e.tokenAddress).safeTransfer(e.provider, providerAmount);
        if (pFee > 0) IERC20(e.tokenAddress).safeTransfer(feeAuthority, pFee);
        emit EscrowCompleted(escrowId, providerAmount, pFee, uint64(block.timestamp));
    }

    function cancelEscrow(uint256 escrowId) external whenNotPaused nonReentrant {
        Escrow storage e = _escrows[escrowId];
        if (e.client != msg.sender) revert UnauthorizedClient();
        if (e.status != EscrowStatus.AwaitingProvider) revert InvalidStatus();
        uint256 refund = e.amount;
        e.status = EscrowStatus.Cancelled;
        _clearEscrowKey(e);
        IERC20(e.tokenAddress).safeTransfer(e.client, refund);
        emit EscrowCancelled(escrowId, msg.sender, uint64(block.timestamp));
    }

    function expireEscrow(uint256 escrowId) external whenNotPaused nonReentrant {
        Escrow storage e = _escrows[escrowId];
        if (e.status != EscrowStatus.Active && e.status != EscrowStatus.AwaitingProvider) revert InvalidStatus();
        if (uint64(block.timestamp) <= e.deadline + e.gracePeriod) revert NotYetExpired();
        uint256 refund = e.amount;
        e.status = EscrowStatus.Expired;
        _clearEscrowKey(e);
        IERC20(e.tokenAddress).safeTransfer(e.client, refund);
        emit EscrowExpired(escrowId, uint64(block.timestamp), refund);
    }

    function providerRelease(uint256 escrowId) external whenNotPaused nonReentrant {
        Escrow storage e = _escrows[escrowId];
        if (e.provider != msg.sender) revert UnauthorizedProvider();
        if (e.status != EscrowStatus.ProofSubmitted) revert NoProofSubmitted();
        if (uint64(block.timestamp) <= e.proofSubmittedAt + e.gracePeriod) revert AutoReleaseNotReady();
        uint256 pFee = _calculateFee(e.amount, e.protocolFeeBps);
        uint256 providerAmount = e.amount - pFee;
        e.status = EscrowStatus.Completed;
        _clearEscrowKey(e);
        IERC20(e.tokenAddress).safeTransfer(e.provider, providerAmount);
        if (pFee > 0) IERC20(e.tokenAddress).safeTransfer(feeAuthority, pFee);
        emit EscrowCompleted(escrowId, providerAmount, pFee, uint64(block.timestamp));
    }

    // ────────────────────────────────────────────
    // DISPUTES
    // ────────────────────────────────────────────

    function raiseDispute(uint256 escrowId) external whenNotPaused {
        Escrow storage e = _escrows[escrowId];
        if (e.client != msg.sender && e.provider != msg.sender) revert NotParticipant();
        if (e.status != EscrowStatus.Active && e.status != EscrowStatus.ProofSubmitted) revert InvalidStatus();
        if (e.arbitrator == address(0)) revert NoArbitrator();
        if (uint64(block.timestamp) > e.deadline + e.gracePeriod) revert GracePeriodExpired();
        e.status = EscrowStatus.Disputed;
        e.disputeRaisedBy = msg.sender;
        disputeRaisedAt[escrowId] = uint64(block.timestamp);
        emit DisputeRaised(escrowId, msg.sender, uint64(block.timestamp));
    }

    function resolveDispute(uint256 escrowId, DisputeRuling calldata ruling) external whenNotPaused nonReentrant {
        Escrow storage e = _escrows[escrowId];
        if (e.arbitrator != msg.sender) revert UnauthorizedArbitrator();
        if (e.status != EscrowStatus.Disputed) revert InvalidStatus();

        uint256 pFee = _calculateFee(e.amount, e.protocolFeeBps);
        uint256 arbFee = _calculateFee(e.amount, e.arbitratorFeeBps);
        uint256 distributable = e.amount - pFee - arbFee;
        e.status = EscrowStatus.Resolved;
        _clearEscrowKey(e);

        if (ruling.rulingType == DisputeRulingType.PayClient) {
            IERC20(e.tokenAddress).safeTransfer(e.client, distributable);
        } else if (ruling.rulingType == DisputeRulingType.PayProvider) {
            IERC20(e.tokenAddress).safeTransfer(e.provider, distributable);
        } else if (ruling.rulingType == DisputeRulingType.Split) {
            if (uint32(ruling.clientBps) + uint32(ruling.providerBps) != 10_000) revert InvalidSplitRuling();
            uint256 clientAmt = (distributable * ruling.clientBps) / 10_000;
            uint256 providerAmt = distributable - clientAmt;
            if (clientAmt > 0) IERC20(e.tokenAddress).safeTransfer(e.client, clientAmt);
            if (providerAmt > 0) IERC20(e.tokenAddress).safeTransfer(e.provider, providerAmt);
        }

        if (arbFee > 0) IERC20(e.tokenAddress).safeTransfer(e.arbitrator, arbFee);
        if (pFee > 0) IERC20(e.tokenAddress).safeTransfer(feeAuthority, pFee);
        emit DisputeResolved(escrowId, msg.sender, ruling.rulingType, uint64(block.timestamp));
    }

    /// @notice C-3: Anyone can expire a dispute after the timeout. Refunds client.
    function expireDispute(uint256 escrowId) external whenNotPaused nonReentrant {
        Escrow storage e = _escrows[escrowId];
        if (e.status != EscrowStatus.Disputed) revert InvalidStatus();
        if (uint64(block.timestamp) <= disputeRaisedAt[escrowId] + disputeTimeout) revert DisputeNotTimedOut();

        uint256 pFee = _calculateFee(e.amount, e.protocolFeeBps);
        uint256 clientRefund = e.amount - pFee;
        e.status = EscrowStatus.Resolved;
        _clearEscrowKey(e);

        IERC20(e.tokenAddress).safeTransfer(e.client, clientRefund);
        if (pFee > 0) IERC20(e.tokenAddress).safeTransfer(feeAuthority, pFee);
        emit DisputeExpired(escrowId, uint64(block.timestamp));
    }

    // ────────────────────────────────────────────
    // VIEWS (UUPS-9)
    // ────────────────────────────────────────────

    function getEscrow(uint256 escrowId) external view returns (Escrow memory) {
        return _escrows[escrowId];
    }

    function getEscrowByKey(address client, address provider, bytes32 taskHash) external view returns (uint256) {
        return escrowByKey[keccak256(abi.encodePacked(client, provider, taskHash))];
    }

    function isDisputeTimedOut(uint256 escrowId) external view returns (bool) {
        return _escrows[escrowId].status == EscrowStatus.Disputed
            && uint64(block.timestamp) > disputeRaisedAt[escrowId] + disputeTimeout;
    }

    function getEscrowCount() external view returns (uint256) {
        return nextEscrowId > 0 ? nextEscrowId - 1 : 0;
    }

    function getProtocolConfig() external view returns (
        address _admin,
        address _pendingAdmin,
        address _feeAuthority,
        uint16 _protocolFeeBps,
        uint16 _arbitratorFeeBps,
        uint256 _minEscrowAmount,
        uint256 _maxEscrowAmount,
        uint64 _minGracePeriod,
        uint64 _maxGracePeriod,
        uint64 _maxDeadlineSeconds,
        uint64 _disputeTimeout,
        bool _paused
    ) {
        return (
            admin, pendingAdmin, feeAuthority,
            protocolFeeBps, arbitratorFeeBps,
            minEscrowAmount, maxEscrowAmount,
            minGracePeriod, maxGracePeriod,
            maxDeadlineSeconds, disputeTimeout,
            _paused
        );
    }

    // ────────────────────────────────────────────
    // INTERNAL
    // ────────────────────────────────────────────

    function _calculateFee(uint256 amount, uint16 bps) internal pure returns (uint256) {
        return (amount * bps) / 10_000;
    }

    function _clearEscrowKey(Escrow storage e) internal {
        bytes32 key = keccak256(abi.encodePacked(e.client, e.provider, e.taskHash));
        delete escrowByKey[key];
    }

    function version() external pure returns (string memory) {
        return "3.0.0-uups";
    }
}
