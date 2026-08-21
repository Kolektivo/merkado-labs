# 02 - Scope and Decisions

**Purpose:** Current Labs MVP scope, resolved decisions, and open gates.
**Last updated:** August 20, 2026 (Base Sepolia / Base Mainnet)

## 1. MVP goal

Ship a coherent **Merkado Direct + Merkado Pay** Buildathon demo in this
repository, seeded from **MRA-001**, using the existing Labs dashboard stack
and Labs Supabase only. One shared fictional demo book so a Pay confirmation
appears in My Payments, My Offers, and Portfolio.

Property scrapers, Browse, enrichment, and pipeline work are **out of this
repo**. They live on merkado-cw.

## 2. In scope

| Priority | Deliverable | Completion test |
|---|---|---|
| P0 | Pricing engine | Reproduces MRA-001 cents and IRR; blocks >24% with no override |
| P0 | Direct IA | Nav is Home, My Offers, Create Offer, Simulator, Marketplace, Portfolio, Pay, Account; Admin at the bottom |
| P0 | Simulator | Sliders, market rent, Property Score, 9/12 simulation-only, Use this quote. Amounts in XCG |
| P0 | My Offers | Draft/unfunded totals excluded; settlement + collection/distribution status |
| P0 | Merkado Pay | Working mocked USDC payment-link on **Base Sepolia** facts (Base Mainnet later); copy-address and wallet paths; English-only; no real wallet |
| P0 | Shared state | One confirmed payment updates request, receivable, collection, distribution once |
| P0 | Portfolio | Pre-seeded positions; Position ID; automatic distributions; no Claim |
| P0 | Account mock | Apps launcher for Pay and Direct; fictional renter only |
| P1 | Open gates | Stage 0 questions remain unresolved. They are documented, not shown on customer Home |
| P1 | Luis boundary | Typed mock provider; no wallet/Safe SDK installed |
| P1 | Labs schema | RLS on; service-role only; no production project; no new migration |

## 3. Out of scope

- Public Merkado Direct marketing page
- Public third-party holder onboarding (demo Marketplace purchase is in-scope)
- Secondary transfer, token, NFT, or transferable position
- 3-month term origination
- Real wallet connection, signing, RPC, Safe SDK/API, or live USDC transfer
- Creating the production Safe (Luis/Luuk; demo address stays fictional)
- Sentoo or bank transfer
- Production authentication or shared merkado.cw account
- Real email or reminder scheduling
- Property series (enum reserved, not built)
- Scrapers, Terra, What Fits Me, public listing browse
- Deploy, DNS, commit, push, or production env changes unless the Product Lead asks
- Schema migration unless separately approved

## 4. Resolved decisions

