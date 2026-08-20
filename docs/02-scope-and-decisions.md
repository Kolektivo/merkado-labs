# 02 - Scope and Decisions

**Purpose:** Current Labs MVP scope, resolved decisions, and open gates.
**Last updated:** August 19, 2026 (approved OP Sepolia Web3 MVP)

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
| P0 | Merkado Pay | USDC payment-link. Mock mode keeps selectable OP Sepolia / Base Sepolia demo facts and both pay paths. Approved live mode: external wallet (Privy) sends native USDC on **OP Sepolia only**; the server verifies on-chain (exact amount, correct token and recipient, **5-block** depth) before confirming. Copy-address confirmation is disabled in live. English-only. |
| P0 | Shared state | One confirmed payment updates request, receivable, collection, distribution once |
| P0 | Portfolio | Pre-seeded positions; Position ID; automatic distributions; no Claim |
| P0 | Account mock | Apps launcher for Pay and Direct; fictional renter only |
| P1 | Open gates | Stage 0 questions visible on the demo hub |
| P1 | Luis boundary | Typed provider boundary; approved **Privy (external wallets only) + viem**; no embedded wallets; no Safe SDK |
| P1 | Labs schema | RLS on; service-role only; no production project; no new migration |

## 3. Out of scope

- Public Merkado Direct marketing page
- Third-party subscription or holder onboarding
- Secondary transfer, token, NFT, or transferable position
- 3-month term origination
- Real wallet connection, signing, and live USDC transfer **off OP Sepolia** (Base Sepolia and mainnet are not live-verifiable here)
- Safe SDK/API, Safe watching, custody/escrow claims, or any holder-payout execution
- Creating the production Safe (the receiving address stays a **mock EOA**)
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
| Currency | USD integer cents; USDC integer atomic units (6 decimals); 1:1 |
| Approved origination term | 6 months only; 9/12 simulation-only; 3 months disabled |
| Fee model | Single % of gross receivables; no flat fees |
| Related-party | Explicit +25 bp; independent approver; never cheaper than market |
| Cap | 24% effective annualised, engine-enforced; no override |
| Listing Score | Raw 0–100 pricing input |
| Property Score | Derived for presentation/filtering only; never prices the quote |
| Rent-to-market | contractual ÷ estimated market; lower is more favourable |
| Crypto in this task | Approved Web3 MVP: **Privy** for external wallets only (embedded wallets not enabled) + **viem** for wallet submission and server verification. `PAYMENT_RAIL_MODE` stays `"mock"` until the live testnet walkthrough is verified. |
| Network now | Mock/demo: OP Sepolia (default) and Base Sepolia are selectable. **Live: OP Sepolia only.** Base Sepolia is a demo-selectable fact, not a live-verifiable network. |
| Network later | OP Mainnet and Base Mainnet, only when `NEXT_PUBLIC_PAY_NETWORK` is a mainnet key. **Mainnet stays OFF and is not reachable in live mode.** |
| USDC contract | Circle native USDC for the selected network. See `src/lib/pay/networks.ts`. |
| Explorer | Official explorer for the selected network (real 64-hex hashes only; demo `0xDEMO…` hashes never open the explorer) |
| Receiving address | Valid EOA `0x1726cf86DA996BC4B2F393E713f6F8ef83f2e4f6` used as the **mock receiving address**. It is an EOA, not a Safe. No Safe SDK, Safe watching, or holder-payout execution. |
| Wallet integration | Privy, external wallets only. Embedded wallets are not enabled. `NEXT_PUBLIC_PRIVY_APP_ID` (public App ID, not a secret) must be set to enable real wallet login. |
| Blockchain + verification | viem for wallet submission and server-side verification (receipt, ERC-20 Transfer event, confirmation depth). |
| Live confirmation | Server-side and on-chain: valid 64-hex hash, chain == OP Sepolia, receipt not reverted, `receipt.to` == USDC contract, Transfer event to the receiving EOA with the exact atomic amount, **5-block** depth. Then the existing idempotent `applyPaymentOutcome()` writes the book once. |
| Copy-address confirmation | Disabled in live mode. Only wallet-based payment confirms. The demo outcome menu is mock-only. |
| RPC | Public OP Sepolia RPC (`https://sepolia.optimism.io`) used temporarily; the Product Lead will supply a specific RPC later. No secret committed. |
| Marketplace subscribe | Closed; pre-seeded Portfolio positions |
| Production marketplace | merkado-cw only |
| Supabase | Labs `csaefdkpwukshtouyixg` only |
| Account chrome | Labs `/account` mirrors merkado-cw navbar, sidebar, and footer visually. Marketplace, listing, billing, settings, and other chrome stay visibly disabled. Admin is hidden. Apps has its own group, above Account. Only **Merkado Pay** and **Merkado Direct** are live. **My Payments** lives inside Merkado Pay. |
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
| Live wallet flow | A real testnet walkthrough (connect external wallet, send 1,800.00 USDC, 5-block confirmation) has not been completed yet | Declaring the Web3 flow live/verified in `docs/09` |

## 6. Vocabulary

Use: sale, purchase price, receivables, assignment, collections, discount,
fee, advance, participation, holder, distribution, rent paid forward.

Never use in customer-facing product copy: investment, investor, yield,
guaranteed return, fund (as product), loan, borrow, debt, token, or share.
The factual phrase **“not a loan”** may remain where legally useful. Do not
blindly rewrite internal legal questions or private underwriting fields.

Schema and code may keep legacy names (`passport`, `passportScore`) as
internal aliases for Listing Score.
