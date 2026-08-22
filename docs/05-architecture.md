# 05 - Architecture

**Purpose:** How the Labs demo is put together.
**Last updated:** August 21, 2026 (Base Sepolia transferable NFT rent offer)

## 1. Surfaces

```
merkado-labs
├── src/                    Next.js demo (shadcn)
├── contracts/              MerkadoRentOfferV1 (ERC-721) + deploy/verify scripts
├── supabase/migrations     Labs schema only (chain store tables added with approval)
└── docs/                   Canonical product docs
```

merkado-cw is the live marketplace. This repo does not scrape, enrich, or
publish listings.

Customer-facing surfaces:

- `/` Labs demo hub
- `/originate*` Merkado Direct operations (My Offers, Create Offer, Simulator)
- `/admin*` operations (approval, collections, reset)
- `/offers*` Marketplace
- `/portfolio*` Portfolio
- `/pay` and `/pay/[paymentRequestId]` Merkado Pay. `/pay/payments` redirects to `/pay`.
- `/account` → `/account/apps` fictional account mock (Apps launcher) inside
  merkado-cw navbar / sidebar / footer chrome. Other account links are
  disabled. `/account/payouts` and `/payouts` redirect to My Offers.

## 2. Dashboard

- Server components load one demo book from Labs Supabase (`ra_demo_state`)
  with a seed fallback and `normalizeBook()` for older JSON.
- Mutations are server actions (record collection, dual-control release,
  submit for review, whole-offer purchase, holder claim, confirm rent
  deposit, reset).
- There is no Merkado login. After deploy, the hosted demo asks for a
  shared host password at `/enter`. Reset the book sits in Admin.
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

Labs project `ewoxmzznkavapcxdporm` only. RLS on. `anon` / `authenticated`
have no grants. Service-role is server-only.

The persisted Labs book is one JSON row in `ra_demo_state`. A trigger on that
payload rejects same-person releases. Purchaser pages load an anonymised
card, not the full payer file.

Structured `ra_*` tables exist with RLS on for a later normalised store.
The Base Sepolia flow adds chain store tables — `ra_chain_epochs`,
`ra_chain_offers`, `ra_chain_events`, `ra_rent_payment_attempts`,
`ra_rent_deposit_verifications`, `ra_rent_claim_verifications` — written
only by server-side verification, never by browser code.

Receivables, collections, payment requests, and distributions are separate
on purpose. A confirmed `depositRent` event updates them once through an
idempotent helper.

Each offer stores its payout destination inside the existing JSON payload.
`normalizeBook()` fills these fields for older books. The chain store tables
are the on-chain evidence record; the JSON book is the product state.

## 5. Base Sepolia contract flow

- **Contract.** `MerkadoRentOfferV1`, one non-upgradeable ERC-721, holds
  pooled Circle native USDC rent accounted per `tokenId`. Backend mint key
  (`NEXT_PUBLIC_MERKADO_COMPANY_SAFE`, default
  `0xfC6ec9718d89d4935594E7DB78399913071FcDc4`) mints one NFT per approved
  listing. There is no listing expiry.
- **Transferable NFT.** The current token owner is the holder. Only the
  owner can claim that token's accrued rent (`claimRent(tokenId)`).
- **Purchase.** Any wallet buys the whole offer: buyer pays the exact
  purchase price directly to the locked landlord payout address, and the
  NFT moves Safe → buyer atomically in the same transaction. No fractions.
- **Rent.** The renter deposits via `depositRent(tokenId,
  opaquePaymentId, amount)` — exact monthly amount (app schedules six months).
  The opaque payment id binds the deposit to a payment request, so matching
  does not rely on memo guessing.
- **Wallet.** The UI uses an injected EIP-1193 wallet (WalletConnect /
  Privy later). There is no mock provider, `PAYMENT_RAIL_MODE`, demo wallet,
  demo outcome menu, or demo hashes.
- **Server verification.** The server reads the receipt for the exact
  expected event/log, records it in the chain store tables, and writes the
  book once. Explorer links render only for a real 64-hex transaction hash
  on an official catalog explorer.
- **Configuration.** `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS` is empty until
  deployment; empty shows a not-configured state. Server-only
  `MERKADO_RPC_URL` defaults to `https://sepolia.base.org`.
- **Not activated.** Contract deployment, applying the migration, test
  USDC, Safe transactions, hosted activation, and merging the PR are
  separate gates. Base Mainnet stays off.

## 6. Future home

Intended public hosts (direction only, not a deploy permission):
`direct.merkado.cw` and `pay.merkado.cw`. Optional env vars may point Apps
cards at those hosts later. Empty vars use working internal Labs routes.
Nothing in this repo deploys there yet.
