// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Minimal mock of Circle native USDC (6 decimals) for local Foundry tests.
/// @dev    Test-only. Never deploy to a real network.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    /// @dev Circle native USDC has 6 decimals.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Public mint for tests.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}