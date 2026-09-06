# 05 - Architecture

**Purpose:** How the Labs demo is put together.
**Last updated:** September 5, 2026 (Supabase Auth, shared store, linked wallet, ADMIN_EMAILS admin)

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
- `/enter` sign-in door (Supabase Auth email magic link; legacy host password fallback)
- `/auth/callback` and `/auth/complete` Supabase Auth PKCE / magic-link completion
- `/originate*` Merkado Direct operations (My Offers, Create Offer, Simulator)
- `/admin*` operations (approval, collections, reset) — ADMIN_EMAILS allowlist only
- `/offers*` Marketplace
- `/portfolio*` Portfolio
- `/pay` and `/pay/[paymentRequestId]` Merkado Pay. `/pay/payments` redirects to `/pay`.
- `/account` → `/account/apps` account shell (Apps launcher) inside
  merkado-cw navbar / sidebar / footer chrome. Other account links are
  disabled. `/account/payouts` and `/payouts` redirect to My Offers.

## 2. Dashboard

- Server components load the one shared demo book from Labs Supabase
  (`ra_demo_state id='live' AND account_id IS NULL`) with a seed fallback and
  `normalizeBook()` for older JSON. Account-specific selectors provide the
  landlord workflow, while wallet-specific selectors provide renter and holder
  role views.
- Identity is **Supabase Auth** (email magic links only). Server
  components and server actions resolve the user through `@supabase/ssr`
  (`src/lib/supabase/server-client.ts`); browser code uses a matching
  browser client. An optional **stay signed in** cookie preference controls
  session cookie persistence. `requireUser()` redirects to `/enter`;
  `requireAdminUser()` also enforces the `ADMIN_EMAILS` allowlist.
- Admin is a server-side `ADMIN_EMAILS` allowlist, enforced on Admin pages
  and every Admin server action (fail closed when set). The Admin nav item
  renders only for allowlisted emails.
- Mutations are server actions (record collection, dual-control release,
  submit for review, whole-offer purchase, holder claim, confirm rent
  deposit, reset). Marketplace purchases and Portfolio `claimRent` use the
  account's **linked wallet** (`src/lib/wallet-link/*`): connection alone
  never links — the wallet signs a server-issued, account/domain/chain/nonce
  bound challenge stored in `ra_link_challenges`, consumed atomically, with
  at most one active row in `ra_account_wallets`.
- Pending transaction recovery: a submitted purchase / deposit / claim hash
  is bound to the account + offer/payment request + token + chain + contract
  + epoch (compare-and-set, first valid submission wins). Verification
  derives the sender from verified chain facts, never a client-supplied
  address; **Check status** re-verifies the stored hash, never blind
  re-sends. Mint recovery pins to the offer's original contract at
  broadcast; the env address is used only for new broadcasts.
- The hosted edge gate (`src/proxy.ts`) fails closed: `/enter` (Supabase
  Auth sign-in) is reachable; an authenticated Supabase session or a valid
  legacy `LABS_DEMO_PASSWORD` gate cookie may pass, hosted production
  otherwise redirects to `/enter`. Reset the book sits in Admin. **Reset**
  seeds a fresh demo book (canonical offers as `funding`, empty on-chain
  state) and starts a **new chain-store epoch** (prior active epochs
  deactivated atomically) so old on-chain facts are never reused. It does
  **not** roll back the chain; the env contract address stays active so
  approved offers mint again on the same deployment.
- Pay uses a payment-link shell (`src/app/pay/layout.tsx`). Account uses
  its own Labs shell. Direct operations use the sidebar shell
  (`src/app/(direct)/layout.tsx`). The shells are separate layouts
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

The persisted Labs book is one shared JSON row in `ra_demo_state`, keyed
`id='live'` with `account_id IS NULL`. Existing account-owned rows are dormant
and are not read by the shared-state paths. A trigger on that payload rejects
same-person releases. Purchaser pages load an anonymised card, not the full
payer file.

Wallet linking adds two tables from
`20260831000000_labs_accounts_and_wallets.sql`: `ra_link_challenges`
(server-issued one-time challenges) and `ra_account_wallets` (at most one
active wallet per account). That migration is applied to Labs. The remote
Labs database also contains the chain-store tables, but local migration
history does not record `20260821120000` as applied; reconcile that history
before relying on or changing the chain store.

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
- **Wallet.** The UI uses an Reown/AppKit wallet (Reown/AppKit (injected EIP-1193)) (WalletConnect /
  Privy later). There is no mock provider, `PAYMENT_RAIL_MODE`, demo wallet,
  demo outcome menu, or demo hashes.
- **Server verification.** The server reads the receipt for the exact
  expected event/log, records it in the chain store tables, and writes the
  book once. Explorer links render only for a real 64-hex transaction hash
  on an official catalog explorer.
- **Pending-transaction recovery.** A submitted purchase / deposit / claim
  tx hash is bound to the account + offer/payment request + token + chain +
  contract + epoch and persisted compare-and-set (first valid submission
  wins). Verification derives the sender from verified chain facts, never a
  client-supplied address; **Check status** re-verifies the stored hash,
  never blind re-sends. Mint recovery pins to the offer's original contract
  at broadcast; the env address is used only for new broadcasts.
- **Chain-store epochs.** Exactly one active epoch exists after any write:
  a new epoch first deactivates every prior active row, then inserts the new
  one, so a stale active epoch is never picked up. Reset starts a new epoch
  so old on-chain facts are never reused.
- **Pay QR (informational).** The QR, **copy address**, and **copy amount**
  controls in the expanded **Pay with stablecoin** panel display the
  receiving address, USDC amount, and payment reference only. They never
  submit a payment; the wallet **Pay rent** action calling
  `depositRent(tokenId, opaquePaymentId, amount)` is the only valid payment
  path. Server verification remains authoritative and only verified chain
  events may mark rent paid.
- **Configuration.** `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS` is empty until
  deployment; empty shows a not-configured state. Server-only
  `MERKADO_RPC_URL` defaults to `https://sepolia.base.org`.
- **Not activated.** Contract deployment, applying the new migrations
  (chain store `20260821120000` and accounts/wallets
  `20260831000000`), test USDC, Safe transactions, hosted activation, and
  merging the PR are separate gates. Base Mainnet stays off.

## 6. Future home

Intended public hosts (direction only, not a deploy permission):
`direct.merkado.cw` and `pay.merkado.cw`. Optional env vars may point Apps
cards at those hosts later. Empty vars use working internal Labs routes.
Nothing in this repo deploys there yet.
