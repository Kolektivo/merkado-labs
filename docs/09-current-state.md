# 09 - Current Product State

**Purpose:** Ground truth. Nothing may be described as live unless it is available on `merkado.cw`.
**Last updated:** August 21, 2026 (Base Sepolia transferable NFT rent offer)

**Labs rebuild (2026-08-14 Product Lead):** Merkado Labs is no longer the
property-scraper kitchen. That work lives on **merkado-cw**. This repository is
the working **Merkado Direct + Merkado Pay** Buildathon demo. The Next.js app
lives at the repository root. There is no Merkado login. The hosted URL
uses a shared host password.

This demo is **not** live on merkado.cw. There is no public offering.
Direct operations show **XCG** at **1.79 to the dollar**. Pay settles in USDC
1:1 with stored USD rent on **Base Sepolia** facts by default. Base Mainnet
stays later.

The Base Sepolia NFT flow (ADR-0008) is **implemented locally behind
configuration — NOT deployed, NOT activated, NOT merged**. The contract
(`MerkadoRentOfferV1`) is not deployed, `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS`
is empty (surfaces show a not-configured state), the chain store migration is
not applied, no test USDC has been sent, no Safe transaction has executed, and
no PR has been merged. The mock payment/wallet layer (`PAYMENT_RAIL_MODE`,
mock provider, demo wallet, demo outcome menu, demo hashes) is removed.

merkado-cw remains the live cars + real-estate marketplace. Its **Property
Passport** is listing history on a property page. This demo's **Listing Score**
is the raw underwriting input. **Property Score** is a derived presentation
figure. They are different products.

## 1. Production today `[LIVE]`

Merkado on merkado.cw remains the Curaçao marketplace. Cars, listings, scrapers,
and public browse are owned by **merkado-cw**. This Labs repo does not operate
them.

Live production does **not** currently include Merkado Direct or Merkado Pay as
a public product.

## 2. Labs demo today `[LABS]`

The flow is implemented locally behind configuration. It is **not deployed,
not activated, and not merged**. Local stays open. No Merkado login. Operations
live on **Admin**. Hosted production fails closed at `/enter`; unlocking it
requires `LABS_DEMO_PASSWORD`.

| Surface | What a visitor sees |
|---|---|
| Enter `/enter` | Compact shadcn card: Merkado Labs, Shared password, show/hide, Continue. Not a Merkado account. Local without `LABS_DEMO_PASSWORD` skips this page. Hosted production stays locked if the password env is missing. |
| Home `/` | Product home headed **Rent paid forward**. Offer updates stay in the header bell and nav counts only. Two featured Marketplace cards remain. |
| My Offers `/originate` | A table focuses on Under review, Listed, Sold, and Paid. Draft/unfunded rows are not counted. There is no landlord claim action and no listing expiry. |
| Create offer `/originate/new` | Seven-step wizard with cover photo and Payout before Review. The landlord locks a payout destination before submission. No landlord wallet. Only six months can be submitted. |
| Simulator `/originate/simulator` | Rent and typical nearby rent in XCG, Property quality and Payment history sliders, live combined property view, 3 months disabled, 6 months approved, 9/12 simulation-only. Typical home and Small studio presets. Copy quote and Use this quote. Cap quotes cannot be saved. |
| Offer detail `/originate/MRA-*` | Property name first. A Landlord proceeds card shows Waiting, Processing, Failed, or Paid. Paid is final when the sale completes (buyer pays the locked landlord address). Listed offers stay purchasable (no expiry). |
| Marketplace `/offers` | Two anonymised cards. Open offers show one whole-offer price. Purchase connects a real injected wallet and buys the whole offer; the buyer pays the exact purchase price to the locked landlord address and the NFT moves Safe → buyer atomically. If `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS` is empty, purchase shows a not-configured state. |
| Portfolio `/portfolio` | Property name leads. The offer token id, accrued rent per token, and current owner remain visible. The current NFT owner calls **Claim rent** (`claimRent`); non-owners are rejected. Transferring the NFT moves claim rights with it. |
| Pay `/pay` → `/pay/[paymentRequestId]` | Amounts show XCG with USDC settlement. Rent is deposited via `depositRent(tokenId, opaquePaymentId, amount)` — exact monthly amount, max 6 installments. Pending → confirmed on chain. No demo outcomes. A later month cannot be paid while an earlier month on the same offer is open. If the contract env is empty, the pay action shows a not-configured state. |
| Admin `/admin` | Bottom of the left nav. Offer table, approval, collections, dual-control, payment network, and Reset. Independent approval offers **Enrique** or **Luuk**. Fee buildup lives here. |
| Account `/account` → `/account/apps` | Labs demo renter **Luuk Weber**. Account chrome still hides the merkado.cw Admin item. **Apps** sits above **Account**. **Merkado Pay** and **Merkado Direct** are enabled. Old `/account/payouts` and `/payouts` open My Offers. |

