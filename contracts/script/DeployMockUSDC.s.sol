// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {
        _mint(msg.sender, 1_000_000 * 10**6); // Mint 1M USDC to deployer
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract DeployMockUSDC is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        MockUSDC usdc = new MockUSDC();
        vm.stopBroadcast();

        console.log("MockUSDC deployed at:", address(usdc));
        console.log("Initial supply: 1,000,000 USDC");
        console.log("Minted to:", vm.addr(deployerPrivateKey));
    }
}
