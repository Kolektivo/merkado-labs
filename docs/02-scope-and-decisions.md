# 02 - Scope and Decisions

**Purpose:** Current Labs MVP scope, resolved decisions, and open gates.
**Last updated:** August 18, 2026

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
| P0 | Direct IA | Nav is My Offers, Create Offer, Get Now, Marketplace, Portfolio |
| P0 | Get Now | Sliders, market rent, Property Score, 9/12 simulation-only, Use this quote |
| P0 | My Offers | Draft/unfunded totals excluded; settlement + collection/distribution status |
| P0 | Merkado Pay | Mocked USDC payment-link; EN/NL/Papiamentu; no real wallet |
| P0 | Shared state | One confirmed payment updates request, receivable, collection, distribution once |
| P0 | Portfolio | Pre-seeded positions; Position ID; automatic distributions; no Claim |
| P0 | Account mock | My Payments + Apps; fictional renter only |
| P1 | Open gates | Stage 0 questions visible on the demo hub |
| P1 | Luis boundary | Typed mock provider; no wallet/Safe SDK installed |
| P1 | Labs schema | RLS on; service-role only; no production project; no new migration |

## 3. Out of scope

- Public Merkado Direct marketing page
- Third-party subscription or holder onboarding
- Secondary transfer, token, NFT, or transferable position
- 3-month term origination
- Real wallet connection, signing, RPC, Safe SDK/API, or USDC transfer
- Choosing a blockchain/network or creating a Safe
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
| Currency | XCG integer cents; USDC integer atomic units (6 decimals); peg 1.79 |
| Approved origination term | 6 months only; 9/12 simulation-only; 3 months disabled |
| Fee model | Single % of gross receivables; no flat fees |
| Related-party | Explicit +25 bp; independent approver; never cheaper than market |
| Cap | 24% effective annualised, engine-enforced; no override |
| Listing Score | Raw 0–100 pricing input |
| Property Score | Derived for presentation/filtering only; never prices the quote |
| Rent-to-market | contractual ÷ estimated market; lower is more favourable |
| Crypto in this task | Mocked only; typed provider for Luis |
| Network / Safe / USDC contract | Unselected; Luis and Luuk own |
| Marketplace subscribe | Closed; pre-seeded Portfolio positions |
| Production marketplace | merkado-cw only |
| Supabase | Labs `csaefdkpwukshtouyixg` only |

## 5. Open questions (must stay visible)

| ID | Question | Blocks |
|---|---|---|
| M.1.2 | DPR characterisation | All third-party holder activity |
| M.1.3 | Stichting object and board | All real collection flow |
| M.1.4 | Investor-funds licensing | Public Merkado Direct |
| M.2.1 | Assignment of future rent claims | Document template sign-off |
| M.3.1 | Related-party arm’s-length file | Nothing if +25 bp is kept |
| Network | Which chain, chain ID, native USDC, explorer | Real Pay settlement |
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
