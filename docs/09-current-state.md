# 09 - Current Product State

**Purpose:** Ground truth. Nothing may be described as live unless it is available on `merkado.cw`.
**Last updated:** August 21, 2026 (payout-first, whole-offer flow)

**Labs rebuild (2026-08-14 Product Lead):** Merkado Labs is no longer the
property-scraper kitchen. That work lives on **merkado-cw**. This repository is
the working **Merkado Direct + Merkado Pay** Buildathon demo. The Next.js app
lives at the repository root. There is no Merkado login. The hosted URL
uses a shared host password.

This demo is **not** live on merkado.cw. It may later sit at a surface such as
`app.merkado.cw`. There is no public offering. Wallet and USDC payments are
**mocked**. Direct operations show **XCG** at **1.79 to the dollar**. Pay still
settles in USDC 1:1 with stored USD rent on **Base Sepolia** facts by
default. Base Mainnet stays later. The wallet is still mocked.

merkado-cw remains the live cars + real-estate marketplace. Its **Property
Passport** is listing history on a property page. This demo’s **Listing Score**
is the raw underwriting input. **Property Score** is a derived presentation
figure. They are different products.

## 1. Production today `[LIVE]`

Merkado on merkado.cw remains the Curaçao marketplace. Cars, listings, scrapers,
and public browse are owned by **merkado-cw**. This Labs repo does not operate
them.

Live production does **not** currently include Merkado Direct or Merkado Pay as
a public product.

## 2. Labs demo today `[LABS]`

Local automated checks were re-run from the repository root on 2026-08-21
after the Luuk flow update and review fixes: lint, typecheck, unit tests (80),
and build passed. Vercel Production still points to `main` commit
`8b0be45`; the current working tree is not deployed. Hosted production
fails closed at `/enter`. Unlocking it requires `LABS_DEMO_PASSWORD`.

Local stays open. No Merkado login. Operations live on **Admin**.

| Surface | What a visitor sees |
|---|---|
| Enter `/enter` | Compact shadcn card: Merkado Labs, Shared password, show/hide, Continue. Not a Merkado account. Local without `LABS_DEMO_PASSWORD` skips this page. Hosted production stays locked if the password env is missing. |
| Home `/` | Product home headed **Rent paid forward**. Offer updates stay in the header bell and nav counts only. Two featured Marketplace cards remain. |
| My Offers `/originate` | A table focuses on Under review, Listed, Denied, Sold, Expired, and automatic payout. Phones use compact rows. Filters and book totals are collapsed. There is no landlord sale claim action. |
| Create offer `/originate/new` | Seven-step wizard with cover photo and Payout before Review. The active demo path requires a fictional `0xDEMO…` crypto address. Girasol bank payout is a Coming soon preview with an illustrative 1.5% fee and unsaved fictional fields. No landlord wallet. Only six months can be submitted. |
| Simulator `/originate/simulator` | Rent and typical nearby rent in XCG, Property quality and Payment history sliders, live combined property view, 3 months disabled, 6 months approved, 9/12 simulation-only. Typical home and Small studio presets. Copy quote and Use this quote. Cap quotes cannot be saved. |
| Offer detail `/originate/MRA-*` | Property name first. Three short facts lead into a Landlord proceeds card: Waiting, Processing, Failed, or Paid automatically. The landlord timeline excludes monthly collections and holder detail. Listed / sold offers can be shared. |
| Marketplace `/offers` | Two anonymised cards. Open offers show one whole-offer price and a 60-day deadline. Purchase requires the mocked **Connect wallet** button; the server helper rejects fractions and expired offers. A successful purchase lands on Portfolio. |
| Portfolio `/portfolio` | Property name leads. The per-offer rent address, collected / ready to claim / claimed remain visible. Claim rent requires the mocked **Connect wallet** button, then opens the existing success dialog. |
| Pay `/pay` → `/pay/[paymentRequestId]` | Amounts show XCG with USDC settlement. Stablecoin is the default expanded card with an informational demo QR, copy details, and **I’ve sent this payment**. There is no Connect wallet action. **Continue with Sentoo** stays collapsed until opened; its fictional fields are not saved and its action is disabled. A later month cannot be paid while an earlier month on the same offer is open. |
| Admin `/admin` | Bottom of the left nav. Offer table, approval, collections, dual-control, payment network, and Reset. Independent approval offers **Enrique** or **Luuk**. Fee buildup lives here. |
| Account `/account` → `/account/apps` | Labs demo renter **Luuk Weber**. Account chrome still hides the merkado.cw Admin item. **Apps** sits above **Account**. **Merkado Pay** and **Merkado Direct** are enabled. **Account Settings** stays visible but inactive. Payouts is not in this chrome. Old `/account/payouts` and `/payouts` open My Offers. |

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

A weak-score + related-party quote is blocked by the 24% cap. Use this quote
stays disabled. There is no override.

MRA-001 starts fully purchased with its sale proceeds marked **Paid
automatically** to the saved fictional address. MRA-010 starts created by
Merkado, listed for 60 days, and still unsold. After Reset,
that seed is restored.

### Shared demo book (verified)

One JSON book in `ra_demo_state.payload`. Confirming Pay once writes the
payment request as paid, the receivable as received, one collection, and a
**pending** holder claim. The holder then claims it. Refreshing or
retrying the same request does not duplicate collection.

After the September Pay confirmation in the walkthrough:

- My Payments next card moved to **October 2026**
- My Offers MRA-001 showed the September rent as collected
- Portfolio `pos-mra-001` showed that rent as ready to claim until
  **Claim rent** is clicked
- Revisiting `/pay/payreq-mra-001-202609` stayed on **Rent paid**

