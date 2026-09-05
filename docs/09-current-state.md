# 09 - Current Product State

**Purpose:** Ground truth. Nothing may be described as live unless it is available on `merkado.cw`.
**Last updated:** September 1, 2026 (Labs Auth/account/wallet implementation — not merged or activated)

**Labs rebuild (2026-08-14 Product Lead):** Merkado Labs is no longer the
property-scraper kitchen. That work lives on **merkado-cw**. This repository is
the working **Merkado Direct + Merkado Pay** Buildathon demo. The Next.js app
lives at the repository root. Labs now has an Auth implementation behind
configuration; it is not production Merkado authentication. The hosted URL
retains the deployment gate before sign-in.

This demo is **not** live on merkado.cw. There is no public offering.
Direct operations show **XCG** at **1.79 to the dollar**. Pay settles in USDC
1:1 with stored USD rent on **Base Sepolia** facts by default. Base Mainnet
stays later.

The Base Sepolia NFT flow (ADR-0008) is **implemented locally behind
configuration — NOT activated, NOT merged**. A Base Sepolia test deployment
exists for local/staging verification, but hosted activation is not approved.
The remote Labs database contains the chain-store tables, but local migration
history does not record `20260821120000` as applied; reconcile that history
before relying on or changing the chain store. No project-authorized test-USDC
or Safe transaction has been executed, and no PR has been merged. The mock
payment/wallet layer (`PAYMENT_RAIL_MODE`, mock provider, demo wallet, demo
outcome menu, demo hashes) is removed.

> **Note (2026-08-25) — approved but NOT yet live:** the Product Lead
> approved a new stacked implementation on branch **`wave6-main-ui-restore`**
> covering: a **display-only** 60-day listing window, **Reset = fresh demo
> book + new chain-store epoch** (chain is not rolled back; the env contract
> address stays active), **informational-only Pay QR / copy controls**, limited
> **customer statuses**
> (Paid = landlord proceeds card only; mint/NFT/contract wording Admin-only),
> **Save draft** persistence into My Offers → Draft, and an **Admin mint
> state** derived from verified facts only ("Mint in progress"). Automated
> verification now passes after fixing the approval-receipt race, the pending
> Check-status state, and restoring the env address as the single source of
> truth. The branch remains **NOT merged or
> live**; implementation-audit findings in `10` still block activation.

> **Note (2026-09-01) — implemented locally but NOT yet live:** the approved
> Supabase Auth flow (email magic links only, plus identity-only OAuth
> authorization), account-owned demo
> books, one linked wallet per account, `ADMIN_EMAILS` Admin authorization,
> and the same-account create → buy → pay → claim path are implemented on the
> working branch behind configuration. The account/wallet migration is applied
> to Labs. The remote chain-store tables exist, but their local migration
> history is not reconciled; this work is not
> merged, hosted, or activated. Global Admin Reset remains the current reset
> operation and does not roll back Base Sepolia.

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

The flow is implemented locally behind configuration. It is **not deployed to
the hosted app, not activated, and not merged**. The Base Sepolia contract used
for local/staging verification is not a public activation. Local stays open. No
Merkado login. Operations live on **Admin**. Hosted production fails closed at
`/enter`; unlocking it requires `LABS_DEMO_PASSWORD`.

| Surface | What a visitor sees |
|---|---|
| Enter `/enter` | Compact shadcn card: Merkado Labs, Shared password, show/hide, Continue. Not a Merkado account. Local without `LABS_DEMO_PASSWORD` skips this page. Hosted production stays locked if the password env is missing. |
| Home `/` | Product home headed **Rent paid forward**. Offer updates stay in the header bell and nav counts only. Two featured Marketplace cards remain. |
| My Offers `/originate` | A table focuses on Under review, Listed, Sold, and Paid. Draft/unfunded rows are not counted. There is no landlord claim action and no listing expiry. |
| Create offer `/originate/new` | Seven-step wizard with cover photo and Payout before Review. The landlord locks a payout destination before submission. No landlord wallet. Only six months can be submitted. |
| Simulator `/originate/simulator` | Rent and typical nearby rent in XCG, Property quality and Payment history sliders, live combined property view, 3 months disabled, 6 months approved, 9/12 simulation-only. Typical home and Small studio presets. Copy quote and Use this quote. Cap quotes cannot be saved. |
| Offer detail `/originate/MRA-*` | Property name first. A Landlord proceeds card shows Waiting, Processing, Failed, or Paid. Paid is final when the sale completes (buyer pays the locked landlord address). Listed offers stay purchasable (no expiry). |
| Marketplace `/offers` | Anonymised cards for minted, whole offers only — an approved offer that is still **mint pending is not listed** until its mint receipt is verified (its detail page stays reachable and shows a Mint pending alert). Purchase connects a real Reown/AppKit wallet; one dialog waits for the successful USDC approval receipt before purchasing the whole offer. Pending transactions expose Check status, not resend. An empty active contract address shows not configured. |
| Portfolio `/portfolio` | Property name leads. The offer token id, accrued rent per token, and current owner remain visible. The current NFT owner calls **Claim rent** (`claimRent`); non-owners are rejected. Transferring the NFT moves claim rights with it. |
| Pay `/pay` → `/pay/[paymentRequestId]` | Amounts show XCG with USDC settlement, inside a **Pay with stablecoin** section. One Pay rent dialog waits for the successful approval receipt before `depositRent(tokenId, opaquePaymentId, amount)`. Pending exposes Check status. A later month cannot be paid while an earlier month is open. QR/copy controls are informational; Sentoo is Coming soon. |
| Admin `/admin` | Bottom of the left nav. Offer table, approval, collections, dual-control, payment network, and Reset. Independent approval offers **Enrique** or **Luuk**. The active contract address comes from `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS`. Reset seeds a fresh book; the env address stays active so approved offers mint again. |
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
- Backend mint key: server-held EOA mint key (`MERKADO_MINTER_PRIVATE_KEY`). The legacy `NEXT_PUBLIC_MERKADO_COMPANY_SAFE` value is display-only.

