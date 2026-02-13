// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {EscrowAgent} from "../src/EscrowAgent.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Mock ERC-20 token for testing (simulates USDC)
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

contract EscrowAgentTest is Test {
    EscrowAgent public escrowAgent;
    MockUSDC public usdc;

    address admin = makeAddr("admin");
    address feeWallet = makeAddr("feeWallet");
    address client = makeAddr("client");
    address provider = makeAddr("provider");
    address arbitrator = makeAddr("arbitrator");

    uint256 constant ESCROW_AMOUNT = 50_000_000; // 50 USDC
    uint64 constant TEN_MINUTES = 600;
    uint64 constant GRACE_PERIOD = 300; // 5 min

    bytes32 taskHash = keccak256("test-task-hash-for-swap-execution");

    function setUp() public {
        // Deploy mock USDC
        usdc = new MockUSDC();

        // Deploy EscrowAgent
        escrowAgent = new EscrowAgent(
            admin,           // admin
            feeWallet,       // feeAuthority
            50,              // protocolFeeBps (0.5%)
            100,             // arbitratorFeeBps (1.0%)
            1000,            // minEscrowAmount
            0,               // maxEscrowAmount (no limit)
            300,             // minGracePeriod (5 min)
            604800           // maxDeadlineSeconds (7 days)
        );

        // Fund client with USDC
        usdc.mint(client, 1_000_000_000); // 1000 USDC
        vm.prank(client);
        usdc.approve(address(escrowAgent), type(uint256).max);
    }

    // ──────────────────────────────────────────────────────
    // PROTOCOL CONFIG TESTS
    // ──────────────────────────────────────────────────────

    function test_Constructor() public view {
        assertEq(escrowAgent.admin(), admin);
        assertEq(escrowAgent.feeAuthority(), feeWallet);
        assertEq(escrowAgent.protocolFeeBps(), 50);
        assertEq(escrowAgent.arbitratorFeeBps(), 100);
        assertEq(escrowAgent.minEscrowAmount(), 1000);
        assertEq(escrowAgent.maxEscrowAmount(), 0);
        assertEq(escrowAgent.minGracePeriod(), 300);
        assertEq(escrowAgent.maxDeadlineSeconds(), 604800);
        assertEq(escrowAgent.nextEscrowId(), 1);
    }

    function test_UpdateConfig() public {
        EscrowAgent.ConfigUpdate memory update;
        update.protocolFeeBps = 100;
        update.updateProtocolFeeBps = true;

        vm.prank(admin);
        escrowAgent.updateConfig(update);

        assertEq(escrowAgent.protocolFeeBps(), 100);
    }

    function test_UpdateConfig_RevertIfNotAdmin() public {
        EscrowAgent.ConfigUpdate memory update;
        update.protocolFeeBps = 100;
        update.updateProtocolFeeBps = true;

        vm.prank(client);
        vm.expectRevert(EscrowAgent.UnauthorizedAdmin.selector);
        escrowAgent.updateConfig(update);
    }

    function test_PauseAndUnpause() public {
        // Pause
        EscrowAgent.ConfigUpdate memory pauseUpdate;
        pauseUpdate.paused = true;
        pauseUpdate.updatePaused = true;

        vm.prank(admin);
        escrowAgent.updateConfig(pauseUpdate);

        // Try to create escrow — should fail
        vm.prank(client);
        vm.expectRevert(); // EnforcedPause
        escrowAgent.createEscrow(
            provider,
            arbitrator,
            address(usdc),
            ESCROW_AMOUNT,
            uint64(block.timestamp) + TEN_MINUTES,
            GRACE_PERIOD,
            taskHash,
            EscrowAgent.VerificationType.MultiSigConfirm,
            1
        );

        // Unpause
        EscrowAgent.ConfigUpdate memory unpauseUpdate;
        unpauseUpdate.paused = false;
        unpauseUpdate.updatePaused = true;

        vm.prank(admin);
        escrowAgent.updateConfig(unpauseUpdate);

        // Now create should work
        vm.prank(client);
        uint256 id = escrowAgent.createEscrow(
            provider,
            arbitrator,
            address(usdc),
            ESCROW_AMOUNT,
            uint64(block.timestamp) + TEN_MINUTES,
            GRACE_PERIOD,
            taskHash,
            EscrowAgent.VerificationType.MultiSigConfirm,
            1
        );
        assertEq(id, 1);
    }

    // ──────────────────────────────────────────────────────
    // HAPPY PATH (MultiSig Verification)
    // ──────────────────────────────────────────────────────

    function test_HappyPath_CreateAcceptProofConfirm() public {
        // 1. Create escrow
        vm.prank(client);
        uint256 escrowId = escrowAgent.createEscrow(
            provider,
            arbitrator,
            address(usdc),
            ESCROW_AMOUNT,
            uint64(block.timestamp) + TEN_MINUTES,
            GRACE_PERIOD,
            taskHash,
            EscrowAgent.VerificationType.MultiSigConfirm,
            1
        );
        assertEq(escrowId, 1);

        // Verify escrow state
        EscrowAgent.Escrow memory e = escrowAgent.getEscrow(escrowId);
        assertEq(e.client, client);
        assertEq(e.provider, provider);
        assertEq(e.amount, ESCROW_AMOUNT);
        assertEq(uint8(e.status), uint8(EscrowAgent.EscrowStatus.AwaitingProvider));

        // Verify tokens moved to contract
        assertEq(usdc.balanceOf(address(escrowAgent)), ESCROW_AMOUNT);
        assertEq(usdc.balanceOf(client), 1_000_000_000 - ESCROW_AMOUNT);

        // 2. Accept escrow
        vm.prank(provider);
        escrowAgent.acceptEscrow(escrowId);

        e = escrowAgent.getEscrow(escrowId);
        assertEq(uint8(e.status), uint8(EscrowAgent.EscrowStatus.Active));

        // 3. Submit proof
        bytes memory proof = abi.encodePacked("tx-signature-proof-data-here");
        vm.prank(provider);
        escrowAgent.submitProof(escrowId, EscrowAgent.ProofType.TransactionSignature, proof);

        e = escrowAgent.getEscrow(escrowId);
        assertEq(uint8(e.status), uint8(EscrowAgent.EscrowStatus.ProofSubmitted));
        assertTrue(e.proofSubmitted);

        // 4. Confirm completion
        uint256 providerBalanceBefore = usdc.balanceOf(provider);
        uint256 feeBalanceBefore = usdc.balanceOf(feeWallet);

        vm.prank(client);
        escrowAgent.confirmCompletion(escrowId);

        e = escrowAgent.getEscrow(escrowId);
        assertEq(uint8(e.status), uint8(EscrowAgent.EscrowStatus.Completed));

        // Verify payouts: 0.5% fee = 250_000, provider gets 49_750_000
        uint256 expectedFee = (ESCROW_AMOUNT * 50) / 10_000; // 250_000
        uint256 expectedProvider = ESCROW_AMOUNT - expectedFee; // 49_750_000

        assertEq(usdc.balanceOf(provider) - providerBalanceBefore, expectedProvider);
        assertEq(usdc.balanceOf(feeWallet) - feeBalanceBefore, expectedFee);
        assertEq(usdc.balanceOf(address(escrowAgent)), 0);
    }

    function test_CreateEscrow_EmitsEvent() public {
        vm.prank(client);
        vm.expectEmit(true, true, true, true);
        emit EscrowAgent.EscrowCreated(
            1,
            client,
            provider,
            ESCROW_AMOUNT,
            address(usdc),
            uint64(block.timestamp) + TEN_MINUTES,
            taskHash,
            EscrowAgent.VerificationType.MultiSigConfirm
        );
        escrowAgent.createEscrow(
            provider,
            arbitrator,
            address(usdc),
            ESCROW_AMOUNT,
            uint64(block.timestamp) + TEN_MINUTES,
            GRACE_PERIOD,
            taskHash,
            EscrowAgent.VerificationType.MultiSigConfirm,
            1
        );
    }

    function test_GetEscrowByKey() public {
        vm.prank(client);
        uint256 escrowId = escrowAgent.createEscrow(
            provider,
            arbitrator,
            address(usdc),
            ESCROW_AMOUNT,
            uint64(block.timestamp) + TEN_MINUTES,
            GRACE_PERIOD,
            taskHash,
            EscrowAgent.VerificationType.MultiSigConfirm,
            1
        );

        uint256 lookupId = escrowAgent.getEscrowByKey(client, provider, taskHash);
        assertEq(lookupId, escrowId);
    }

    // ──────────────────────────────────────────────────────
    // VALIDATION TESTS
    // ──────────────────────────────────────────────────────

    function test_CreateEscrow_RevertSelfEscrow() public {
        vm.prank(client);
        vm.expectRevert(EscrowAgent.SelfEscrow.selector);
        escrowAgent.createEscrow(
            client, // same as msg.sender
            arbitrator,
            address(usdc),
            ESCROW_AMOUNT,
            uint64(block.timestamp) + TEN_MINUTES,
            GRACE_PERIOD,
            taskHash,
            EscrowAgent.VerificationType.MultiSigConfirm,
            1
        );
    }

    function test_CreateEscrow_RevertBelowMinimum() public {
        vm.prank(client);
        vm.expectRevert(EscrowAgent.BelowMinimumAmount.selector);
        escrowAgent.createEscrow(
            provider,
            arbitrator,
            address(usdc),
            100, // below 1000 minimum
            uint64(block.timestamp) + TEN_MINUTES,
            GRACE_PERIOD,
            taskHash,
            EscrowAgent.VerificationType.MultiSigConfirm,
            1
        );
    }

    function test_CreateEscrow_RevertDuplicate() public {
        vm.prank(client);
        escrowAgent.createEscrow(
            provider,
            arbitrator,
            address(usdc),
            ESCROW_AMOUNT,
            uint64(block.timestamp) + TEN_MINUTES,
            GRACE_PERIOD,
            taskHash,
            EscrowAgent.VerificationType.MultiSigConfirm,
            1
        );

        vm.prank(client);
        vm.expectRevert(EscrowAgent.DuplicateEscrow.selector);
        escrowAgent.createEscrow(
            provider,
            arbitrator,
            address(usdc),
            ESCROW_AMOUNT,
            uint64(block.timestamp) + TEN_MINUTES,
            GRACE_PERIOD,
            taskHash, // same key
            EscrowAgent.VerificationType.MultiSigConfirm,
            1
        );
    }

    // ──────────────────────────────────────────────────────
    // CANCELLATION FLOW
    // ──────────────────────────────────────────────────────

    function test_CancelEscrow_FullRefund() public {
        uint256 clientBalanceBefore = usdc.balanceOf(client);

        // Create
        vm.prank(client);
        uint256 escrowId = escrowAgent.createEscrow(
            provider,
            arbitrator,
            address(usdc),
            ESCROW_AMOUNT,
            uint64(block.timestamp) + TEN_MINUTES,
            GRACE_PERIOD,
            taskHash,
            EscrowAgent.VerificationType.MultiSigConfirm,
            1
        );

        assertEq(usdc.balanceOf(client), clientBalanceBefore - ESCROW_AMOUNT);

        // Cancel
        vm.prank(client);
        escrowAgent.cancelEscrow(escrowId);

        EscrowAgent.Escrow memory e = escrowAgent.getEscrow(escrowId);
        assertEq(uint8(e.status), uint8(EscrowAgent.EscrowStatus.Cancelled));

        // Full refund — no fees
        assertEq(usdc.balanceOf(client), clientBalanceBefore);
        assertEq(usdc.balanceOf(address(escrowAgent)), 0);
    }

    function test_CancelEscrow_RevertAfterAccept() public {
        vm.prank(client);
        uint256 escrowId = escrowAgent.createEscrow(
            provider,
            arbitrator,
            address(usdc),
            ESCROW_AMOUNT,
            uint64(block.timestamp) + TEN_MINUTES,
            GRACE_PERIOD,
            taskHash,
            EscrowAgent.VerificationType.MultiSigConfirm,
            1
        );

        vm.prank(provider);
        escrowAgent.acceptEscrow(escrowId);

        // Cannot cancel after acceptance
        vm.prank(client);
        vm.expectRevert(EscrowAgent.InvalidStatus.selector);
        escrowAgent.cancelEscrow(escrowId);
    }

    // ──────────────────────────────────────────────────────
    // EXPIRY FLOW
    // ──────────────────────────────────────────────────────

    function test_ExpireEscrow_AfterDeadlinePlusGrace() public {
        uint256 clientBalanceBefore = usdc.balanceOf(client);

        vm.prank(client);
        uint256 escrowId = escrowAgent.createEscrow(
            provider,
            arbitrator,
            address(usdc),
            ESCROW_AMOUNT,
            uint64(block.timestamp) + TEN_MINUTES,
            GRACE_PERIOD,
            taskHash,
            EscrowAgent.VerificationType.MultiSigConfirm,
            1
        );

        // Warp past deadline + grace period
        vm.warp(block.timestamp + TEN_MINUTES + GRACE_PERIOD + 1);

        // Anyone can expire
        address random = makeAddr("random");
        vm.prank(random);
        escrowAgent.expireEscrow(escrowId);

        EscrowAgent.Escrow memory e = escrowAgent.getEscrow(escrowId);
        assertEq(uint8(e.status), uint8(EscrowAgent.EscrowStatus.Expired));
        assertEq(usdc.balanceOf(client), clientBalanceBefore);
    }

    function test_ExpireEscrow_RevertIfNotExpired() public {
        vm.prank(client);
        uint256 escrowId = escrowAgent.createEscrow(
            provider,
            arbitrator,
            address(usdc),
            ESCROW_AMOUNT,
            uint64(block.timestamp) + TEN_MINUTES,
            GRACE_PERIOD,
            taskHash,
            EscrowAgent.VerificationType.MultiSigConfirm,
            1
        );

        vm.expectRevert(EscrowAgent.NotYetExpired.selector);
        escrowAgent.expireEscrow(escrowId);
    }

    // ──────────────────────────────────────────────────────
    // PROVIDER RELEASE FLOW
    // ──────────────────────────────────────────────────────

    function test_ProviderRelease_AfterGracePeriod() public {
        // Create + Accept + Proof
        vm.prank(client);
        uint256 escrowId = escrowAgent.createEscrow(
            provider,
            arbitrator,
            address(usdc),
            ESCROW_AMOUNT,
            uint64(block.timestamp) + TEN_MINUTES,
            GRACE_PERIOD,
            taskHash,
            EscrowAgent.VerificationType.MultiSigConfirm,
            1
        );

        vm.prank(provider);
        escrowAgent.acceptEscrow(escrowId);

        vm.prank(provider);
        escrowAgent.submitProof(escrowId, EscrowAgent.ProofType.TransactionSignature, "proof");

        // Warp past grace period
        vm.warp(block.timestamp + GRACE_PERIOD + 1);

        uint256 providerBalanceBefore = usdc.balanceOf(provider);
        vm.prank(provider);
        escrowAgent.providerRelease(escrowId);

        uint256 expectedFee = (ESCROW_AMOUNT * 50) / 10_000;
        uint256 expectedProvider = ESCROW_AMOUNT - expectedFee;
        assertEq(usdc.balanceOf(provider) - providerBalanceBefore, expectedProvider);
    }

    // ──────────────────────────────────────────────────────
    // DISPUTE FLOW
    // ──────────────────────────────────────────────────────

    function test_DisputeFlow_RaiseAndResolve_Split() public {
        // Create + Accept + Proof
        vm.prank(client);
        uint256 escrowId = escrowAgent.createEscrow(
            provider,
            arbitrator,
            address(usdc),
            ESCROW_AMOUNT,
            uint64(block.timestamp) + TEN_MINUTES,
            GRACE_PERIOD,
            taskHash,
            EscrowAgent.VerificationType.MultiSigConfirm,
            1
        );

        vm.prank(provider);
        escrowAgent.acceptEscrow(escrowId);

        vm.prank(provider);
        escrowAgent.submitProof(escrowId, EscrowAgent.ProofType.TransactionSignature, "proof");

        // Client raises dispute
        vm.prank(client);
        escrowAgent.raiseDispute(escrowId);

        EscrowAgent.Escrow memory e = escrowAgent.getEscrow(escrowId);
        assertEq(uint8(e.status), uint8(EscrowAgent.EscrowStatus.Disputed));
        assertEq(e.disputeRaisedBy, client);

        // Arbitrator resolves with 50/50 split
        uint256 clientBefore = usdc.balanceOf(client);
        uint256 providerBefore = usdc.balanceOf(provider);
        uint256 arbBefore = usdc.balanceOf(arbitrator);
        uint256 feeBefore = usdc.balanceOf(feeWallet);

        EscrowAgent.DisputeRuling memory ruling = EscrowAgent.DisputeRuling({
            rulingType: EscrowAgent.DisputeRulingType.Split,
            clientBps: 5000,
            providerBps: 5000
        });

        vm.prank(arbitrator);
        escrowAgent.resolveDispute(escrowId, ruling);

        e = escrowAgent.getEscrow(escrowId);
        assertEq(uint8(e.status), uint8(EscrowAgent.EscrowStatus.Resolved));

        // Verify payouts:
        // protocol fee: 0.5% = 250_000
        // arbitrator fee: 1.0% = 500_000
        // distributable: 50_000_000 - 250_000 - 500_000 = 49_250_000
        // client: 50% of 49_250_000 = 24_625_000
        // provider: 49_250_000 - 24_625_000 = 24_625_000
        uint256 protocolFee = (ESCROW_AMOUNT * 50) / 10_000;
        uint256 arbFee = (ESCROW_AMOUNT * 100) / 10_000;
        uint256 distributable = ESCROW_AMOUNT - protocolFee - arbFee;
        uint256 clientShare = (distributable * 5000) / 10_000;
        uint256 providerShare = distributable - clientShare;

        assertEq(usdc.balanceOf(client) - clientBefore, clientShare);
        assertEq(usdc.balanceOf(provider) - providerBefore, providerShare);
        assertEq(usdc.balanceOf(arbitrator) - arbBefore, arbFee);
        assertEq(usdc.balanceOf(feeWallet) - feeBefore, protocolFee);
        assertEq(usdc.balanceOf(address(escrowAgent)), 0);
    }

    function test_DisputeFlow_PayClient() public {
        vm.prank(client);
        uint256 escrowId = escrowAgent.createEscrow(
            provider,
            arbitrator,
            address(usdc),
            ESCROW_AMOUNT,
            uint64(block.timestamp) + TEN_MINUTES,
            GRACE_PERIOD,
            taskHash,
            EscrowAgent.VerificationType.MultiSigConfirm,
            1
        );

        vm.prank(provider);
        escrowAgent.acceptEscrow(escrowId);

        vm.prank(provider);
        escrowAgent.submitProof(escrowId, EscrowAgent.ProofType.TransactionSignature, "proof");

        vm.prank(client);
        escrowAgent.raiseDispute(escrowId);

        uint256 clientBefore = usdc.balanceOf(client);

        EscrowAgent.DisputeRuling memory ruling = EscrowAgent.DisputeRuling({
            rulingType: EscrowAgent.DisputeRulingType.PayClient,
            clientBps: 0,
            providerBps: 0
        });

        vm.prank(arbitrator);
        escrowAgent.resolveDispute(escrowId, ruling);

        uint256 protocolFee = (ESCROW_AMOUNT * 50) / 10_000;
        uint256 arbFee = (ESCROW_AMOUNT * 100) / 10_000;
        uint256 distributable = ESCROW_AMOUNT - protocolFee - arbFee;

        assertEq(usdc.balanceOf(client) - clientBefore, distributable);
    }

    function test_Dispute_RevertNoArbitrator() public {
        vm.prank(client);
        uint256 escrowId = escrowAgent.createEscrow(
            provider,
            address(0), // no arbitrator
            address(usdc),
            ESCROW_AMOUNT,
            uint64(block.timestamp) + TEN_MINUTES,
            GRACE_PERIOD,
            taskHash,
            EscrowAgent.VerificationType.MultiSigConfirm,
            1
        );

        vm.prank(provider);
        escrowAgent.acceptEscrow(escrowId);

        vm.prank(client);
        vm.expectRevert(EscrowAgent.NoArbitrator.selector);
        escrowAgent.raiseDispute(escrowId);
    }
}
