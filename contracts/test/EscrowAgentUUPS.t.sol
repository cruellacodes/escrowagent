// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {EscrowAgentUUPS} from "../src/EscrowAgentUUPS.sol";
import {IEscrowAgent} from "../src/IEscrowAgent.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// ── Mock Tokens ──

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function decimals() public pure override returns (uint8) { return 6; }
}

/// @dev Fee-on-transfer token: takes 1% on every transfer
contract FeeOnTransferToken is ERC20 {
    constructor() ERC20("Fee Token", "FEE") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function decimals() public pure override returns (uint8) { return 6; }

    function transfer(address to, uint256 amount) public override returns (bool) {
        uint256 fee = amount / 100; // 1%
        _burn(msg.sender, fee);
        return super.transfer(to, amount - fee);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        uint256 fee = amount / 100; // 1%
        _burn(from, fee);
        _spendAllowance(from, msg.sender, amount);
        _transfer(from, to, amount - fee);
        return true;
    }
}

contract EscrowAgentUUPSTest is Test {
    EscrowAgentUUPS public implementation;
    ERC1967Proxy public proxy;
    EscrowAgentUUPS public ea; // escrowAgent via proxy
    MockUSDC public usdc;
    FeeOnTransferToken public feeToken;

    address admin = makeAddr("admin");
    address feeWallet = makeAddr("feeWallet");
    address client = makeAddr("client");
    address provider = makeAddr("provider");
    address arbitrator = makeAddr("arbitrator");
    address random = makeAddr("random");

    uint256 constant AMT = 50_000_000;
    bytes32 taskHash = keccak256("test-task");

    function setUp() public {
        usdc = new MockUSDC();
        feeToken = new FeeOnTransferToken();

        implementation = new EscrowAgentUUPS();
        bytes memory initData = abi.encodeCall(
            implementation.initialize,
            (admin, feeWallet, 50, 100, 1000, 0, 300, 604800)
        );
        proxy = new ERC1967Proxy(address(implementation), initData);
        ea = EscrowAgentUUPS(address(proxy));

        usdc.mint(client, 1_000_000_000);
        vm.prank(client);
        usdc.approve(address(ea), type(uint256).max);

        feeToken.mint(client, 1_000_000_000);
        vm.prank(client);
        feeToken.approve(address(ea), type(uint256).max);
    }

    // ── Helper ──
    function _createEscrow() internal returns (uint256) {
        return _createEscrowWith(address(usdc), AMT, arbitrator, taskHash);
    }

    function _createEscrowWith(address token, uint256 amt, address arb, bytes32 th) internal returns (uint256) {
        vm.prank(client);
        return ea.createEscrow(
            provider, arb, token, amt,
            uint64(block.timestamp) + 600, 300,
            th, IEscrowAgent.VerificationType.MultiSigConfirm, 1
        );
    }

    // ════════════════════════════════════════════
    // INITIALIZATION
    // ════════════════════════════════════════════

    function test_ProxyInitialized() public view {
        assertEq(ea.admin(), admin);
        assertEq(ea.feeAuthority(), feeWallet);
        assertEq(ea.protocolFeeBps(), 50);
        assertEq(ea.arbitratorFeeBps(), 100);
        assertEq(ea.nextEscrowId(), 1);
        assertEq(ea.version(), "3.0.0-uups");
        assertFalse(ea.paused());
    }

    function test_ImplementationCannotBeReinitialized() public {
        vm.expectRevert();
        implementation.initialize(admin, feeWallet, 50, 100, 1000, 0, 300, 604800);
    }

    function test_InitRevert_ZeroAdmin() public {
        EscrowAgentUUPS impl = new EscrowAgentUUPS();
        vm.expectRevert(EscrowAgentUUPS.ZeroAddress.selector);
        new ERC1967Proxy(address(impl), abi.encodeCall(impl.initialize, (address(0), feeWallet, 50, 100, 1000, 0, 300, 604800)));
    }

    function test_InitRevert_ZeroFeeAuthority() public {
        EscrowAgentUUPS impl = new EscrowAgentUUPS();
        vm.expectRevert(EscrowAgentUUPS.ZeroAddress.selector);
        new ERC1967Proxy(address(impl), abi.encodeCall(impl.initialize, (admin, address(0), 50, 100, 1000, 0, 300, 604800)));
    }

    function test_InitRevert_ZeroMinGracePeriod() public {
        EscrowAgentUUPS impl = new EscrowAgentUUPS();
        vm.expectRevert(EscrowAgentUUPS.GracePeriodTooShort.selector);
        new ERC1967Proxy(address(impl), abi.encodeCall(impl.initialize, (admin, feeWallet, 50, 100, 1000, 0, 0, 604800)));
    }

    // ════════════════════════════════════════════
    // TWO-STEP ADMIN TRANSFER (C-2)
    // ════════════════════════════════════════════

    function test_TwoStepAdminTransfer() public {
        address newAdmin = makeAddr("newAdmin");

        vm.prank(admin);
        ea.proposeAdmin(newAdmin);
        assertEq(ea.pendingAdmin(), newAdmin);

        vm.prank(newAdmin);
        ea.acceptAdmin();
        assertEq(ea.admin(), newAdmin);
        assertEq(ea.pendingAdmin(), address(0));
    }

    function test_ProposeAdmin_RevertIfNotAdmin() public {
        vm.prank(client);
        vm.expectRevert(EscrowAgentUUPS.UnauthorizedAdmin.selector);
        ea.proposeAdmin(makeAddr("x"));
    }

    function test_ProposeAdmin_RevertZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert(EscrowAgentUUPS.ZeroAddress.selector);
        ea.proposeAdmin(address(0));
    }

    function test_AcceptAdmin_RevertIfNotPending() public {
        vm.prank(admin);
        ea.proposeAdmin(makeAddr("newAdmin"));

        vm.prank(client); // wrong person
        vm.expectRevert(EscrowAgentUUPS.UnauthorizedAdmin.selector);
        ea.acceptAdmin();
    }

    // ════════════════════════════════════════════
    // CONFIG UPDATES
    // ════════════════════════════════════════════

    function test_UpdateConfig_MultiplFields() public {
        IEscrowAgent.ConfigUpdate memory u;
        u.protocolFeeBps = 100;
        u.updateProtocolFeeBps = true;
        u.disputeTimeout = 3 days;
        u.updateDisputeTimeout = true;
        u.maxGracePeriod = 14 days;
        u.updateMaxGracePeriod = true;

        vm.prank(admin);
        ea.updateConfig(u);

        assertEq(ea.protocolFeeBps(), 100);
        assertEq(ea.disputeTimeout(), 3 days);
        assertEq(ea.maxGracePeriod(), 14 days);
    }

    function test_UpdateConfig_RevertFeeAuthorityZero() public {
        IEscrowAgent.ConfigUpdate memory u;
        u.feeAuthority = address(0);
        u.updateFeeAuthority = true;

        vm.prank(admin);
        vm.expectRevert(EscrowAgentUUPS.ZeroAddress.selector);
        ea.updateConfig(u);
    }

    function test_UpdateConfig_RevertDisputeTimeoutTooShort() public {
        IEscrowAgent.ConfigUpdate memory u;
        u.disputeTimeout = 1 hours; // less than 1 day
        u.updateDisputeTimeout = true;

        vm.prank(admin);
        vm.expectRevert(EscrowAgentUUPS.DisputeTimeoutTooShort.selector);
        ea.updateConfig(u);
    }

    function test_UpdateConfig_RevertMaxEscrowBelowMin() public {
        IEscrowAgent.ConfigUpdate memory u;
        u.maxEscrowAmount = 500; // below minEscrowAmount (1000)
        u.updateMaxEscrowAmount = true;

        vm.prank(admin);
        vm.expectRevert(EscrowAgentUUPS.BelowMinimumAmount.selector);
        ea.updateConfig(u);
    }

    function test_PauseAndUnpause() public {
        IEscrowAgent.ConfigUpdate memory u;
        u.paused = true;
        u.updatePaused = true;

        vm.prank(admin);
        ea.updateConfig(u);
        assertTrue(ea.paused());

        u.paused = false;
        vm.prank(admin);
        ea.updateConfig(u);
        assertFalse(ea.paused());
    }

    // ════════════════════════════════════════════
    // HAPPY PATH — Full lifecycle through proxy
    // ════════════════════════════════════════════

    function test_HappyPath_CreateAcceptProofConfirm() public {
        uint256 id = _createEscrow();
        assertEq(id, 1);

        IEscrowAgent.Escrow memory e = ea.getEscrow(id);
        assertEq(e.client, client);
        assertEq(uint8(e.status), uint8(IEscrowAgent.EscrowStatus.AwaitingProvider));
        assertEq(usdc.balanceOf(address(ea)), AMT);

        vm.prank(provider);
        ea.acceptEscrow(id);
        e = ea.getEscrow(id);
        assertEq(uint8(e.status), uint8(IEscrowAgent.EscrowStatus.Active));

        vm.prank(provider);
        ea.submitProof(id, IEscrowAgent.ProofType.TransactionSignature, "proof-data");
        e = ea.getEscrow(id);
        assertEq(uint8(e.status), uint8(IEscrowAgent.EscrowStatus.ProofSubmitted));

        uint256 provBefore = usdc.balanceOf(provider);
        uint256 feeBefore = usdc.balanceOf(feeWallet);
        vm.prank(client);
        ea.confirmCompletion(id);

        uint256 expectedFee = (AMT * 50) / 10_000;
        assertEq(usdc.balanceOf(provider) - provBefore, AMT - expectedFee);
        assertEq(usdc.balanceOf(feeWallet) - feeBefore, expectedFee);
        assertEq(usdc.balanceOf(address(ea)), 0);
    }

    // ════════════════════════════════════════════
    // CANCELLATION
    // ════════════════════════════════════════════

    function test_CancelEscrow_FullRefund() public {
        uint256 before = usdc.balanceOf(client);
        uint256 id = _createEscrow();
        vm.prank(client);
        ea.cancelEscrow(id);
        assertEq(usdc.balanceOf(client), before);
    }

    // ════════════════════════════════════════════
    // EXPIRY
    // ════════════════════════════════════════════

    function test_ExpireEscrow() public {
        uint256 id = _createEscrow();
        vm.warp(block.timestamp + 601 + 301);
        vm.prank(random);
        ea.expireEscrow(id);
        assertEq(uint8(ea.getEscrow(id).status), uint8(IEscrowAgent.EscrowStatus.Expired));
    }

    // ════════════════════════════════════════════
    // PROVIDER RELEASE
    // ════════════════════════════════════════════

    function test_ProviderRelease() public {
        uint256 id = _createEscrow();
        vm.prank(provider);
        ea.acceptEscrow(id);
        vm.prank(provider);
        ea.submitProof(id, IEscrowAgent.ProofType.TransactionSignature, "proof");
        vm.warp(block.timestamp + 301);
        vm.prank(provider);
        ea.providerRelease(id);
        assertEq(uint8(ea.getEscrow(id).status), uint8(IEscrowAgent.EscrowStatus.Completed));
    }

    // ════════════════════════════════════════════
    // DISPUTE + RESOLVE + EXPIRE (C-3)
    // ════════════════════════════════════════════

    function test_DisputeFlow_RaiseAndResolve_Split() public {
        uint256 id = _createEscrow();
        vm.prank(provider);
        ea.acceptEscrow(id);
        vm.prank(provider);
        ea.submitProof(id, IEscrowAgent.ProofType.TransactionSignature, "proof");

        vm.prank(client);
        ea.raiseDispute(id);
        assertEq(uint8(ea.getEscrow(id).status), uint8(IEscrowAgent.EscrowStatus.Disputed));

        uint256 cBefore = usdc.balanceOf(client);
        uint256 pBefore = usdc.balanceOf(provider);
        uint256 aBefore = usdc.balanceOf(arbitrator);

        IEscrowAgent.DisputeRuling memory ruling = IEscrowAgent.DisputeRuling({
            rulingType: IEscrowAgent.DisputeRulingType.Split,
            clientBps: 5000,
            providerBps: 5000
        });
        vm.prank(arbitrator);
        ea.resolveDispute(id, ruling);

        uint256 pFee = (AMT * 50) / 10_000;
        uint256 aFee = (AMT * 100) / 10_000;
        uint256 dist = AMT - pFee - aFee;
        uint256 cShare = (dist * 5000) / 10_000;
        uint256 pShare = dist - cShare;

        assertEq(usdc.balanceOf(client) - cBefore, cShare);
        assertEq(usdc.balanceOf(provider) - pBefore, pShare);
        assertEq(usdc.balanceOf(arbitrator) - aBefore, aFee);
    }

    function test_ExpireDispute_AfterTimeout() public {
        uint256 id = _createEscrow();
        vm.prank(provider);
        ea.acceptEscrow(id);
        vm.prank(provider);
        ea.submitProof(id, IEscrowAgent.ProofType.TransactionSignature, "proof");
        vm.prank(client);
        ea.raiseDispute(id);

        // Before timeout — should revert
        vm.expectRevert(EscrowAgentUUPS.DisputeNotTimedOut.selector);
        ea.expireDispute(id);

        // After timeout
        vm.warp(block.timestamp + 7 days + 1);
        uint256 cBefore = usdc.balanceOf(client);
        vm.prank(random);
        ea.expireDispute(id);

        assertEq(uint8(ea.getEscrow(id).status), uint8(IEscrowAgent.EscrowStatus.Resolved));
        uint256 pFee = (AMT * 50) / 10_000;
        assertEq(usdc.balanceOf(client) - cBefore, AMT - pFee);
    }

    function test_Dispute_RevertNoArbitrator() public {
        vm.prank(client);
        uint256 id = ea.createEscrow(
            provider, address(0), address(usdc), AMT,
            uint64(block.timestamp) + 600, 300,
            keccak256("no-arb"), IEscrowAgent.VerificationType.MultiSigConfirm, 1
        );
        vm.prank(provider);
        ea.acceptEscrow(id);

        vm.prank(client);
        vm.expectRevert(EscrowAgentUUPS.NoArbitrator.selector);
        ea.raiseDispute(id);
    }

    function test_IsDisputeTimedOut() public {
        uint256 id = _createEscrow();
        vm.prank(provider);
        ea.acceptEscrow(id);
        vm.prank(provider);
        ea.submitProof(id, IEscrowAgent.ProofType.TransactionSignature, "proof");
        vm.prank(client);
        ea.raiseDispute(id);

        assertFalse(ea.isDisputeTimedOut(id));
        vm.warp(block.timestamp + 7 days + 1);
        assertTrue(ea.isDisputeTimedOut(id));
    }

    // ════════════════════════════════════════════
    // FEE-ON-TRANSFER TOKEN (H-1)
    // ════════════════════════════════════════════

    function test_FeeOnTransfer_StoresActualReceived() public {
        vm.prank(client);
        uint256 id = ea.createEscrow(
            provider, address(0), address(feeToken), 1_000_000,
            uint64(block.timestamp) + 600, 300,
            keccak256("fee-token"), IEscrowAgent.VerificationType.MultiSigConfirm, 1
        );

        IEscrowAgent.Escrow memory e = ea.getEscrow(id);
        // 1% fee on transfer: sent 1_000_000, received 990_000
        assertEq(e.amount, 990_000);
        assertEq(feeToken.balanceOf(address(ea)), 990_000);
    }

    // ════════════════════════════════════════════
    // ESCROW KEY CLEARING (H-4)
    // ════════════════════════════════════════════

    function test_EscrowKeyCleared_CanReuse() public {
        // Create and cancel
        uint256 id1 = _createEscrow();
        vm.prank(client);
        ea.cancelEscrow(id1);

        // Same (client, provider, taskHash) should work again
        uint256 id2 = _createEscrow();
        assertEq(id2, 2);
    }

    // ════════════════════════════════════════════
    // VALIDATION TESTS
    // ════════════════════════════════════════════

    function test_CreateEscrow_RevertSelfEscrow() public {
        vm.prank(client);
        vm.expectRevert(EscrowAgentUUPS.SelfEscrow.selector);
        ea.createEscrow(client, address(0), address(usdc), AMT, uint64(block.timestamp) + 600, 300, taskHash, IEscrowAgent.VerificationType.MultiSigConfirm, 1);
    }

    function test_CreateEscrow_RevertZeroProvider() public {
        vm.prank(client);
        vm.expectRevert(EscrowAgentUUPS.InvalidProvider.selector);
        ea.createEscrow(address(0), address(0), address(usdc), AMT, uint64(block.timestamp) + 600, 300, taskHash, IEscrowAgent.VerificationType.MultiSigConfirm, 1);
    }

    function test_CreateEscrow_RevertOracleCallback() public {
        vm.prank(client);
        vm.expectRevert(EscrowAgentUUPS.UnsupportedVerificationType.selector);
        ea.createEscrow(provider, address(0), address(usdc), AMT, uint64(block.timestamp) + 600, 300, taskHash, IEscrowAgent.VerificationType.OracleCallback, 1);
    }

    function test_CreateEscrow_RevertGracePeriodTooLong() public {
        vm.prank(client);
        vm.expectRevert(EscrowAgentUUPS.GracePeriodTooLong.selector);
        ea.createEscrow(provider, address(0), address(usdc), AMT, uint64(block.timestamp) + 600, 31 days, taskHash, IEscrowAgent.VerificationType.MultiSigConfirm, 1);
    }

    // ════════════════════════════════════════════
    // UPGRADE TESTS
    // ════════════════════════════════════════════

    function test_UpgradeAsAdmin() public {
        EscrowAgentUUPS newImpl = new EscrowAgentUUPS();
        vm.prank(admin);
        ea.upgradeToAndCall(address(newImpl), "");
        assertEq(ea.admin(), admin);
    }

    function test_UpgradeRevertIfNotAdmin() public {
        EscrowAgentUUPS newImpl = new EscrowAgentUUPS();
        vm.prank(client);
        vm.expectRevert(EscrowAgentUUPS.UnauthorizedAdmin.selector);
        ea.upgradeToAndCall(address(newImpl), "");
    }

    function test_StoragePersistsAcrossUpgrade() public {
        uint256 id = _createEscrow();

        EscrowAgentUUPS newImpl = new EscrowAgentUUPS();
        vm.prank(admin);
        ea.upgradeToAndCall(address(newImpl), "");

        IEscrowAgent.Escrow memory e = ea.getEscrow(id);
        assertEq(e.client, client);
        assertEq(e.amount, AMT);
        assertEq(ea.nextEscrowId(), 2);
    }

    // ════════════════════════════════════════════
    // VIEW FUNCTIONS (UUPS-9)
    // ════════════════════════════════════════════

    function test_GetEscrowCount() public {
        assertEq(ea.getEscrowCount(), 0);
        _createEscrow();
        assertEq(ea.getEscrowCount(), 1);
    }

    function test_GetProtocolConfig() public view {
        (
            address _admin, address _pending, address _fee,
            uint16 _pBps, uint16 _aBps,
            uint256 _min, uint256 _max,
            uint64 _minG, uint64 _maxG,
            uint64 _maxD, uint64 _dTimeout,
            bool _isPaused
        ) = ea.getProtocolConfig();

        assertEq(_admin, admin);
        assertEq(_pending, address(0));
        assertEq(_fee, feeWallet);
        assertEq(_pBps, 50);
        assertEq(_aBps, 100);
        assertEq(_min, 1000);
        assertEq(_max, 0);
        assertEq(_minG, 300);
        assertEq(_maxG, 30 days);
        assertEq(_maxD, 604800);
        assertEq(_dTimeout, 7 days);
        assertFalse(_isPaused);
    }

    function test_GetEscrowByKey() public {
        uint256 id = _createEscrow();
        uint256 lookup = ea.getEscrowByKey(client, provider, taskHash);
        assertEq(lookup, id);
    }

    // ════════════════════════════════════════════
    // QA CAT 1: STATE MACHINE — Invalid Transitions
    // ════════════════════════════════════════════

    function test_AcceptEscrow_RevertIfNotProvider() public {
        uint256 id = _createEscrow();
        vm.prank(random);
        vm.expectRevert(EscrowAgentUUPS.UnauthorizedProvider.selector);
        ea.acceptEscrow(id);
    }

    function test_AcceptEscrow_RevertIfAlreadyActive() public {
        uint256 id = _createEscrow();
        vm.prank(provider);
        ea.acceptEscrow(id);
        vm.prank(provider);
        vm.expectRevert(EscrowAgentUUPS.NotAwaitingProvider.selector);
        ea.acceptEscrow(id);
    }

    function test_AcceptEscrow_RevertAfterDeadline() public {
        uint256 id = _createEscrow();
        vm.warp(block.timestamp + 601);
        vm.prank(provider);
        vm.expectRevert(EscrowAgentUUPS.DeadlinePassed.selector);
        ea.acceptEscrow(id);
    }

    function test_SubmitProof_RevertIfNotProvider() public {
        uint256 id = _createEscrow();
        vm.prank(provider); ea.acceptEscrow(id);
        vm.prank(client);
        vm.expectRevert(EscrowAgentUUPS.UnauthorizedProvider.selector);
        ea.submitProof(id, IEscrowAgent.ProofType.TransactionSignature, "data");
    }

    function test_SubmitProof_RevertIfNotActive() public {
        uint256 id = _createEscrow();
        vm.prank(provider);
        vm.expectRevert(EscrowAgentUUPS.NotActive.selector);
        ea.submitProof(id, IEscrowAgent.ProofType.TransactionSignature, "data");
    }

    function test_SubmitProof_RevertAfterDeadline() public {
        uint256 id = _createEscrow();
        vm.prank(provider); ea.acceptEscrow(id);
        vm.warp(block.timestamp + 601);
        vm.prank(provider);
        vm.expectRevert(EscrowAgentUUPS.DeadlinePassed.selector);
        ea.submitProof(id, IEscrowAgent.ProofType.TransactionSignature, "data");
    }

    function test_ConfirmCompletion_RevertIfNotClient() public {
        uint256 id = _createEscrow();
        vm.prank(provider); ea.acceptEscrow(id);
        vm.prank(provider); ea.submitProof(id, IEscrowAgent.ProofType.TransactionSignature, "p");
        vm.prank(provider);
        vm.expectRevert(EscrowAgentUUPS.UnauthorizedClient.selector);
        ea.confirmCompletion(id);
    }

    function test_ConfirmCompletion_RevertIfNotProofSubmitted() public {
        uint256 id = _createEscrow();
        vm.prank(provider); ea.acceptEscrow(id);
        vm.prank(client);
        vm.expectRevert(EscrowAgentUUPS.NoProofSubmitted.selector);
        ea.confirmCompletion(id);
    }

    function test_CancelEscrow_RevertIfNotClient() public {
        uint256 id = _createEscrow();
        vm.prank(provider);
        vm.expectRevert(EscrowAgentUUPS.UnauthorizedClient.selector);
        ea.cancelEscrow(id);
    }

    function test_ExpireEscrow_RevertIfProofSubmitted() public {
        uint256 id = _createEscrow();
        vm.prank(provider); ea.acceptEscrow(id);
        vm.prank(provider); ea.submitProof(id, IEscrowAgent.ProofType.TransactionSignature, "p");
        vm.warp(block.timestamp + 901);
        vm.expectRevert(EscrowAgentUUPS.InvalidStatus.selector);
        ea.expireEscrow(id);
    }

    function test_ProviderRelease_RevertIfNotProvider() public {
        uint256 id = _createEscrow();
        vm.prank(provider); ea.acceptEscrow(id);
        vm.prank(provider); ea.submitProof(id, IEscrowAgent.ProofType.TransactionSignature, "p");
        vm.warp(block.timestamp + 301);
        vm.prank(client);
        vm.expectRevert(EscrowAgentUUPS.UnauthorizedProvider.selector);
        ea.providerRelease(id);
    }

    function test_ProviderRelease_RevertIfTooEarly() public {
        uint256 id = _createEscrow();
        vm.prank(provider); ea.acceptEscrow(id);
        vm.prank(provider); ea.submitProof(id, IEscrowAgent.ProofType.TransactionSignature, "p");
        vm.prank(provider);
        vm.expectRevert(EscrowAgentUUPS.AutoReleaseNotReady.selector);
        ea.providerRelease(id);
    }

    function test_RaiseDispute_RevertIfNotParticipant() public {
        uint256 id = _createEscrow();
        vm.prank(provider); ea.acceptEscrow(id);
        vm.prank(random);
        vm.expectRevert(EscrowAgentUUPS.NotParticipant.selector);
        ea.raiseDispute(id);
    }

    function test_RaiseDispute_RevertIfAlreadyDisputed() public {
        uint256 id = _createEscrow();
        vm.prank(provider); ea.acceptEscrow(id);
        vm.prank(client); ea.raiseDispute(id);
        vm.prank(provider);
        vm.expectRevert(EscrowAgentUUPS.InvalidStatus.selector);
        ea.raiseDispute(id);
    }

    function test_RaiseDispute_RevertAfterGracePeriod() public {
        uint256 id = _createEscrow();
        vm.prank(provider); ea.acceptEscrow(id);
        vm.warp(block.timestamp + 601 + 301);
        vm.prank(client);
        vm.expectRevert(EscrowAgentUUPS.GracePeriodExpired.selector);
        ea.raiseDispute(id);
    }

    function test_ResolveDispute_RevertIfNotArbitrator() public {
        uint256 id = _createEscrow();
        vm.prank(provider); ea.acceptEscrow(id);
        vm.prank(client); ea.raiseDispute(id);
        IEscrowAgent.DisputeRuling memory r = IEscrowAgent.DisputeRuling(IEscrowAgent.DisputeRulingType.PayClient, 10000, 0);
        vm.prank(client);
        vm.expectRevert(EscrowAgentUUPS.UnauthorizedArbitrator.selector);
        ea.resolveDispute(id, r);
    }

    function test_ResolveDispute_RevertIfNotDisputed() public {
        uint256 id = _createEscrow();
        vm.prank(provider); ea.acceptEscrow(id);
        IEscrowAgent.DisputeRuling memory r = IEscrowAgent.DisputeRuling(IEscrowAgent.DisputeRulingType.PayClient, 10000, 0);
        vm.prank(arbitrator);
        vm.expectRevert(EscrowAgentUUPS.InvalidStatus.selector);
        ea.resolveDispute(id, r);
    }

    function test_ResolveDispute_RevertInvalidSplit() public {
        uint256 id = _createEscrow();
        vm.prank(provider); ea.acceptEscrow(id);
        vm.prank(client); ea.raiseDispute(id);
        IEscrowAgent.DisputeRuling memory r = IEscrowAgent.DisputeRuling(IEscrowAgent.DisputeRulingType.Split, 3000, 3000);
        vm.prank(arbitrator);
        vm.expectRevert(EscrowAgentUUPS.InvalidSplitRuling.selector);
        ea.resolveDispute(id, r);
    }

    function test_ExpireDispute_RevertIfNotDisputed() public {
        uint256 id = _createEscrow();
        vm.expectRevert(EscrowAgentUUPS.InvalidStatus.selector);
        ea.expireDispute(id);
    }

    function test_CompletedEscrow_AllActionsRevert() public {
        uint256 id = _createEscrow();
        vm.prank(provider); ea.acceptEscrow(id);
        vm.prank(provider); ea.submitProof(id, IEscrowAgent.ProofType.TransactionSignature, "p");
        vm.prank(client); ea.confirmCompletion(id);
        // All actions should revert
        vm.prank(provider); vm.expectRevert(); ea.acceptEscrow(id);
        vm.prank(provider); vm.expectRevert(); ea.submitProof(id, IEscrowAgent.ProofType.TransactionSignature, "x");
        vm.prank(client); vm.expectRevert(); ea.cancelEscrow(id);
        vm.prank(client); vm.expectRevert(); ea.raiseDispute(id);
    }

    function test_CancelledEscrow_AllActionsRevert() public {
        uint256 id = _createEscrow();
        vm.prank(client); ea.cancelEscrow(id);
        vm.prank(provider); vm.expectRevert(); ea.acceptEscrow(id);
        vm.prank(client); vm.expectRevert(); ea.raiseDispute(id);
    }

    function test_ExpiredEscrow_AllActionsRevert() public {
        uint256 id = _createEscrow();
        vm.warp(block.timestamp + 901);
        ea.expireEscrow(id);
        vm.prank(provider); vm.expectRevert(); ea.acceptEscrow(id);
        vm.prank(client); vm.expectRevert(); ea.cancelEscrow(id);
    }

    // ════════════════════════════════════════════
    // QA CAT 2: FINANCIAL CORRECTNESS
    // ════════════════════════════════════════════

    function test_Confirm_ExactFeeCalculation() public {
        uint256 id = _createEscrow();
        vm.prank(provider); ea.acceptEscrow(id);
        vm.prank(provider); ea.submitProof(id, IEscrowAgent.ProofType.TransactionSignature, "p");
        uint256 pBefore = usdc.balanceOf(provider);
        uint256 fBefore = usdc.balanceOf(feeWallet);
        vm.prank(client); ea.confirmCompletion(id);
        uint256 fee = (AMT * 50) / 10_000;
        assertEq(usdc.balanceOf(provider) - pBefore, AMT - fee);
        assertEq(usdc.balanceOf(feeWallet) - fBefore, fee);
        assertEq(usdc.balanceOf(address(ea)), 0);
    }

    function test_ResolveDispute_PayProvider_ExactAmounts() public {
        uint256 id = _createEscrow();
        vm.prank(provider); ea.acceptEscrow(id);
        vm.prank(provider); ea.submitProof(id, IEscrowAgent.ProofType.TransactionSignature, "p");
        vm.prank(client); ea.raiseDispute(id);
        uint256 pBefore = usdc.balanceOf(provider);
        uint256 aBefore = usdc.balanceOf(arbitrator);
        uint256 fBefore = usdc.balanceOf(feeWallet);
        IEscrowAgent.DisputeRuling memory r = IEscrowAgent.DisputeRuling(IEscrowAgent.DisputeRulingType.PayProvider, 0, 10000);
        vm.prank(arbitrator); ea.resolveDispute(id, r);
        uint256 pFee = (AMT * 50) / 10_000;
        uint256 aFee = (AMT * 100) / 10_000;
        assertEq(usdc.balanceOf(provider) - pBefore, AMT - pFee - aFee);
        assertEq(usdc.balanceOf(arbitrator) - aBefore, aFee);
        assertEq(usdc.balanceOf(feeWallet) - fBefore, pFee);
        assertEq(usdc.balanceOf(address(ea)), 0);
    }

    function test_ResolveDispute_Split_AsymmetricAmounts() public {
        uint256 id = _createEscrow();
        vm.prank(provider); ea.acceptEscrow(id);
        vm.prank(provider); ea.submitProof(id, IEscrowAgent.ProofType.TransactionSignature, "p");
        vm.prank(client); ea.raiseDispute(id);
        uint256 cBefore = usdc.balanceOf(client);
        uint256 pBefore = usdc.balanceOf(provider);
        IEscrowAgent.DisputeRuling memory r = IEscrowAgent.DisputeRuling(IEscrowAgent.DisputeRulingType.Split, 7000, 3000);
        vm.prank(arbitrator); ea.resolveDispute(id, r);
        uint256 pFee = (AMT * 50) / 10_000;
        uint256 aFee = (AMT * 100) / 10_000;
        uint256 dist = AMT - pFee - aFee;
        uint256 cShare = (dist * 7000) / 10_000;
        uint256 pShare = dist - cShare;
        assertEq(usdc.balanceOf(client) - cBefore, cShare);
        assertEq(usdc.balanceOf(provider) - pBefore, pShare);
        assertEq(usdc.balanceOf(address(ea)), 0);
    }

    function test_ResolveDispute_Split_ExtremeRatios() public {
        uint256 id = _createEscrowWith(address(usdc), AMT, arbitrator, keccak256("extreme1"));
        vm.prank(provider); ea.acceptEscrow(id);
        vm.prank(provider); ea.submitProof(id, IEscrowAgent.ProofType.TransactionSignature, "p");
        vm.prank(client); ea.raiseDispute(id);
        IEscrowAgent.DisputeRuling memory r = IEscrowAgent.DisputeRuling(IEscrowAgent.DisputeRulingType.Split, 1, 9999);
        vm.prank(arbitrator); ea.resolveDispute(id, r);
        assertEq(usdc.balanceOf(address(ea)), 0);
    }

    function test_ExpireDispute_FeeGoesToProtocol() public {
        uint256 id = _createEscrow();
        vm.prank(provider); ea.acceptEscrow(id);
        vm.prank(provider); ea.submitProof(id, IEscrowAgent.ProofType.TransactionSignature, "p");
        vm.prank(client); ea.raiseDispute(id);
        vm.warp(block.timestamp + 7 days + 1);
        uint256 cBefore = usdc.balanceOf(client);
        uint256 fBefore = usdc.balanceOf(feeWallet);
        uint256 aBefore = usdc.balanceOf(arbitrator);
        ea.expireDispute(id);
        uint256 pFee = (AMT * 50) / 10_000;
        assertEq(usdc.balanceOf(client) - cBefore, AMT - pFee);
        assertEq(usdc.balanceOf(feeWallet) - fBefore, pFee);
        assertEq(usdc.balanceOf(arbitrator), aBefore); // arbitrator gets nothing
        assertEq(usdc.balanceOf(address(ea)), 0);
    }

    function test_ProviderRelease_ExactPayouts() public {
        uint256 id = _createEscrow();
        vm.prank(provider); ea.acceptEscrow(id);
        vm.prank(provider); ea.submitProof(id, IEscrowAgent.ProofType.TransactionSignature, "p");
        vm.warp(block.timestamp + 301);
        uint256 pBefore = usdc.balanceOf(provider);
        uint256 fBefore = usdc.balanceOf(feeWallet);
        vm.prank(provider); ea.providerRelease(id);
        uint256 fee = (AMT * 50) / 10_000;
        assertEq(usdc.balanceOf(provider) - pBefore, AMT - fee);
        assertEq(usdc.balanceOf(feeWallet) - fBefore, fee);
        assertEq(usdc.balanceOf(address(ea)), 0);
    }

    function test_MinimumAmount_FeeCalculation() public {
        vm.prank(client);
        uint256 id = ea.createEscrow(provider, address(0), address(usdc), 1000, uint64(block.timestamp) + 600, 300, keccak256("min"), IEscrowAgent.VerificationType.MultiSigConfirm, 1);
        vm.prank(provider); ea.acceptEscrow(id);
        vm.prank(provider); ea.submitProof(id, IEscrowAgent.ProofType.TransactionSignature, "p");
        vm.prank(client); ea.confirmCompletion(id);
        assertEq(usdc.balanceOf(address(ea)), 0);
    }

    function test_LargeAmount_NoOverflow() public {
        uint256 large = 1_000_000_000_000; // 1 trillion
        usdc.mint(client, large);
        vm.prank(client); usdc.approve(address(ea), large);
        vm.prank(client);
        uint256 id = ea.createEscrow(provider, address(0), address(usdc), large, uint64(block.timestamp) + 600, 300, keccak256("big"), IEscrowAgent.VerificationType.MultiSigConfirm, 1);
        vm.prank(provider); ea.acceptEscrow(id);
        vm.prank(provider); ea.submitProof(id, IEscrowAgent.ProofType.TransactionSignature, "p");
        vm.prank(client); ea.confirmCompletion(id);
        assertEq(usdc.balanceOf(address(ea)), 0);
    }

    function test_ContractBalance_ZeroAfterEveryTerminalState() public {
        // Confirm
        uint256 id1 = _createEscrowWith(address(usdc), AMT, arbitrator, keccak256("t1"));
        vm.prank(provider); ea.acceptEscrow(id1);
        vm.prank(provider); ea.submitProof(id1, IEscrowAgent.ProofType.TransactionSignature, "p");
        vm.prank(client); ea.confirmCompletion(id1);
        assertEq(usdc.balanceOf(address(ea)), 0);

        // Cancel
        uint256 id2 = _createEscrowWith(address(usdc), AMT, arbitrator, keccak256("t2"));
        vm.prank(client); ea.cancelEscrow(id2);
        assertEq(usdc.balanceOf(address(ea)), 0);

        // Expire
        uint256 id3 = _createEscrowWith(address(usdc), AMT, arbitrator, keccak256("t3"));
        vm.warp(block.timestamp + 901);
        ea.expireEscrow(id3);
        assertEq(usdc.balanceOf(address(ea)), 0);
    }

    // ════════════════════════════════════════════
    // QA CAT 3: TIMING EDGE CASES
    // ════════════════════════════════════════════

    function test_AcceptEscrow_ExactlyAtDeadline() public {
        vm.prank(client);
        uint256 id = ea.createEscrow(provider, arbitrator, address(usdc), AMT, uint64(block.timestamp + 600), 300, keccak256("time1"), IEscrowAgent.VerificationType.MultiSigConfirm, 1);
        vm.warp(block.timestamp + 600); // exactly at deadline
        vm.prank(provider);
        ea.acceptEscrow(id); // should succeed (> not >=)
        assertEq(uint8(ea.getEscrow(id).status), uint8(IEscrowAgent.EscrowStatus.Active));
    }

    function test_SubmitProof_ExactlyAtDeadline() public {
        uint256 id = _createEscrow();
        vm.prank(provider); ea.acceptEscrow(id);
        vm.warp(block.timestamp + 600);
        vm.prank(provider);
        ea.submitProof(id, IEscrowAgent.ProofType.TransactionSignature, "p"); // should succeed
    }

    function test_ExpireEscrow_ExactlyAtDeadlinePlusGrace_Reverts() public {
        uint256 id = _createEscrow();
        vm.warp(block.timestamp + 600 + 300); // exactly at deadline+grace
        vm.expectRevert(EscrowAgentUUPS.NotYetExpired.selector);
        ea.expireEscrow(id);
    }

    function test_ExpireEscrow_OneSecondAfterDeadlinePlusGrace() public {
        uint256 id = _createEscrow();
        vm.warp(block.timestamp + 600 + 300 + 1);
        ea.expireEscrow(id);
        assertEq(uint8(ea.getEscrow(id).status), uint8(IEscrowAgent.EscrowStatus.Expired));
    }

    function test_ProviderRelease_ExactlyAtTimeout_Reverts() public {
        uint256 id = _createEscrow();
        vm.prank(provider); ea.acceptEscrow(id);
        uint256 proofTime = block.timestamp;
        vm.prank(provider); ea.submitProof(id, IEscrowAgent.ProofType.TransactionSignature, "p");
        vm.warp(proofTime + 300); // exactly at timeout
        vm.prank(provider);
        vm.expectRevert(EscrowAgentUUPS.AutoReleaseNotReady.selector);
        ea.providerRelease(id);
    }

    function test_ProviderRelease_OneSecondAfterTimeout() public {
        uint256 id = _createEscrow();
        vm.prank(provider); ea.acceptEscrow(id);
        vm.prank(provider); ea.submitProof(id, IEscrowAgent.ProofType.TransactionSignature, "p");
        vm.warp(block.timestamp + 301);
        vm.prank(provider);
        ea.providerRelease(id); // should succeed
    }

    function test_RaiseDispute_ExactlyAtGraceEnd() public {
        uint256 id = _createEscrow();
        vm.prank(provider); ea.acceptEscrow(id);
        vm.warp(block.timestamp + 600 + 300); // exactly at deadline+grace
        vm.prank(client);
        ea.raiseDispute(id); // should succeed (<=)
    }

    function test_RaiseDispute_OneSecondAfterGrace_Reverts() public {
        uint256 id = _createEscrow();
        vm.prank(provider); ea.acceptEscrow(id);
        vm.warp(block.timestamp + 600 + 301);
        vm.prank(client);
        vm.expectRevert(EscrowAgentUUPS.GracePeriodExpired.selector);
        ea.raiseDispute(id);
    }

    function test_ExpireDispute_ExactlyAtTimeout_Reverts() public {
        uint256 id = _createEscrow();
        vm.prank(provider); ea.acceptEscrow(id);
        vm.prank(client); ea.raiseDispute(id);
        vm.warp(block.timestamp + 7 days);
        vm.expectRevert(EscrowAgentUUPS.DisputeNotTimedOut.selector);
        ea.expireDispute(id);
    }

    function test_ExpireDispute_OneSecondAfterTimeout() public {
        uint256 id = _createEscrow();
        vm.prank(provider); ea.acceptEscrow(id);
        vm.prank(client); ea.raiseDispute(id);
        vm.warp(block.timestamp + 7 days + 1);
        ea.expireDispute(id);
        assertEq(uint8(ea.getEscrow(id).status), uint8(IEscrowAgent.EscrowStatus.Resolved));
    }

    // ════════════════════════════════════════════
    // QA CAT 4: MULTI-ESCROW ISOLATION
    // ════════════════════════════════════════════

    function test_TwoEscrows_IndependentLifecycles() public {
        uint256 id1 = _createEscrowWith(address(usdc), AMT, arbitrator, keccak256("iso1"));
        uint256 id2 = _createEscrowWith(address(usdc), AMT, arbitrator, keccak256("iso2"));
        // Complete first
        vm.prank(provider); ea.acceptEscrow(id1);
        vm.prank(provider); ea.submitProof(id1, IEscrowAgent.ProofType.TransactionSignature, "p");
        vm.prank(client); ea.confirmCompletion(id1);
        // Cancel second
        vm.prank(client); ea.cancelEscrow(id2);
        assertEq(uint8(ea.getEscrow(id1).status), uint8(IEscrowAgent.EscrowStatus.Completed));
        assertEq(uint8(ea.getEscrow(id2).status), uint8(IEscrowAgent.EscrowStatus.Cancelled));
        assertEq(usdc.balanceOf(address(ea)), 0);
    }

    function test_TwoEscrows_SameToken_BalanceIsolation() public {
        uint256 id1 = _createEscrowWith(address(usdc), AMT, address(0), keccak256("bal1"));
        uint256 id2 = _createEscrowWith(address(usdc), AMT, address(0), keccak256("bal2"));
        assertEq(usdc.balanceOf(address(ea)), AMT * 2);
        // Complete both
        vm.prank(provider); ea.acceptEscrow(id1);
        vm.prank(provider); ea.submitProof(id1, IEscrowAgent.ProofType.TransactionSignature, "p");
        vm.prank(client); ea.confirmCompletion(id1);
        vm.prank(provider); ea.acceptEscrow(id2);
        vm.prank(provider); ea.submitProof(id2, IEscrowAgent.ProofType.TransactionSignature, "p");
        vm.prank(client); ea.confirmCompletion(id2);
        assertEq(usdc.balanceOf(address(ea)), 0);
    }

    function test_TwoEscrows_DifferentTokens() public {
        MockUSDC weth = new MockUSDC(); // second token
        weth.mint(client, 1_000_000_000);
        vm.prank(client); weth.approve(address(ea), type(uint256).max);
        uint256 id1 = _createEscrowWith(address(usdc), AMT, address(0), keccak256("tok1"));
        vm.prank(client);
        uint256 id2 = ea.createEscrow(provider, address(0), address(weth), AMT, uint64(block.timestamp) + 600, 300, keccak256("tok2"), IEscrowAgent.VerificationType.MultiSigConfirm, 1);
        // Complete both
        vm.prank(provider); ea.acceptEscrow(id1);
        vm.prank(provider); ea.submitProof(id1, IEscrowAgent.ProofType.TransactionSignature, "p");
        vm.prank(client); ea.confirmCompletion(id1);
        vm.prank(provider); ea.acceptEscrow(id2);
        vm.prank(provider); ea.submitProof(id2, IEscrowAgent.ProofType.TransactionSignature, "p");
        vm.prank(client); ea.confirmCompletion(id2);
        assertEq(usdc.balanceOf(address(ea)), 0);
        assertEq(weth.balanceOf(address(ea)), 0);
    }

    function test_ManyEscrows_SequentialIds() public {
        uint256 id1 = _createEscrowWith(address(usdc), 1000, address(0), keccak256("seq1"));
        uint256 id2 = _createEscrowWith(address(usdc), 1000, address(0), keccak256("seq2"));
        uint256 id3 = _createEscrowWith(address(usdc), 1000, address(0), keccak256("seq3"));
        uint256 id4 = _createEscrowWith(address(usdc), 1000, address(0), keccak256("seq4"));
        uint256 id5 = _createEscrowWith(address(usdc), 1000, address(0), keccak256("seq5"));
        assertEq(id1, 1); assertEq(id2, 2); assertEq(id3, 3); assertEq(id4, 4); assertEq(id5, 5);
        // Cancel #3
        vm.prank(client); ea.cancelEscrow(id3);
        // #4 and #5 still work
        vm.prank(provider); ea.acceptEscrow(id4);
        vm.prank(provider); ea.acceptEscrow(id5);
    }

    // ════════════════════════════════════════════
    // QA CAT 5: UPGRADE SAFETY
    // ════════════════════════════════════════════

    function test_Upgrade_ActiveEscrowSurvives() public {
        uint256 id = _createEscrow();
        vm.prank(provider); ea.acceptEscrow(id);
        // Upgrade mid-lifecycle
        EscrowAgentUUPS newImpl = new EscrowAgentUUPS();
        vm.prank(admin); ea.upgradeToAndCall(address(newImpl), "");
        // Continue lifecycle
        vm.prank(provider); ea.submitProof(id, IEscrowAgent.ProofType.TransactionSignature, "p");
        vm.prank(client); ea.confirmCompletion(id);
        assertEq(uint8(ea.getEscrow(id).status), uint8(IEscrowAgent.EscrowStatus.Completed));
        assertEq(usdc.balanceOf(address(ea)), 0);
    }

    function test_Upgrade_DisputedEscrowSurvives() public {
        uint256 id = _createEscrow();
        vm.prank(provider); ea.acceptEscrow(id);
        vm.prank(client); ea.raiseDispute(id);
        // Upgrade while disputed
        EscrowAgentUUPS newImpl = new EscrowAgentUUPS();
        vm.prank(admin); ea.upgradeToAndCall(address(newImpl), "");
        // Resolve after upgrade
        IEscrowAgent.DisputeRuling memory r = IEscrowAgent.DisputeRuling(IEscrowAgent.DisputeRulingType.PayClient, 10000, 0);
        vm.prank(arbitrator); ea.resolveDispute(id, r);
        assertEq(uint8(ea.getEscrow(id).status), uint8(IEscrowAgent.EscrowStatus.Resolved));
        assertEq(usdc.balanceOf(address(ea)), 0);
    }

    function test_Upgrade_NewVersionNumber() public {
        EscrowAgentUUPS newImpl = new EscrowAgentUUPS();
        vm.prank(admin); ea.upgradeToAndCall(address(newImpl), "");
        assertEq(ea.version(), "3.0.0-uups"); // same version since we deployed same contract
    }

    // ════════════════════════════════════════════
    // QA CAT 6: PAUSE BEHAVIOR
    // ════════════════════════════════════════════

    function _pause() internal {
        IEscrowAgent.ConfigUpdate memory u;
        u.paused = true; u.updatePaused = true;
        vm.prank(admin); ea.updateConfig(u);
    }

    function _unpause() internal {
        IEscrowAgent.ConfigUpdate memory u;
        u.paused = false; u.updatePaused = true;
        vm.prank(admin); ea.updateConfig(u);
    }

    function test_Pause_BlocksCreateEscrow() public {
        _pause();
        vm.prank(client);
        vm.expectRevert("Pausable: paused");
        ea.createEscrow(provider, address(0), address(usdc), AMT, uint64(block.timestamp) + 600, 300, keccak256("paused"), IEscrowAgent.VerificationType.MultiSigConfirm, 1);
    }

    function test_Pause_BlocksAccept() public {
        uint256 id = _createEscrow();
        _pause();
        vm.prank(provider);
        vm.expectRevert("Pausable: paused");
        ea.acceptEscrow(id);
    }

    function test_Pause_BlocksConfirm() public {
        uint256 id = _createEscrow();
        vm.prank(provider); ea.acceptEscrow(id);
        vm.prank(provider); ea.submitProof(id, IEscrowAgent.ProofType.TransactionSignature, "p");
        _pause();
        vm.prank(client);
        vm.expectRevert("Pausable: paused");
        ea.confirmCompletion(id);
    }

    function test_Pause_BlocksDispute() public {
        uint256 id = _createEscrow();
        vm.prank(provider); ea.acceptEscrow(id);
        _pause();
        vm.prank(client);
        vm.expectRevert("Pausable: paused");
        ea.raiseDispute(id);
    }

    function test_Unpause_ResumesAllOperations() public {
        _pause();
        vm.prank(client);
        vm.expectRevert("Pausable: paused");
        ea.createEscrow(provider, address(0), address(usdc), AMT, uint64(block.timestamp) + 600, 300, keccak256("resume"), IEscrowAgent.VerificationType.MultiSigConfirm, 1);

        _unpause();
        vm.prank(client);
        uint256 id = ea.createEscrow(provider, address(0), address(usdc), AMT, uint64(block.timestamp) + 600, 300, keccak256("resume"), IEscrowAgent.VerificationType.MultiSigConfirm, 1);
        assertEq(id, 1);
    }

    // ════════════════════════════════════════════
    // QA CAT 7: FUZZ TESTS
    // ════════════════════════════════════════════

    function testFuzz_FeeCalculation(uint256 amount, uint16 bps) public pure {
        vm.assume(bps <= 500);
        vm.assume(amount >= 1000 && amount <= 1e30);
        uint256 fee = (amount * bps) / 10_000;
        assertLe(fee, amount);
        assertGe(amount - fee, 0);
    }

    function testFuzz_CreateEscrowAmount(uint256 amount) public {
        vm.assume(amount >= 1000 && amount <= 1e18);
        usdc.mint(client, amount);
        vm.prank(client); usdc.approve(address(ea), amount);
        vm.prank(client);
        uint256 id = ea.createEscrow(provider, address(0), address(usdc), amount, uint64(block.timestamp) + 600, 300, keccak256(abi.encode("fuzz", amount)), IEscrowAgent.VerificationType.MultiSigConfirm, 1);
        assertEq(ea.getEscrow(id).amount, amount);
    }

    function testFuzz_SplitRuling(uint16 clientBps) public {
        vm.assume(clientBps > 0 && clientBps < 10000);
        uint16 providerBps = 10000 - clientBps;
        uint256 id = _createEscrowWith(address(usdc), AMT, arbitrator, keccak256(abi.encode("fuzz-split", clientBps)));
        vm.prank(provider); ea.acceptEscrow(id);
        vm.prank(client); ea.raiseDispute(id);
        IEscrowAgent.DisputeRuling memory r = IEscrowAgent.DisputeRuling(IEscrowAgent.DisputeRulingType.Split, clientBps, providerBps);
        vm.prank(arbitrator); ea.resolveDispute(id, r);
        assertEq(usdc.balanceOf(address(ea)), 0); // nothing left in contract
    }

    function testFuzz_GracePeriod(uint64 grace) public {
        vm.assume(grace >= 300 && grace <= 30 days);
        vm.prank(client);
        uint256 id = ea.createEscrow(provider, address(0), address(usdc), AMT, uint64(block.timestamp) + 600, grace, keccak256(abi.encode("fuzz-grace", grace)), IEscrowAgent.VerificationType.MultiSigConfirm, 1);
        assertEq(ea.getEscrow(id).gracePeriod, grace);
    }
}
