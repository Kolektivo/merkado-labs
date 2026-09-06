// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {MerkadoRentOfferV1} from "../contracts/MerkadoRentOfferV1.sol";

/// @title Deploy
/// @notice Optimism Mainnet deployment script for MerkadoRentOfferV1.
/// @dev    Pass the explicit constructor arguments on the CLI:
///         forge script script/Deploy.s.sol:Deploy --rpc-url $RPC_URL --broadcast \
///           --sig "run(address,address)" $USDC $MINTER
///         No secrets are hardcoded. Verify the USDC and Minter addresses
///         before broadcasting. The minter is the EOA behind MERKADO_MINTER_PRIVATE_KEY.
contract Deploy is Script {
    uint256 internal constant OPTIMISM_MAINNET_CHAIN_ID = 10;
    address internal constant OPTIMISM_MAINNET_USDC =
        0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85;
    address internal constant APPROVED_MINTER =
        0x27D9333E178BEeaA92EE0e5C80DE75C133eA19E5;

    /// @param usdc_ Circle native USDC address on the target testnet.
    /// @param minter_ The address allowed to mint offers. In this demo it is the EOA
///              backing MERKADO_MINTER_PRIVATE_KEY (not a Safe).
    function run(address usdc_, address minter_) public {
        require(block.chainid == OPTIMISM_MAINNET_CHAIN_ID, "wrong chain");
        require(usdc_ == OPTIMISM_MAINNET_USDC, "wrong native USDC");
        require(minter_ == APPROVED_MINTER, "wrong minter");
        vm.startBroadcast();
        MerkadoRentOfferV1 deployed = new MerkadoRentOfferV1(usdc_, minter_);
        vm.stopBroadcast();
        require(address(deployed.usdc()) == usdc_, "USDC readback mismatch");
        require(deployed.minter() == minter_, "minter readback mismatch");
    }
}
