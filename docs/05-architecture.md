# 05 - Architecture

**Purpose:** How the Labs demo is put together.
**Last updated:** August 19, 2026 (approved OP Sepolia Web3 MVP)

## 1. Surfaces

```
merkado-labs
├── src/                    Next.js demo (shadcn)
├── supabase/migrations     Labs schema only (no new migration for this demo)
└── docs/                   Canonical product docs
```

merkado-cw is the live marketplace. This repo does not scrape, enrich, or
publish listings.

Customer-facing surfaces:

- `/` Labs demo hub
- `/originate*` Merkado Direct operations (My Offers, Create Offer, Get Now)
- `/offers*` Marketplace
- `/portfolio*` Portfolio
- `/pay` and `/pay/[paymentRequestId]` Merkado Pay. `/pay/payments` redirects to `/pay`.
- `/account` → `/account/apps` fictional account mock (Apps launcher) inside
  merkado-cw navbar / sidebar / footer chrome. Other account links are disabled.

## 2. Dashboard

- Server components load one demo book from Labs Supabase (`ra_demo_state`)
  with a seed fallback and `normalizeBook()` for older JSON.
- Mutations are server actions (record collection, dual-control release,
  save draft, confirm payment, verify live payment, reset).
- There is no Merkado login. After deploy, the hosted demo asks for a
  shared host password at `/enter`. Reset demo sits on Overview.
- Pay uses a payment-link shell (`src/app/pay/layout.tsx`). Account uses
  its own Labs mock shell. Direct operations use the sidebar shell
  (`src/app/(direct)/layout.tsx`). The three shells are separate layouts
  so the first paint does not swap chrome.

## 3. Pricing and scores

The pricing engine lives in TypeScript (`src/lib/rent-advance/pricing.ts`).
It is the only path that can create a quote. The 24% cap is enforced there,
not only in the UI.

Pricing uses **raw Listing Score** and **Payer Score**. The derived
**Property Score** (`src/lib/rent-advance/property-score.ts`) is for
Direct presentation and filtering only. Never feed it back into the engine.

## 4. Data

Labs project `csaefdkpwukshtouyixg` only. RLS on. `anon` / `authenticated`
have no grants. Service-role is server-only.

The live demo book is one JSON row in `ra_demo_state`. A trigger on that
payload rejects same-person releases. Purchaser pages load an anonymised
card, not the full payer file.

Structured `ra_*` tables exist with RLS on for a later normalised store.
This walkthrough does not write them.

Receivables, collections, payment requests, and distributions are separate
on purpose. A confirmed Pay event (mock or live) updates them once through
the idempotent `applyPaymentOutcome()` helper (`src/lib/rent-advance/payment-apply.ts`).
That helper is the only book-write path, even for live payments.

## 5. Payment boundary (mock + live)

The Pay UI never calls wallet or chain code directly. It talks to a
`PaymentProvider` (`src/lib/pay/provider.ts`) created by
`createPaymentProvider()` (`src/lib/pay/create-provider.ts`) or the
client hook `usePaymentProvider()` (`src/hooks/use-payment-provider.ts`).
`PAYMENT_RAIL_MODE` (`src/lib/pay/mode.ts`) is still `"mock"`, so the app
today runs the mock adapter (`src/lib/pay/mock-provider.ts`) and the demo
outcome menu stays visible.

The approved live MVP foundation is implemented on the feature branch but
**not yet switched on or verified end-to-end**:

- **Privy client boundary** (`src/lib/pay/privy-config.ts`,
  `src/lib/pay/privy-provider.tsx`): wraps the Pay surface in
  `PrivyShell`. External wallets only — embedded wallets are intentionally
  not enabled. Uses the public `NEXT_PUBLIC_PRIVY_APP_ID` (a public App ID,
  not a secret). When `PAYMENT_RAIL_MODE` is `"live"`,
  `usePaymentProvider()` returns the live adapter.
- **viem wallet submission** (`src/lib/pay/live-provider.ts`): creates a
  wallet client from the connected Privy external wallet's provider and
  calls `transfer` on the Circle native USDC contract for the exact atomic
  amount to the receiving EOA. The live chain is resolved to **OP Sepolia**
  only; any other chain is rejected. `reportExternalTransfer`
  (copy-address path) returns `external_not_supported` in live mode.
- **Server-side viem verification** (`src/lib/pay/verify.ts` +
  `verifyLivePaymentAction` in `src/lib/rent-advance/actions.ts`): before
  anything is confirmed, the server verifies on-chain that the hash is a
  real 64-hex value, the chain is OP Sepolia, the receipt did not revert,
  the receipt target is the expected USDC contract, an ERC-20 `Transfer`
  event paid the exact atomic amount to the receiving EOA, and the block
  depth is at least **5 blocks** (`LIVE_CONFIRMATION_BLOCKS`). Only then is
  the book written as confirmed via `applyPaymentOutcome()`. The client can
  no longer mark rent paid on its own; it polls the server.
- **Receiving address**: a valid EOA
  `0x1726cf86DA996BC4B2F393E713f6F8ef83f2e4f6`, labelled the **mock
  receiving address** (the internal `cryptoConfig.safeAddress` field name
  is a legacy alias). It is not a Safe and there is no Safe SDK, Safe
  watching, or holder-payout execution.
- **Networks**: demo `cryptoConfig` defaults to OP Sepolia with Circle
  native USDC. Base Sepolia remains selectable for the mock/demo walkthrough
  but is not a live-verifiable network. Mainnet (OP Mainnet / Base Mainnet)
  stays off and is not reachable in live mode.
- Explorer links render only for a real 64-hex transaction hash on an
  official catalog explorer. Demo `0xDEMO…` hashes never open the explorer.

## 6. Future home

Intended public hosts (direction only, not a deploy permission):
`direct.merkado.cw` and `pay.merkado.cw`. Optional env vars may point Apps
cards at those hosts later. Empty vars use working internal Labs routes.
Nothing in this repo deploys there yet.
