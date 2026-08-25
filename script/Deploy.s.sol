// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {MerkadoRentOfferV1} from "../contracts/MerkadoRentOfferV1.sol";

/// @title Deploy
/// @notice Testnet-only deployment script for MerkadoRentOfferV1 on Base Sepolia.
/// @dev    Pass the explicit constructor arguments on the CLI:
///         forge script script/Deploy.s.sol:Deploy --rpc-url $RPC_URL --broadcast \
///           --sig "run(address,address)" $USDC $MINTER
///         No secrets are hardcoded. Verify the USDC and Minter addresses
///         before broadcasting. The minter is the EOA behind MERKADO_MINTER_PRIVATE_KEY. This is NOT a mainnet deployment script.
contract Deploy is Script {
    /// @param usdc_ Circle native USDC address on the target testnet.
    /// @param minter_ The address allowed to mint offers. In this demo it is the EOA
///              backing MERKADO_MINTER_PRIVATE_KEY (not a Safe).
    function run(address usdc_, address minter_) public {
        vm.startBroadcast();
        new MerkadoRentOfferV1(usdc_, minter_);
        vm.stopBroadcast();
    }
}