// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {EscrowAgentUUPS} from "../src/EscrowAgentUUPS.sol";

/**
 * @title DeployUpgradeable
 * @notice Deploys EscrowAgent with UUPS upgradeability for mainnet safety.
 *
 * Usage:
 *   forge script script/DeployUpgradeable.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 *
 * The proxy address is what you use in the SDK/indexer (not the implementation).
 */
contract DeployUpgradeable is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address adminAddress = vm.envOr("ADMIN_ADDRESS", deployer);
        address feeAuthorityAddress = vm.envOr("FEE_AUTHORITY", deployer);

        require(adminAddress != address(0), "ADMIN_ADDRESS cannot be zero");
        require(feeAuthorityAddress != address(0), "FEE_AUTHORITY cannot be zero");

        uint16 protocolFeeBps = uint16(vm.envOr("PROTOCOL_FEE_BPS", uint256(50)));
        uint16 arbitratorFeeBps = uint16(vm.envOr("ARBITRATOR_FEE_BPS", uint256(100)));
        uint256 minEscrowAmount = vm.envOr("MIN_ESCROW_AMOUNT", uint256(1000));
        uint256 maxEscrowAmount = vm.envOr("MAX_ESCROW_AMOUNT", uint256(0));
        uint64 minGracePeriod = uint64(vm.envOr("MIN_GRACE_PERIOD", uint256(300)));
        uint64 maxDeadlineSeconds = uint64(vm.envOr("MAX_DEADLINE_SECONDS", uint256(604800)));

        console.log("Deploying EscrowAgent (UUPS Upgradeable)...");
        console.log("  Deployer:", deployer);
        console.log("  Admin:", adminAddress);
        console.log("  Fee Authority:", feeAuthorityAddress);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy implementation
        EscrowAgentUUPS implementation = new EscrowAgentUUPS();
        console.log("  Implementation:", address(implementation));

        // 2. Encode initialize call
        bytes memory initData = abi.encodeCall(
            implementation.initialize,
            (
                adminAddress,
                feeAuthorityAddress,
                protocolFeeBps,
                arbitratorFeeBps,
                minEscrowAmount,
                maxEscrowAmount,
                minGracePeriod,
                maxDeadlineSeconds
            )
        );

        // 3. Deploy proxy
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);

        vm.stopBroadcast();

        // 4. Post-deployment verification
        EscrowAgentUUPS proxyContract = EscrowAgentUUPS(address(proxy));
        require(proxyContract.admin() == adminAddress, "Verification failed: admin mismatch");
        require(proxyContract.nextEscrowId() == 1, "Verification failed: nextEscrowId should be 1");

        console.log("  Proxy (use this address):", address(proxy));
        console.log("  Verified: admin() and nextEscrowId() OK");
        console.log("\n  Protocol fee: %d bps", protocolFeeBps);
        console.log("  Arbitrator fee: %d bps", arbitratorFeeBps);
        console.log("  Upgradeable: YES (admin can upgrade)");
        console.log("\n  IMPORTANT: Use the PROXY address in your SDK and indexer!");
        console.log("  Proxy address:", address(proxy));
    }
}