| Topic | Decision |
|---|---|
| Umbrella name | Merkado Direct |
| Landlord customer brand | Do not prominently brand a separate Rent Advance product |
| Holder platform | Merkado Direct · series Rent Advance (internal) |
| Renter product | Merkado Pay (USDC-only pilot in this demo) |
| Instrument | Digital Participation Right (book-entry; no token) |
| Commercial form | True sale of receivables (*koop en cessie*) |
| Landlord money | One upfront purchase amount; later collections go to holders |
| Holder distributions | Automatic in this demo; no Claim button |
| Settlement mode | Each Offer has `settlementMode` = `"automatic"` or `"landlord_claim"`. **MRA-001 stays automatic** (historically settled). **MRA-010 and all newly created offers use `landlord_claim`**. Missing historical mode normalizes to `automatic`. |
| Landlord proceeds claim | A **mocked** claim (PR #21) for fully-funded claim-mode sale proceeds. Lifecycle `available → processing → paid` (also `failed`). `paid` is terminal and never duplicates ledger/events. `txHash` stays `null` (no fake chain evidence). No NFT, no token, no explorer link. |
| Funding record terminology | Use **OfferFundingRecord**; UI wording **“Mock funding recorded”**, never “Deposit confirmed on-chain”. It is a mock business allocation, not a transfer receipt. |
| Fictional EOAs | Landlord claim destination is an **unverified demo address**, stored server-side, never shown across privacy walls. Mock-only; never implies wallet ownership. |
| Failed-claim retry | Retries go **only to the locked destination**; a different address is rejected once processing begins. Reset/edit returns the claim to `available`. |
| Currency | Stored as USD integer cents; UI shows XCG at 1.79; USDC integer atomic units (6 decimals) stay 1:1 with USD |
| Approved origination term | 6 months only; 9/12 simulation-only; 3 months disabled |
| Fee model | Single % of gross receivables; no flat fees |
| Related-party | Explicit +25 bp; independent approver; never cheaper than market |
| Cap | 24% effective annualised, engine-enforced; no override |
| Listing Score | Raw 0–100 pricing input |
| Property Score | Derived for presentation/filtering only; never prices the quote |
| Rent-to-market | contractual ÷ estimated market; lower is more favourable |
| Crypto in this task | Mocked wallet; typed provider for Luis; `PAYMENT_RAIL_MODE` flips mock labels when the real adapter ships |
| Network now | **Base Sepolia** (Base testnet). Shown in Admin and via `NEXT_PUBLIC_PAY_NETWORK`. |
| Network later | **Base Mainnet**, only when `NEXT_PUBLIC_PAY_NETWORK` is `base-mainnet`. |
| USDC contract | Circle native USDC for the selected network. See `src/lib/pay/networks.ts`. |
| Explorer | Official explorer for the selected network (real hashes only) |
| Test Safe | **Base Sepolia**, **2 of 3**, owners Enrique, Luuk, and Luis. Luis created it; verified Safe v1.4.1 on 2026-08-20. |
| Safe address | **`0xfC6ec9718d89d4935594E7DB78399913071FcDc4`** set in `cryptoConfig.safeAddress` on the PR #20 stack |
| Other networks | Optimism keys stay in the catalog if Luis later opts in. They are hidden in Admin. |
| Marketplace subscribe | A holder can buy any amount up to what is still open. The offer goes live and Pay requests mint when the offering is filled. Not a public offering. |
| Demo book | Two seeded offers for the walkthrough: **MRA-001** (funded live reference) and **MRA-010** (open Punda studio). Extra filler offers were retired. Create Offer can still add a draft. |
| Production marketplace | merkado-cw only |
| Supabase | Labs `csaefdkpwukshtouyixg` only |
| Account chrome | Labs `/account` mirrors merkado-cw navbar, sidebar, and footer visually. Marketplace, listing, billing, settings, and other chrome stay visibly disabled. Direct **Admin** is a separate operations page at the bottom of the left nav. Apps has its own group, above Account. Only **Merkado Pay** and **Merkado Direct** are live. **My Payments** lives inside Merkado Pay. |
| Demo account identity | Labs account and seeded renter are **Luuk Weber**, with the Product Lead–supplied avatar. |
| Hosted demo access | Shared host password in the app (`LABS_DEMO_PASSWORD`). Not a Merkado account and not the paid Vercel password add-on. Local stays open unless that env is set. Hosted production stays locked if the password is missing. |

## 5. Open questions (must stay visible)

| ID | Question | Blocks |
|---|---|---|
| M.1.2 | DPR characterisation | All third-party holder activity |
| M.1.3 | Stichting object and board | All real collection flow |
| M.1.4 | Investor-funds licensing | Public Merkado Direct |
| M.2.1 | Assignment of future rent claims | Document template sign-off |
| M.3.1 | Related-party arm’s-length file | Nothing if +25 bp is kept |
| Allocation | How a pooled USDC transfer maps to a payment request | Production Pay matching |
| Safe execution | How automatic distribution is authorised | Production holder payouts |

## 6. Vocabulary

Use: sale, purchase price, receivables, assignment, collections, discount,
fee, advance, participation, holder, distribution, rent paid forward.

Never use in customer-facing product copy: investment, investor, yield,
guaranteed return, fund (as product), loan, borrow, debt, token, or share.
The factual phrase **“not a loan”** may remain where legally useful. Do not
blindly rewrite internal legal questions or private underwriting fields.

Schema and code may keep legacy names (`passport`, `passportScore`) as
internal aliases for Listing Score.

Use for the landlord proceeds claim: **landlord proceeds claim**,
**mock funding recorded**, **unverified demo payout address**, **mock demo —
no wallet ownership was verified**. A claim is a **mock business
allocation**, never an on-chain transfer receipt. Never call it a
“Deposit confirmed on-chain”, a token, an NFT, or a transferable position.
`externalTokenId` stays `null`.
