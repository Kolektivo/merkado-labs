# ADR-0010: Optimism Mainnet-Only Deployment

**Status:** Accepted for implementation; deployment not activated
**Date:** September 6, 2026

## Context

The Labs Direct / Pay walkthrough has moved from testnet implementation to a
single Optimism Mainnet deployment. Keeping Base, OP Sepolia, and network
selection code in the application would make it possible to sign or verify a
transaction against the wrong chain or USDC contract.

## Decision

The application supports Optimism Mainnet only for this deployment.

| Fact | Value |
|---|---|
| Network key | `op-mainnet` |
| Chain ID | `10` |
| RPC | `https://mainnet.optimism.io` |
| Circle native USDC | `0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85` |
| Offer contract | `0x97439e4352b9428F56651be7DE95224B1c83b711` |
| Explorer | `https://optimistic.etherscan.io` |
| Minter | `0x27D9333E178BEeaA92EE0e5C80DE75C133eA19E5` |

`MerkadoRentOfferV1` remains the only application contract. `MockUSDC` is
for local tests only and must not be deployed.

The contract was manually deployed and read back successfully on chain 10.
The application must use the configured contract address as its single source
of truth and must verify chain ID, contract address, native USDC address, and
minter address before any server-side action.

Admin approval authorizes the server to automatically mint the approved offer.
The approval action triggers one idempotent server-side mint. Opening Admin
and Reset also run the same authenticated pending-mint sweep so seeded or
interrupted approved offers resume. Scheduled public cron minting and
deployment-time offer minting remain disabled.

The first active application epoch is a cold start. Base/testnet offer facts,
transaction hashes, and payment confirmations must not be reused. Reset
creates a fresh epoch but never rolls back chain state.

## Consequences

- Wallet connection, wallet linking, payment, purchase, claim, and server
  verification all target chain ID `10`.
- Admin shows a fixed Optimism Mainnet network; there is no network selector.
- The public configuration contains no private key. The minter key remains
  server-only in `MERKADO_MINTER_PRIVATE_KEY`.
- Mainnet ETH and USDC funding, database migration application, hosted
  activation, and merge remain separate Product Lead approval gates.
- The current verification depth remains five blocks for the Labs walkthrough;
  a production finality policy requires explicit operational approval.

## Rejected alternatives

- Supporting multiple networks from one active demo book.
- Treating a missing or legacy network key as permission to select a testnet.
- Deploying `MockUSDC` on Optimism Mainnet.
- Scheduled automatic minting from a cron job.
