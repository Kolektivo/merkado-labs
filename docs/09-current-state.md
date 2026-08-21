# 09 - Current Product State

**Purpose:** Ground truth. Nothing may be described as live unless it is available on `merkado.cw`.
**Last updated:** August 20, 2026 (PR #22 approved target documented; draft, not deployed)

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

**Verified locally, not deployed:** PR #22 remains a draft stacked on PR #20 /
PR #19. It removes automatic landlord
sale-proceeds settlement: MRA-001, MRA-010, and every new or existing offer
use `landlord_claim`; missing or `automatic` modes migrate to it; and no
offer derives or retains `advance_settlement`. Every fully funded offer uses
`OfferFundingRecord` (**Mock funding recorded**) plus
`LandlordProceedsClaim`. Automatic holder **rent distributions** remain
unchanged and are separate from landlord **sale-proceeds settlement**.

## 1. Production today `[LIVE]`

Merkado on merkado.cw remains the Curaçao marketplace. Cars, listings, scrapers,
and public browse are owned by **merkado-cw**. This Labs repo does not operate
them.

Live production does **not** currently include Merkado Direct or Merkado Pay as
a public product.

## 2. Labs demo today `[LABS]`

Local automated checks were re-run from the repository root on 2026-08-19
after the password-door polish: lint, typecheck, unit tests, and a
production build passed. The hosted URL is not gated until
`LABS_DEMO_PASSWORD` is set on Vercel Production and this change is
deployed.

Local stays open. No Merkado login. Operations live on **Admin**.

| Surface | What a visitor sees |
|---|---|
| Enter `/enter` | Compact shadcn card: Merkado Labs, Shared password, show/hide, Continue. Not a Merkado account. Local without `LABS_DEMO_PASSWORD` skips this page. Hosted production stays locked if the password env is missing. |
| Home `/` | Product home with XCG totals, two featured Marketplace cards (the funded reference and the open Punda studio), Portfolio and Pay doors. No prototype banner, reset, or legal gates. |
| My Offers `/originate` | The two-offer demo book: live **MRA-001** first, open **MRA-010** next. Simulator and Create Offer as the next steps. Advance totals exclude drafts, under-review, and unfunded rows. |
| Create offer `/originate/new` | Six-step wizard with cover photo. A Simulator quote can prefill via `?quote=1&rentCents=&marketCents=&listing=&payer=&months=` and opens on Quote. Submit for review. Only six months can be submitted. |
| Simulator `/originate/simulator` | Rent and typical nearby rent in XCG, Property quality and Payment history sliders, live combined property view, 3 months disabled, 6 months approved, 9/12 simulation-only. Typical home and Small studio presets. Copy quote and Use this quote. Cap quotes cannot be saved. |
| Offer detail `/originate/MRA-*` | **MRA-001**, **MRA-010**, and new offers use the same landlord proceeds claim. Fully funded offers show **Mock funding recorded** and an available claim; partial offers wait for full funding. |
| Marketplace `/offers` | Two anonymised cards: funded **MRA-001** and open **MRA-010** (cheap Punda studio). A holder can buy any portion still open. Funded offers link to the matching Portfolio position. No tenant name, employer, street, agency, or income. |
| Portfolio `/portfolio` | Stable Position IDs. Collected / awaiting distribution / distributed. Automatic holder rent distributions. Purchases from Marketplace appear here. No holder Claim and no transfer UI. |
| Pay `/pay` → `/pay/[paymentRequestId]` | Payment inbox lists the renter’s requests. Amounts show **XCG**; settlement is USDC. Canonical seeded request `payreq-mra-001-202609` is **XCG 3,222.00** / **1,800.00 USDC**. After MRA-010 is purchased, six **XCG 1.79** / **1.00 USDC** requests appear. A later month cannot be paid while an earlier month on the same offer is still open. |
| Admin `/admin` | Bottom of the left nav. Offer table, approval, collections, dual-control, payment network, and Reset. Fee buildup lives here. |
| Account `/account` → `/account/apps` | Labs demo renter **Luuk Weber**. Account chrome still hides the merkado.cw Admin item. **Apps** sits above **Account**. Only **Merkado Pay** and **Merkado Direct** are live. |

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

### Shared demo book (verified)

One JSON book in `ra_demo_state.payload`. Confirming Pay once writes the
payment request as paid, the receivable as received, one collection, an
automatic holder distribution, and ledger rows. Refreshing or retrying the
same request does not duplicate collection or distribution.

After the September Pay confirmation in the walkthrough:

- My Payments next card moved to **October 2026**
- My Offers MRA-001 showed **Collected XCG 3,222.00 · distributed XCG 3,222.00**
- Portfolio `pos-mra-001` showed the same collection as **Distributed**
- Revisiting `/pay/payreq-mra-001-202609` stayed on **Rent paid**

Reset restores the two seeded offers (**MRA-001** and **MRA-010**), payments,
transactions, and distributions. Loading the book also adds any missing seed
offer and drops retired filler offers (**MRA-002**–**MRA-006**) without wiping
new drafts.

### Privacy walls (verified in the browser)

- Marketplace shows a property photo, district, Property Score, payer band,
  and term. No tenant name, employer, street address, agency, or income
  figure. Holder payloads also omit agency, employment status, and
  rent-to-income band. Rent-to-market is inside the Property Score, not
  published as a standalone marketplace figure.
- Marketplace purchase can take any amount up to what is still open. A
  Portfolio position appears immediately. Pay requests mint when the
  offering is filled. It stays a Labs walkthrough, not a public offering.
- Drafts are not shown as marketplace offers.
- Pay and account show rent to the property, USDC + matching USD rent, due date, and a
  fictional receiving address. No fee, purchase price, holder, or
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
  are auto-distributed and do not re-queue release.
- Dual-control still rejects the same person twice (app check plus the trigger
  on `ra_demo_state`).
- Independent approval still moves a newly submitted Create Offer draft to
  funding from Admin.
- Create offer can save a new six-month draft (MRA-007 in the walkthrough;
  Reset removes it). 9/12 still cannot be saved.
- Pay is English-only. Copy address, amount, and payment history stay visible.
- Later-month Pay links stay readable but send the renter back to the next unpaid month.
- My Payments **Open** is the month due now (plus failed or overdue). **Upcoming** is later months only.
- Copy-address path: **I’ve sent this payment** → pending → Rent paid.
- Mock wallet: disconnected → connected → confirm → pending → Rent paid.
- A draft can be submitted for independent approval.
- Failed and incorrect-amount outcomes can be selected in the demo panel.
- Admin Payment network shows **Base Sepolia**. Base Mainnet
  stays off unless `NEXT_PUBLIC_PAY_NETWORK` is `base-mainnet`. Pay labels
  update. Reset keeps the selected test network.
- Admin Reset the book asks to confirm, then restores the seeded book.
- Landlord proceeds claim (PR #22): every fully funded offer records one
  **mock funding recorded** allocation and one `available` landlord claim.
  Claiming locks an unverified demo payout address; **Mark as paid** is
  terminal (one mocked payout ledger row, `txHash` stays `null`, no
  explorer link); **Mark as failed** allows retry only to the same locked
  address. MRA-001 and MRA-010 use the same claim flow; no automatic landlord
  sale-proceeds settlement remains.

### Mock crypto boundary (Labs only)

UI talks to `createPaymentProvider()` (`src/lib/pay/create-provider.ts`)
and `src/lib/pay/provider.ts`. The only implementation is still
`src/lib/pay/mock-provider.ts`. There is no wallet, Safe, RPC, or USDC
SDK. `PAYMENT_RAIL_MODE` in `src/lib/pay/mode.ts` is still `"mock"`, so
Overview and Pay keep demo-wallet wording. **Base Sepolia** is the default
in `cryptoConfig`. **Base Mainnet** is later. Optimism networks stay in
the catalog if Luis later opts in; they are not shown in Admin.
Luis/Luuk replace the factory and flip that switch after approval. See
`docs/07-integrations.md` and ADR-0005.

On the PR #20 stack, the receiving address is the **verified Base Sepolia
deposit Safe** `0xfC6ec9718d89d4935594E7DB78399913071FcDc4` (Safe v1.4.1,
2-of-3, owners Enrique, Luuk, and Luis) in `cryptoConfig.safeAddress`.
`verify.ts` matches exactly one USDC Transfer to that Safe by
`txHash`/`logIndex` before any confirmation depth check, and
`ra_payment_verifications` (migration `20260820100000`) stores the verified
row idempotently (unique `chain_id, tx_hash, log_index`; one confirmed per
payment request). This stays dormant while the rail is `"mock"`.

## 3. Database `[LABS]`

Allowed project only: `csaefdkpwukshtouyixg`.

Migration `supabase/migrations/20260814120000_rent_advance_rebuild.sql` dropped
the old listing / pipeline tables and created `ra_*` tables with RLS on and no
`anon` / `authenticated` grants. Demo state is stored in `ra_demo_state` and
seeded on first load. Service role is server-only.

A later Labs migration, `20260814140000_ra_demo_state_dual_control.sql`, adds a
trigger that rejects same-person releases inside that JSON book.

`20260820100000_ra_payment_verifications.sql` (PR #20 stack) adds
`ra_payment_verifications` for DB-backed idempotency of live USDC payments:
unique `(chain_id, tx_hash, log_index)`, a partial unique index for at most
one confirmed verification per payment request, RLS on, and no
`anon` / `authenticated` grants.

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
- Not a token, NFT, or secondary market
