# 09 - Current Product State

**Purpose:** Ground truth. Nothing may be described as live unless it is available on `merkado.cw`.
**Last updated:** August 19, 2026 (hosted password door polish)

**Labs rebuild (2026-08-14 Product Lead):** Merkado Labs is no longer the
property-scraper kitchen. That work lives on **merkado-cw**. This repository is
the working **Merkado Direct + Merkado Pay** Buildathon demo. The Next.js app
lives at the repository root. There is no Merkado login. The hosted URL
uses a shared host password.

This demo is **not** live on merkado.cw. It may later sit at a surface such as
`app.merkado.cw`. There is no public offering. Wallet and USDC payments are
**mocked**. Direct operations use **USD**. Pay settles in USDC 1:1 on
**OP Sepolia** facts by default (Base Sepolia also available; mainnet
later). The wallet is still mocked.

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

Local automated checks were re-run from the repository root on 2026-08-19
after the password-door polish: lint, typecheck, unit tests, and a
production build passed. The hosted URL is not gated until
`LABS_DEMO_PASSWORD` is set on Vercel Production and this change is
deployed.

Local stays open. No Merkado login, settings, or admin page.

| Surface | What a visitor sees |
|---|---|
| Enter `/enter` | Compact shadcn card: Merkado Labs, Shared password, show/hide, Continue. Not a Merkado account. Local without `LABS_DEMO_PASSWORD` skips this page. Hosted production stays locked if the password env is missing. |
| Overview `/` | Merkado Labs demo hub. Doors for Direct, Pay, and the account mock, plus Payment network and Reset. No prominent “Merkado Rent Advance” brand. |
| My Offers `/originate` | Live and collecting offers appear first; drafts sit lower. Get Now and Create Offer as the obvious next steps. Advance totals exclude drafts, under-review, and unfunded rows. |
| Create offer `/originate/new` | Six-step wizard. “Listing Score” replaces the old Passport step. A Get Now quote can prefill via `?quote=1&rent=&market=&listing=&payer=&related=&months=` and opens on Quote. Only six months can be saved. |
| Get Now `/originate/simulator` | Rent, typical nearby rent, connected-landlord checkbox, Property quality and Payment history sliders, live combined property view, 3 months disabled, 6 months approved, 9/12 simulation-only. Copy quote and Use this quote. Cap quotes cannot be saved. |
| Offer detail `/originate/MRA-*` | One-time settlement reference. Later rent shows collected / pending distribution / distributed. Landlord is not paid again. Drafts keep **Submit for review**. Independent approval, Record collection, and dual-control stay in Lab controls. Funded offers say the landlord **received** the purchase price; unfunded offers say **would receive**. |
| Marketplace `/offers` | Anonymised cards in merkado-cw listing chrome (photo, spec row, price block). Combined property view, payment history, term, and amount filled stay on the card. Amount filled is holder contribution; a tip explains the landlord receives a lower cash amount. Subscribe closed. Funded offers link to the matching Portfolio position. No tenant name, employer, street, agency, or income. |
| Portfolio `/portfolio` | Stable Position IDs. Collected / awaiting distribution / distributed. Automatic distributions. No Claim and no transfer UI. Truncated hash with copy of the full value. Explorer link only for a real 64-hex hash. |
| Pay `/pay` → `/pay/[paymentRequestId]` | Mocked USDC payment-link on the selected network (**OP Sepolia** after Reset). Canonical seeded request `payreq-mra-001-202609`. `/pay` opens the next unpaid renter request. The same page shows the USDC amount, due date, copy details, both pay actions, and **Payment history**. `/pay/payments` redirects here. Both paths show pending, then success, plus failed and incorrect-amount outcomes. Amount is **1,800.00 USDC**, same as $1,800 rent. A later month cannot be paid while an earlier month is still open. Unknown IDs show a friendly not-found. English only. |
| Account `/account` → `/account/apps` | Labs demo renter **Luuk Weber**, shown as a private seller with the supplied avatar. Full merkado-cw account chrome (logo, top nav, sidebar groups, footer pinned to the bottom of the screen). Marketplace, listing, billing, settings, and other chrome look disabled. Admin is hidden. **Apps** sits above **Account**. Only **Merkado Pay** and **Merkado Direct** are live, with external-link icons. **My Payments** is not an account page. Old `/account/payments` redirects into Pay. |

Old URLs (`/login`, `/settings`, `/originate/readiness`, `/pay/home`, and the
other retired payer subpages) still redirect. `/pay/history` is not reused.

