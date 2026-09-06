# ADR-0009: Labs Auth, Shared Demo State, and Wallet Linking

**Status:** Approved for local implementation; not activated or merged
**Date:** 2026-09-01

## Context

The Labs walkthrough uses one shared mutable demo book. Product testing with
multiple users needs shared product state without mixing wallet-authorized
landlord, renter, holder, and Admin actions.
The production `merkado-cw` application uses Supabase Auth with the
`@supabase/ssr` server/browser client structure.

## Decision

Merkado Labs uses Supabase Auth with email magic links only. Identity-only OAuth
authorization is supported separately. All authenticated users read and mutate
the shared `ra_demo_state` row where `id='live'` and `account_id IS NULL`.

Landlord workflow ownership is stored on each offer as the authenticated
`createdByAccountId`; creating or submitting an offer does not require a linked
wallet. The existing renter wallet field remains a checksummed Ethereum address
chosen in Create Offer. Linked wallets authorize on-chain purchase, payment,
and claim actions.

Each account may have one active linked wallet. Linking requires a short-lived,
one-time, domain-, chain-, account-, and nonce-bound signed challenge. Wallet
connection alone is not account authorization. The same account is intentionally
allowed to create an offer, buy an offer, pay rent, and claim rent.

Admin is enforced server-side using the normalized `ADMIN_EMAILS` allowlist on
both Admin pages and Admin actions. `LABS_DEMO_PASSWORD` remains a deployment
gate before sign-in when configured.

Global Reset remains an Admin operation with its current UX and mint sweep. It
resets the shared Labs book, starts a new chain epoch, preserves network and
contract configuration, and does not roll back Base Sepolia. Old transaction
facts remain bound to their original contract and epoch.

## Consequences

- Labs gains a production-parity Auth structure without becoming production
  authentication.
- Wallet-specific role views require the reviewed account/wallet migration.
- The account/wallet, chain-store, shared-state, and epoch-invariant migrations
  are applied to Labs, and migration history is reconciled. Hosted activation
  remains a separate approval gate.
- Base Mainnet, real funds, production access, and hosted activation remain
  blocked.
