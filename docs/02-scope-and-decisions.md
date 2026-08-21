# 02 - Scope and Decisions

**Purpose:** Current Labs MVP scope, resolved decisions, and open gates.
**Last updated:** August 21, 2026 (payout-first, whole-offer flow)

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
| P0 | Direct IA | Nav is Home, My Offers, Create Offer, Simulator, Marketplace, Portfolio, Pay, Account; Admin at the bottom. A header bell lists offer updates and holder actions. |
| P0 | Simulator | Sliders, market rent, Property Score, 9/12 simulation-only, Use this quote. Amounts in XCG |
| P0 | My Offers | Draft/unfunded totals excluded; settlement + collection/distribution status |
| P0 | Merkado Pay | Working mocked USDC payment-link on **Base Sepolia** facts (Base Mainnet later); stablecoin QR and copy-address path; collapsed Sentoo preview; English-only; no Connect wallet on Pay; no real wallet or bank payment |
| P0 | Shared state | One confirmed payment updates request, receivable, collection, distribution once |
| P0 | Portfolio | Pre-seeded positions; Position ID; holder claim after rent arrives |
| P0 | Account mock | Apps launcher. Marketplace chrome stays visually disabled, including Account Settings. There is no Payouts item in account chrome. |
| P1 | Open gates | Stage 0 questions remain unresolved. They are documented, not shown on customer Home |
| P1 | Luis boundary | Typed mock provider; no wallet/Safe SDK installed |
| P1 | Labs schema | RLS on; service-role only; no production project; no new migration |

## 3. Out of scope

- Public Merkado Direct marketing page
- Public third-party holder onboarding (demo Marketplace purchase is in-scope)
- Public token market or secondary trading
- Landlord-signed on-chain offer creation
- Live Girasol bank payout (the coming-soon fee/details preview is in scope)
- 3-month term origination
- Real wallet connection, signing, RPC, Safe SDK/API, or live USDC transfer
- Creating the production Safe (Luis/Luuk; demo address stays fictional)
- Live Sentoo or bank transfer (the coming-soon renter form is visual only)
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
| Instrument | Digital Participation Right. Merkado creates one listing offer after approval (ADR-0006). Not a public token market. Not a custody product. |
| Commercial form | True sale of receivables (*koop en cessie*) |
| Landlord money | Payout is chosen before submission. The mock crypto route accepts only a fictional `0xDEMO…` address. After a whole-offer purchase, the purchase price is marked paid automatically to that saved destination. No landlord claim button, mock hash, or explorer link. The fee is already included and must not look like a second deduction. |
| Fiat payout preview | Girasol bank payout is visible as Coming soon with a 1.5% illustrative fee and fictional, browser-only fields. Final pricing and integration terms remain open. |
| Holder claims | Product intent: rent sits on the sold listing until the holder claims it in Portfolio. Luis PR #22 still auto-pays holder rent as an interim Wave 3 state until his NFT wave. |
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
| Test Safes | **Base Sepolia**. Company Safe plus a separate sales proceeds Safe. Draft PR 20 has a 2-of-3 company Safe (`0xfC6ec9718d89d4935594E7DB78399913071FcDc4`) that is **not** on `main`. Draft PR #22 adds the mocked landlord proceeds claim on that stack. Address not in the mocked app until confirmed. |
| Safe address | Fictional in the mock until that verified Base Sepolia Safe is written in |
| Other networks | Optimism keys stay in the catalog if Luis later opts in. They are hidden in Admin. |
| Marketplace purchase | One buyer purchases 100% of the open offer. Fractional purchases are rejected in the UI and server helper. Purchase requires the mocked **Connect wallet** step. WalletConnect versus Privy is a later Luis choice and is not shown in Labs. Not a public offering. |
| Listing window | Approval lists the offer for 60 days. After `expiresAt`, purchase is blocked. Sold offers remain viewable and shareable. |
| Demo book | Two seeded offers for the walkthrough: **MRA-001** (seeded funded reference) and **MRA-010** (open Punda studio). Extra filler offers were retired. Create Offer can still add a draft. |
| Production marketplace | merkado-cw only |
| Supabase | Labs `csaefdkpwukshtouyixg` only |
| Account chrome | Labs `/account` mirrors merkado-cw navbar, sidebar, and footer visually. Marketplace, listing, billing, **Account Settings**, and other chrome stay visibly disabled. There is no Payouts item here. Automatic payout status stays on My Offers / the offer page. Direct **Admin** is a separate operations page at the bottom of the left nav. Apps has its own group, above Account. Only **Merkado Pay** and **Merkado Direct** are live apps. **My Payments** lives inside Merkado Pay. |
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
| Safe execution | How Merkado creates offers, sweeps fees, executes the automatic landlord payout, and lets holders collect | Production payouts |
| Wallet onboarding | WalletConnect, Privy, or both for production purchase/claim ownership | Holder authentication |
| Payment partners | Final Girasol and Sentoo fees, API contracts, KYC/consent, failure handling, and data ownership | Live fiat rails |

## 6. Vocabulary

Use: sale, purchase price, receivables, assignment, collections, discount,
fee, advance, participation, holder, distribution, rent paid forward.

Never use in customer-facing product copy: investment, investor, yield,
guaranteed return, fund (as product), loan, borrow, debt, token, or share.
The factual phrase **“not a loan”** may remain where legally useful. Do not
blindly rewrite internal legal questions or private underwriting fields.

Schema and code may keep legacy names (`passport`, `passportScore`) as
internal aliases for Listing Score.
