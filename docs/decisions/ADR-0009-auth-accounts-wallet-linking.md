# ADR-0009: Labs Auth, Account-Owned State, and Wallet Linking

**Status:** Approved for local implementation; not activated or merged
**Date:** 2026-09-01

## Context

The Labs walkthrough previously used one shared mutable demo book. Product
testing with multiple users could mix drafts, payments, purchases, and claims.
The production `merkado-cw` application uses Supabase Auth with the
`@supabase/ssr` server/browser client structure.

## Decision

Merkado Labs uses Supabase Auth with email magic links only. Identity-only OAuth
authorization is supported separately. Each
authenticated user owns an isolated demo book keyed by `auth.users.id`.

Each account may have one active linked wallet. Linking requires a short-lived,
one-time, domain-, chain-, account-, and nonce-bound signed challenge. Wallet
connection alone is not account authorization. The same account is intentionally
allowed to create an offer, buy an offer, pay rent, and claim rent.

Admin is enforced server-side using the normalized `ADMIN_EMAILS` allowlist on
both Admin pages and Admin actions. `LABS_DEMO_PASSWORD` remains a deployment
gate before sign-in when configured.

Global Reset remains an Admin operation with its current UX and mint sweep. It
resets the Labs account books, starts a new chain epoch, preserves network and
contract configuration, and does not roll back Base Sepolia. Old transaction
facts remain bound to their original account, contract, and epoch.

## Consequences

- Labs gains a production-parity Auth structure without becoming production
  authentication.
- Account isolation requires the reviewed account/wallet migration.
- The account/wallet migration is applied to Labs. The remote chain-store
  tables exist, but local migration history does not record the chain-store
  migration as applied; that history must be reconciled before relying on or
  changing the chain store.
- Base Mainnet, real funds, production access, and hosted activation remain
  blocked.