Reset restores the two seeded offers (**MRA-001** and **MRA-010**), payments,
transactions, and distributions. Loading the book also adds any missing seed
offer and drops retired filler offers (**MRA-002**–**MRA-006**) without wiping
new drafts.

### Privacy walls (verified in the browser)

- Marketplace shows a property photo, district, Property Score, payer band,
  and term. No tenant name, employer, street address, agency, or income
  figure. Holder payloads also omit agency, employment status, and
  rent-to-income band, plus the internal related-party flag and note.
  Rent-to-market is inside the Property Score, not published as a
  standalone marketplace figure.
- Marketplace purchase takes the complete open offer only. A Portfolio position
  appears immediately and Pay requests mint in the same update. It stays a Labs
  walkthrough, not a public offering.
- Drafts are not shown as marketplace offers.
- Pay and account show rent to the property, USDC + matching USD rent, due date, and a
  fictional **offer collection address** after sale. No fee, purchase price, holder, or
  distribution economics.
- Holder pages stay district-only. Street address is off those screens.
- Invalid Pay links do not reveal other payment requests.

### Working demo actions (verified)

- Simulator 9/12 months can be simulated; Use this quote stays disabled.
- Use this quote prefills Create Offer on the Quote step with the locked
  MRA-001 six-month figures when defaults are used.
- Record collection is offered only on live, collecting, or defaulted offers,
  lives in Admin, and uses the same stable collection IDs as Pay.
- Dual-control release stays in Admin. Pay-confirmed collections
  land on the listing. The holder claims them from Portfolio. They do
  not re-queue dual-control release.
- Dual-control still rejects the same person twice (app check plus the trigger
  on `ra_demo_state`).
- Independent approval still moves a newly submitted Create Offer request to
  funding from Admin and records that Merkado created the offer.
- Create offer can save a new six-month draft (MRA-007 in the walkthrough;
  Reset removes it). 9/12 still cannot be saved.
- Pay is English-only. Copy address, amount, and payment history stay visible.
- Later-month Pay links stay readable but send the renter back to the next unpaid month.
- My Payments **Open** is the month due now (plus failed or overdue). **Upcoming** is later months only.
- Copy-address path: **I’ve sent this payment** → pending → Rent paid.
  Pay has no Connect wallet action.
- A draft can be submitted for independent approval. No wallet is required.
- After MRA-010 is purchased, the **Landlord proceeds** card becomes Paid
  automatically to the address saved before submission. There is no landlord
  claim button, settlement hash, or explorer link.
- After Pay is confirmed, Portfolio requires the mocked owner-wallet step;
  **Claim rent** then moves that month to the holder. Whole-offer purchase and
  holder rent claim each show a clear success dialog.
- Open Marketplace offers carry `expiresAt = publishedAt + 60 days`. The
  server purchase helper rejects an expired offer.
- The Pay QR uses an inert `merkado-demo:` payload containing the fictional
  offer address, USDC amount, and human reference. The Sentoo and Girasol bank
  fields are visual only and are never persisted.
- Failed and incorrect-amount outcomes stay in the typed mock provider for
  a later live rail. Pay no longer shows a demo-outcomes menu.
- Admin Payment network shows **Base Sepolia**. Base Mainnet
  stays off unless `NEXT_PUBLIC_PAY_NETWORK` is `base-mainnet`. Pay labels
  update. Reset keeps the selected test network.
- Admin Reset the book asks to confirm, then restores the seeded book.

### Mock crypto boundary (Labs only)

UI talks to `createPaymentProvider()` (`src/lib/pay/create-provider.ts`)
and `src/lib/pay/provider.ts`. The only implementation is still
`src/lib/pay/mock-provider.ts`. There is no wallet, Safe, RPC, or USDC
SDK. `PAYMENT_RAIL_MODE` in `src/lib/pay/mode.ts` is still `"mock"`, so
Pay confirms with **I’ve sent this payment** and mocked settlement copy.
Marketplace and Portfolio keep mocked Connect wallet wording. **Base Sepolia** is the default
in `cryptoConfig`. **Base Mainnet** is later. Optimism networks stay in
the catalog if Luis later opts in; they are not shown in Admin.
Luis/Luuk reconcile the provider seam and flip that switch only after the
audit blockers are fixed and approved. Draft PRs 19, 20, and 22 stay
unmerged. See `docs/07-integrations.md` and ADR-0005 / ADR-0006.

Marketplace and Portfolio show a mocked **Connect wallet** button that sets
only a local fictional address and never calls WalletConnect or Privy.
`qrcode.react` renders the public mock Pay payload; it is not a payment or
wallet dependency. Pay does not show Connect wallet.

The local mock also normalizes away legacy `advance_settlement` ledger
rows and clears their offer / position references. Landlord and
sale-proceeds demo hashes are discarded instead of merely hidden.

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
payload**. No new migration was applied. A failed Labs read no longer
overwrites the live book with seed.

## 4. What was removed from this repo

- Python scrapers and the property pipeline
- Browse / listings / enrichment / What Fits Me dashboard pages
- Listing-specific GitHub Actions
- Root Python package and tests
- The nested `apps/labs-dashboard` app (the demo is now the repository root)
- Login, Settings, admin cookie, readiness, audit, and extra payer subpages
- Historical listing migrations from the working tree

## 5. What this is not

- Not live on merkado.cw
- Not a loan, yield product, fund, or public offering
- Not a real wallet, Safe, or USDC product
- Not authorised for third-party subscribe until M.1.2 and M.1.4 are closed
  in writing
- Not a public token market or secondary market. The offer is created by
  Merkado and later held by the buyer (ADR-0006). Crypto stays mocked.