A weak-score + related-party quote is blocked by the 24% cap. Use this quote
stays disabled. There is no override.

The demo book seeds **MRA-001** and **MRA-010** automatically, both approved
(`funding`) and **minted as NFTs** on the deployed Base Sepolia contract after
Admin approval. The Product Lead creates any additional offers via Create Offer;
`MRA-001` stays reserved (locked reference deal) and cannot be re-created.

### Shared demo book (verified)

One JSON book in `ra_demo_state.payload`. A confirmed `depositRent` writes the
payment request as paid, the receivable as received, one collection, and
claimable rent for the current NFT owner. Refreshing or retrying the same
request does not duplicate collection.

Reset restores the demo book to the seeded offers (**MRA-001** + **MRA-010**,
`funding`). Loading the book also adds any missing seed offer and drops retired
filler offers (**MRA-002**–**MRA-006**) without wiping new drafts.

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
  from Admin. Minting is automatic: the background sweep (Admin page load plus
  the `/api/cron/mint` cron) broadcasts `mintOffer` from the backend mint key and
  verifies the receipt on Base Sepolia. There is no manual **Mint now** button.
- Status labels are mint-aware: an approved offer reads **Mint pending** only
  until its offer NFT is verified, then **Listed** — on Admin, the offer detail,
  My Offers, and the Marketplace card alike. The underlying `status` stays
  `funding` until a buyer purchases the whole offer (`live`/`collecting`).
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
- Admin Reset the book asks to confirm, restores the seeded book, and keeps
  the selected test network and env contract address active.
- With `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS` empty, purchase and pay actions
  show a quiet **not configured** state and never fake a transaction.

### Base Sepolia flow status (NOT activated / NOT merged)

- `MerkadoRentOfferV1` source is in the repo (ADR-0008). A Base Sepolia
  deployment exists for local/staging testing but hosted activation is **not
  approved**. On **2026-08-24** the demo was reset for a **cold start**: the
  shared demo book (`ra_demo_state`) was flushed to an empty book (no offers,
  `cryptoConfig` preserved as `base-sepolia`) and the contract was redeployed
  to a fresh, source-verified address with no on-chain state (no token ids, no
  used offer keys, no claimable rent). The previous contract
  `0x6dfdd931375808f8ee701db063b30198cb247a6e` is superseded.
- Current cold-start contract: `0x2075653c0aab05d2331886cbd01f8b8e40fc400f`
  (minter `0x27D9333E178BEeaA92EE0e5C80DE75C133eA19E5`,
  USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`,
  tx `0x654ff84d20163b15e045d2a6b6f2345aca09e9b5eaf7507fb0643cf2d78de6d0`).
- The chain store migration (`ra_chain_epochs`, `ra_chain_offers`,
  `ra_chain_events`, `ra_rent_payment_attempts`,
  `ra_rent_deposit_verifications`, `ra_rent_claim_verifications`) is **not
  applied**.
- No test USDC has been sent and no Safe transaction has executed.
- Hosted activation and merging this PR are **not approved**.
- The mock layer (`PAYMENT_RAIL_MODE`, `src/lib/pay/mock-provider.ts`, demo
  wallet, demo outcome menu, demo hashes) is **removed**.

## 3. Database `[LABS]`

Allowed project only: `ewoxmzznkavapcxdporm`.

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
- Not an activated NFT flow: a Base Sepolia test deployment exists for
  local/staging verification, but hosted activation remains blocked
- Not authorised for third-party subscribe until M.1.2 and M.1.4 are closed
  in writing
- Not a public token market or secondary market. Merkado mints the offer NFT,
  then the buyer holds it (ADR-0008)
- Not on Base Mainnet; real funds and production stay blocked
