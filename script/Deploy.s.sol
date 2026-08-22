// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {MerkadoRentOfferV1} from "../contracts/MerkadoRentOfferV1.sol";

/// @title Deploy
/// @notice Testnet-only deployment script for MerkadoRentOfferV1 on Base Sepolia.
/// @dev    Pass the explicit constructor arguments on the CLI:
///         forge script script/Deploy.s.sol:Deploy --rpc-url $RPC_URL --broadcast \
///           --sig "run(address,address)" $USDC $COMPANY_SAFE
///         No secrets are hardcoded. Verify the USDC and Company Safe addresses
///         before broadcasting. This is NOT a mainnet deployment script.
contract Deploy is Script {
    /// @param usdc_ Circle native USDC address on the target testnet.
    /// @param companySafe_ Company Safe address that will mint offers.
    function run(address usdc_, address companySafe_) public {
        vm.startBroadcast();
        new MerkadoRentOfferV1(usdc_, companySafe_);
        vm.stopBroadcast();
    }
}