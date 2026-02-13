// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {EscrowAgent} from "../src/EscrowAgent.sol";

/**
 * @title Deploy
 * @notice Deployment script for EscrowAgent on Base Sepolia or Base Mainnet.
 *
 * Usage:
 *   # Base Sepolia (testnet)
 *   forge script script/Deploy.s.sol --rpc-url https://sepolia.base.org --broadcast --verify
 *
 *   # Base Mainnet
 *   forge script script/Deploy.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 *
 * Required env vars:
 *   DEPLOYER_PRIVATE_KEY  - Private key of the deployer wallet
 *   ADMIN_ADDRESS         - Protocol admin (defaults to deployer)
 *   FEE_AUTHORITY         - Wallet that receives protocol fees (defaults to deployer)
 */
contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Optional overrides (default to deployer)
        address adminAddress = vm.envOr("ADMIN_ADDRESS", deployer);
        address feeAuthority = vm.envOr("FEE_AUTHORITY", deployer);

        // Protocol config (sensible defaults for production)
        uint16 protocolFeeBps = 50;       // 0.5%
        uint16 arbitratorFeeBps = 100;    // 1.0%
        uint256 minEscrowAmount = 1000;   // 1000 smallest units (0.001 USDC)
        uint256 maxEscrowAmount = 0;      // No limit
        uint64 minGracePeriod = 300;      // 5 minutes
        uint64 maxDeadlineSeconds = 604800; // 7 days

        console.log("Deploying EscrowAgent...");
        console.log("  Deployer:", deployer);
        console.log("  Admin:", adminAddress);
        console.log("  Fee Authority:", feeAuthority);

        vm.startBroadcast(deployerPrivateKey);

        EscrowAgent escrowAgent = new EscrowAgent(
            adminAddress,
            feeAuthority,
            protocolFeeBps,
            arbitratorFeeBps,
            minEscrowAmount,
            maxEscrowAmount,
            minGracePeriod,
            maxDeadlineSeconds
        );

        vm.stopBroadcast();

        console.log("EscrowAgent deployed at:", address(escrowAgent));
        console.log("  Protocol fee: 0.5%");
        console.log("  Arbitrator fee: 1.0%");
        console.log("  Min escrow: 1000 units");
        console.log("  Max deadline: 7 days");
    }
}