Old URLs (`/login`, `/settings`, `/originate/readiness`, `/pay/home`, and the
other retired payer subpages) still redirect. `/pay/history` is not reused.

### Locked MRA-001 figures (verified)

- Monthly rent **$1,800.00** stored (shown as **XCG 3,222.00**)
- Estimated market rent **$3,000.00** stored (shown as **XCG 5,370.00**)
- Term **6 months**
- Gross receivables **$10,800.00** (shown as **XCG 19,332.00**)
- Fee **5.50% = $594.00** (shown as **XCG 1,063.26**)
- Purchase price **$10,206.00** (shown as **XCG 18,268.74**)
- Effective annualised **≈ 21.6%** (under the 24% hard cap)
- Listing Score **89** (pricing input). Derived Property Score **98**.
- Pay request amount: **XCG 3,222.00** / **1,800.00 USDC** (atomic `1800000000`)
- Network default: **Base Sepolia** (chain ID 84532). Circle native USDC
  `0x036CbD53842c5426634e7929541eC2318f3dCF7e`. Base Mainnet stays later
  and is hidden unless `NEXT_PUBLIC_PAY_NETWORK` is `base-mainnet`.
- Company Safe (default for `NEXT_PUBLIC_MERKADO_COMPANY_SAFE`):
  `0xfC6ec9718d89d4935594E7DB78399913071FcDc4` (Base Sepolia, 2 of 3).

A weak-score + related-party quote is blocked by the 24% cap. Use this quote
stays disabled. There is no override.

MRA-001 starts fully purchased with its sale marked **Paid**; MRA-010 starts
minted and still open on Marketplace. After Reset, that seed is restored.

### Shared demo book (verified)

One JSON book in `ra_demo_state.payload`. A confirmed `depositRent` writes the
payment request as paid, the receivable as received, one collection, and
claimable rent for the current NFT owner. Refreshing or retrying the same
request does not duplicate collection.

Reset restores the two seeded offers (**MRA-001** and **MRA-010**), payments,
transactions, and distributions. Loading the book also adds any missing seed
offer and drops retired filler offers (**MRA-002**–**MRA-006**) without wiping
new drafts.

### Privacy walls (verified)

- Marketplace shows a property photo, district, Property Score, payer band,
  and term. No tenant name, employer, street address, agency, or income
  figure. Holder payloads also omit agency, employment status, and
  rent-to-income band, plus the internal related-party flag and note.
- Marketplace purchase takes the complete open offer only. A Portfolio position
  appears immediately. It stays a Labs walkthrough, not a public offering.
- Drafts are not shown as marketplace offers.
- Pay and account show rent to the property, USDC + matching USD rent, due date,
  opaque payment id, and the public contract address. No fee, purchase price,
  holder, or distribution economics.
- Holder pages stay district-only. Street address is off those screens.
- Invalid Pay links do not reveal other payment requests.
- On-chain wallet addresses, token ids, and payout amounts become public once
  the contract is active; tenant and property identity stay off-chain.

### Working demo actions (verified locally behind config)

- Simulator 9/12 months can be simulated; Use this quote stays disabled.
- Use this quote prefills Create Offer on the Quote step with the locked
  MRA-001 six-month figures when defaults are used.
- Record collection is offered only on live, collecting, or defaulted offers,
  lives in Admin, and uses the same stable collection IDs as Pay.
- Dual-control release stays in Admin. Pay-confirmed deposits land as claimable
  rent for the current owner. They do not re-queue dual-control release.
