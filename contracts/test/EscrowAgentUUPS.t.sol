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
    // FUZZ TESTS
    // ════════════════════════════════════════════

    function testFuzz_FeeCalculation(uint256 amount, uint16 bps) public pure {
        vm.assume(bps <= 500);
        vm.assume(amount >= 1000 && amount <= 1e30);
        uint256 fee = (amount * bps) / 10_000;
        assertLe(fee, amount);
        assertGe(amount - fee, 0);
    }
}