### Locked MRA-001 figures (verified)

- Monthly rent **$1,800.00** (180000 cents)
- Estimated market rent **$3,000.00** (rent-to-market **0.60**)
- Term **6 months**
- Gross receivables **$10,800.00**
- Fee **5.50% = $594.00**
- Purchase price **$10,206.00**
- Effective annualised **≈ 21.6%** (under the 24% hard cap)
- Listing Score **89** (pricing input). Derived Property Score **98**.
- Pay request amount: **1,800.00 USDC** (atomic `1800000000`)
- Network default: **OP Sepolia** (chain ID 11155420). Circle native USDC
  `0x5fd84259d66Cd46123540766Be93DFE6D43130D7`. Base Sepolia is
  selectable. OP Mainnet and Base Mainnet stay later.

A weak-score + related-party quote is blocked by the 24% cap. Use this quote
stays disabled. There is no override.

### Shared demo book (verified)

One JSON book in `ra_demo_state.payload`. Confirming Pay once writes the
payment request as paid, the receivable as received, one collection, an
automatic holder distribution, and ledger rows. Refreshing or retrying the
same request does not duplicate collection or distribution.

After the September Pay confirmation in the walkthrough:

- My Payments next card moved to **October 2026**
- My Offers MRA-001 showed **Collected $1,800.00 · distributed $1,800.00**
- Portfolio `pos-mra-001` showed the same collection as **Distributed**
- Revisiting `/pay/payreq-mra-001-202609` stayed on **Rent paid**

Reset restores the seeded offers, payments, transactions, and distributions.

### Privacy walls (verified in the browser)

- Marketplace shows a property photo, district, Property Score, payer band,
  and term. No tenant name, employer, street address, agency, or income
  figure. Holder payloads also omit agency, employment status, and
  rent-to-income band. Rent-to-market is inside the Property Score, not
  published as a standalone marketplace figure.
- Subscribe is closed and does not complete a purchase.
- Drafts are not shown as marketplace offers.
- Pay and account show rent to the property, USDC + matching USD rent, due date, and a
  fictional receiving address. No fee, purchase price, holder, or
  distribution economics.
- Holder pages stay district-only. Street address is off those screens.
- Invalid Pay links do not reveal other payment requests.

### Working demo actions (verified)

- Get Now 9/12 months can be simulated; Use this quote stays disabled.
- Use this quote prefills Create Offer on the Quote step with the locked
  MRA-001 six-month figures when defaults are used.
- Record collection is offered only on live, collecting, or defaulted offers,
  lives in Lab controls, and uses the same stable collection IDs as Pay.
- Dual-control release stays in Lab controls. Pay-confirmed collections
  are auto-distributed and do not re-queue release.
- Dual-control still rejects the same person twice (app check plus the trigger
  on `ra_demo_state`).
- Independent approval still moves under-review offer MRA-004 to funding.
- Create offer can save a new six-month draft (MRA-007 in the walkthrough;
  Reset removes it). 9/12 still cannot be saved.
- Pay is English-only. Copy address, amount, and payment history stay visible.
- Later-month Pay links stay readable but send the renter back to the next unpaid month.
- My Payments **Open** is the month due now (plus failed or overdue). **Upcoming** is later months only.
- Copy-address path: **I’ve sent this payment** → pending → Rent paid.
- Mock wallet: disconnected → connected → confirm → pending → Rent paid.
- A draft can be submitted for independent approval.
- Failed and incorrect-amount outcomes can be selected in the demo panel.
- Overview Payment network switches OP Sepolia and Base Sepolia. Mainnet
  stays off unless `NEXT_PUBLIC_PAY_NETWORK` is a mainnet key. Pay labels
  update. Reset keeps the selected test network.
- Overview Reset demo asks to confirm, then restores the seeded book.

### Mock crypto boundary (Labs only)

UI talks to `createPaymentProvider()` (`src/lib/pay/create-provider.ts`)
and `src/lib/pay/provider.ts`. The only implementation is still
`src/lib/pay/mock-provider.ts`. There is no wallet, Safe, RPC, or USDC
SDK. OP Sepolia is the default in `cryptoConfig`. Base Sepolia is
available. OP Mainnet and Base are later. Luis/Luuk replace the factory
with a real adapter after approval. See `docs/07-integrations.md` and
ADR-0005.

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
- Not a token, NFT, or secondary market