- Dual-control still rejects the same person twice (app check plus the trigger
  on `ra_demo_state`).
- Independent approval moves a newly submitted Create Offer request to funding
  from Admin; with the contract env set, the server mints the offer NFT from
  the company Safe.
- Create offer can save a new six-month draft (MRA-007 in the walkthrough;
  Reset removes it). 9/12 still cannot be saved.
- Pay is English-only. Copy address, amount, and payment history stay visible.
- Later-month Pay links stay readable but send the renter back to the next unpaid month.
- My Payments **Open** is the month due now (plus failed or overdue). **Upcoming** is later months only.
- A draft can be submitted for independent approval. No wallet is required.
- After MRA-010 is purchased, the **Landlord proceeds** card becomes **Paid**:
  the buyer paid the exact purchase price to the locked landlord address. There
  is no landlord claim button.
- After a rent deposit is confirmed, the current NFT owner calls **Claim rent**
  in Portfolio; non-owners are rejected. Whole-offer purchase and holder rent
  claim each show a clear success dialog.
- There is no listing expiry; offers stay purchasable until sold.
- Admin Payment network shows **Base Sepolia**. Base Mainnet
  stays off unless `NEXT_PUBLIC_PAY_NETWORK` is `base-mainnet`. Pay labels
  update. Reset keeps the selected test network.
- Admin Reset the book asks to confirm, then restores the seeded book.
- With `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS` empty, purchase and pay actions
  show a quiet **not configured** state and never fake a transaction.

### Base Sepolia flow status (NOT deployed / NOT activated / NOT merged)

- `MerkadoRentOfferV1` contract source is in the repo (ADR-0008), but the
  contract is **not deployed** and `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS` is
  **empty**.
- The chain store migration (`ra_chain_epochs`, `ra_chain_offers`,
  `ra_chain_events`, `ra_rent_payment_attempts`,
  `ra_rent_deposit_verifications`, `ra_rent_claim_verifications`) is **not
  applied**.
- No test USDC has been sent and no Safe transaction has executed.
- Hosted activation and merging this PR are **not approved**.
- The mock layer (`PAYMENT_RAIL_MODE`, `src/lib/pay/mock-provider.ts`, demo
  wallet, demo outcome menu, demo hashes) is **removed**.

## 3. Database `[LABS]`

Allowed project only: `csaefdkpwukshtouyixg`.

Migration `supabase/migrations/20260814120000_rent_advance_rebuild.sql` dropped
the old listing / pipeline tables and created `ra_*` tables with RLS on and no
`anon` / `authenticated` grants. Demo state is stored in `ra_demo_state` and
seeded on first load. Service role is server-only.

A later Labs migration, `20260814140000_ra_demo_state_dual_control.sql`, adds a
trigger that rejects same-person releases inside that JSON book.

The Buildathon book extension (accounts, payment requests, ledger,
distributions, positions, crypto config) lives **inside the existing JSON
payload**. A failed Labs read no longer overwrites the live book with seed.

The chain store migration for the Base Sepolia flow is planned but **not yet
applied**. All new tables have RLS on and no `anon` / `authenticated` grants;
they are written only by server-side verification.

## 4. What was removed from this repo

- Python scrapers and the property pipeline
- Browse / listings / enrichment / What Fits Me dashboard pages
- Listing-specific GitHub Actions
- Root Python package and tests
- The nested `apps/labs-dashboard` app (the demo is now the repository root)
- Login, Settings, admin cookie, readiness, audit, and extra payer subpages
- Historical listing migrations from the working tree
- The mock payment/wallet layer: `PAYMENT_RAIL_MODE`, the mock provider, the
  demo wallet, the demo outcome menu, and demo `0xDEMO…` hashes

## 5. What this is not

- Not live on merkado.cw
- Not a loan, yield product, fund, or public offering
- Not a deployed or activated NFT contract: `MerkadoRentOfferV1` is not on
  Base Sepolia yet
- Not authorised for third-party subscribe until M.1.2 and M.1.4 are closed
  in writing
- Not a public token market or secondary market. Merkado mints the offer NFT,
  then the buyer holds it (ADR-0008)
- Not on Base Mainnet; real funds and production stay blocked