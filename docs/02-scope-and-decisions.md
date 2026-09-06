# 02 - Scope and Decisions

**Purpose:** Current Labs MVP scope, resolved decisions, and open gates.
**Last updated:** September 5, 2026 (authenticated Labs accounts, shared demo state, linked wallet, ADMIN_EMAILS admin)

## 1. MVP goal

Ship a coherent **Merkado Direct + Merkado Pay** Buildathon demo in this
repository, seeded from **MRA-001**, using the existing Labs dashboard stack
and Labs Supabase only. All authenticated users share one demo book. Supabase
Auth determines the landlord workflow, while a linked wallet determines access
to that wallet's payment and Portfolio actions.

Property scrapers, Browse, enrichment, and pipeline work are **out of this
repo**. They live on merkado-cw.

## 2. In scope

| Priority | Deliverable | Completion test |
|---|---|---|
| P0 | Pricing engine | Reproduces MRA-001 cents and IRR; blocks >24% with no override |
| P0 | Direct IA | Nav is Home, My Offers, Create Offer, Simulator, Marketplace, Portfolio, Pay, Account; Admin at the bottom. A header bell lists offer updates and holder actions. |
| P0 | Simulator | Sliders, market rent, Property Score, 9/12 simulation-only, Use this quote. Amounts in XCG |
| P0 | My Offers | Draft/unfunded totals excluded; sale + collection/claim status |
| P0 | Merkado Pay | Live USDC rent deposit on **Base Sepolia** via `depositRent` (Base Mainnet later); exact monthly amount, opaque payment id; English-only; no demo outcomes |
| P0 | Shared state | One confirmed deposit updates the shared request, receivable, collection, and claim once |
| P0 | Portfolio | Pre-seeded positions; Position ID; current NFT owner claims rent (`claimRent`) |
| P0 | Labs sign-in / accounts | **Supabase Auth** primary identity: **Email me a sign-in link** only. All users share one demo book; one **linked wallet** per account provides identity-specific role access. Identity-only OAuth authorization is supported. Not production auth. |
| P0 | Shared Marketplace | Marketplace lists anonymised offer projections from the shared demo book; any eligible linked wallet buys the whole offer. |
| P1 | Open gates | Stage 0 questions remain unresolved. They are documented, not shown on customer Home |
| P1 | NFT contract | One non-upgradeable ERC-721 (`MerkadoRentOfferV1`); pooled USDC rent per tokenId; backend mint key mints; transferable; whole-offer purchase pays landlord directly |
| P1 | Labs schema | RLS on; service-role only; no production project; chain store tables in a reviewed migration |

## 3. Out of scope

- Public Merkado Direct marketing page
- Public third-party holder onboarding (demo Marketplace purchase is in-scope)
- Public token market or secondary trading
- Landlord-signed on-chain offer creation (Merkado mints from the backend mint key)
- Live fiat rails (Girasol bank payout, Sentoo bank payment)
- 3-month term origination
- Contract deployment, applying new migrations, sending test USDC, Safe
  transactions, hosted activation, or merging this PR (separate gates)
- Base Mainnet, real funds, or production activation
- Production authentication or shared merkado.cw account (Labs demo auth
  with email magic links is in scope; it is not production auth)
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
| Renter product | Merkado Pay (USDC rent deposit in this demo) |
| Instrument | Transferable offer NFT (`MerkadoRentOfferV1`, ERC-721) on Base Sepolia. One NFT per approved listing, minted by the backend mint key. Current token owner = holder. Not a public token market. |
| Commercial form | True sale of receivables (*koop en cessie*) |
| Contract | `MerkadoRentOfferV1`, non-upgradeable, holds pooled Circle native USDC rent accounted per `tokenId`. No listing expiry. |
| Landlord money | The buyer pays the exact purchase price **directly to the locked landlord payout address**; the NFT moves minter → buyer atomically in the same transaction. No landlord claim button, no funding record, no separate payout Safe. The fee is already included and must not look like a second deduction. |
| Holder claims | Rent stays in the pooled contract until the current NFT owner calls `claimRent(tokenId)` in Portfolio. Only the current owner can claim. NFT transfers move claim rights with the token. |
| Renter deposit | `depositRent(tokenId, opaquePaymentId, amount)` with the exact monthly amount. The app schedules the six-month term; the contract imposes no deposit cap. Rent is not paid to the landlord a second time. |
| Rent payer wallet | Create Offer requires a valid checksummed wallet address in the Renter step. Generated Pay requests are assigned to that wallet; it is separate from the landlord payout address. |
| Opaque payment id | Unique per deposit, binds a deposit to a payment request. No memo guessing needed. |
| Currency | Stored as USD integer cents; UI shows XCG at 1.79; USDC integer atomic units (6 decimals) stay 1:1 with USD |
| Approved origination term | 6 months only; 9/12 simulation-only; 3 months disabled |
| Fee model | Single % of gross receivables; no flat fees |
| Related-party | Explicit +25 bp; independent approver; never cheaper than market |
| Cap | 24% effective annualised, engine-enforced; no override |
| Listing Score | Raw 0–100 pricing input |
| Property Score | Derived for presentation/filtering only; never prices the quote |
| Rent-to-market | contractual ÷ estimated market; lower is more favourable |
| Crypto in this task | Real Base Sepolia flow; wallet Reown/AppKit (injected EIP-1193); server receipt verification; no mock provider, `PAYMENT_RAIL_MODE`, demo wallet, demo outcome menu, or demo hashes |
| Network now | **Base Sepolia** (Base testnet). Shown in Admin and via `NEXT_PUBLIC_PAY_NETWORK`. |
| Network later | **Base Mainnet**, only when `NEXT_PUBLIC_PAY_NETWORK` is `base-mainnet`. |
| USDC contract | Circle native USDC for the selected network. See `src/lib/pay/networks.ts`. |
| Explorer | Official explorer for the selected network (real 64-hex hashes only) |
| Contract env | `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS` is the single source of truth for the contract address and is used every time. Empty → surfaces show a not-configured state. |
| Approve + send | Marketplace purchase and Merkado Pay use a **single primary action** that opens one dialog and runs Approve USDC → wait for the successful approval receipt → purchase/deposit → server verification, with a **Check status** action for pending transactions (never a blind re-send). One button style; no separate Approve step on the page. |
| Backend mint key | server-held EOA mint key (`MERKADO_MINTER_PRIVATE_KEY`). Mints offer NFTs. `NEXT_PUBLIC_MERKADO_COMPANY_SAFE` is a legacy display label, not the minter. |
| RPC env | Server-only `MERKADO_RPC_URL`, default `https://sepolia.base.org` |
| Other networks | Optimism keys stay in the catalog if later opted in. They are hidden in Admin. |
| Marketplace purchase | Any eligible linked wallet buys the whole offer. Buyer pays the exact purchase price to the locked landlord payout address; NFT moves Safe → buyer atomically. Fractional purchases are rejected. Not a public offering. |
| Listing window | **Display-only 60-day window.** Customer Marketplace and My Offers show "Available until [date] · 60-day listing window" as informational text. It is **NOT enforced**: the offer stays purchasable after the date, no Expired status derives from it, and the contract has no expiry. |
| Reset the book | Admin **Reset** seeds the one shared demo book with the canonical offers (**MRA-001** + **MRA-010**) and preserves PR #28 reset and chain behavior. Reset does **NOT** roll back the chain. |
| Pay QR (Merkado Pay) | The QR, **copy address**, and **copy amount** controls live in the expanded **Pay with stablecoin** panel and are **informational only** (receiving address, USDC amount, payment reference for display). They never submit a payment. The only valid payment path is the wallet **Pay rent** action calling `depositRent(tokenId, opaquePaymentId, amount)`. **Continue with Sentoo** returns as a collapsed panel with a **Coming soon** badge. Live Connect / Approve USDC / Pay rent sit inside the stablecoin section. The renter never sees NFT / mint / contract / token / on-chain wording. |
| Customer statuses | Customer-facing statuses are limited to **Under review → Listed → Sold → Paid** plus **Denied / Expired / Closed**. **Paid** refers to the landlord proceeds card only; the offer itself stays **Sold**. Mint pending, Minted, token #, NFT, contract, Safe mint, and Funding wording stay in **Admin only**. Landlord proceeds shows **Waiting → Processing → Paid** automatically (Processing = purchase submitted but not yet verified). My Offers next steps: **Listed for 60 days** for a listed offer, **Sale amount paid automatically** once sold. |
| Create Offer drafts | An explicit **Save draft** button persists the wizard's in-progress offer (e.g. MRA-011) into **My Offers → Draft**. Drafts stay visible in the landlord My Offers workflow only; customer surfaces keep the approved status list. A draft has **no chain or payment state**. |
| Admin mint state | Admin shows a single consistent mint state **derived from verified facts only**; a broadcast-but-unverified mint shows **Mint in progress**, never **Minted**. After reset, MRA-001 is a fresh `funding` offer with no on-chain facts. |
| Demo book | Auto-seeds **MRA-001** + **MRA-010**, both approved (`funding`) and minted as offer NFTs on the deployed contract. After **Reset** they are fresh `funding` offers with **empty on-chain state** until the backend mints them again. `MRA-001` is the locked reference deal and cannot be re-created. Additional offers are created via Create Offer. |
| Production marketplace | merkado-cw only |
| Supabase | Labs `ewoxmzznkavapcxdporm` only |
| Chain store | New tables `ra_chain_epochs`, `ra_chain_offers`, `ra_chain_events`, `ra_rent_payment_attempts`, `ra_rent_deposit_verifications`, `ra_rent_claim_verifications` (RLS on; service-role only) |
| Account chrome | Labs `/account` mirrors merkado-cw navbar, sidebar, and footer visually. Marketplace, listing, billing, and other chrome stay visibly disabled. Direct **Admin** is a separate operations page at the bottom of the left nav. Apps has its own group, above Account. Only **Merkado Pay** and **Merkado Direct** are live apps. **My Payments** lives inside Merkado Pay. |
| Auth identity | **Supabase Auth** is the primary Labs identity: **Email me a sign-in link** only. Auth identity is separate from wallet authorization. The account shell profile comes from the signed-in user email or the seeded **Luuk Weber** fallback. Identity-only OAuth authorization is supported. Not production auth. |
| Shared demo state | All authenticated users read and mutate one shared `ra_demo_state id='live'` row with `account_id IS NULL`. Supabase Auth, linked wallets, and Admin permission remain account-specific. |
| Linked wallet | One active wallet per account. Connection alone never links: the wallet must sign a one-time challenge bound to account + domain + chain + nonce (`ra_link_challenges` → `ra_account_wallets`), 5-minute expiry, consumed atomically, at most one active row. Marketplace purchases and Portfolio `claimRent` use the linked wallet. |
| Shared Marketplace | Marketplace lists anonymised offer projections from the shared demo book. Any eligible linked wallet buys the whole offer; the buyer pays the exact purchase price to the locked landlord payout address and the NFT moves Safe → buyer atomically. |
| Admin access | Server-side `ADMIN_EMAILS` comma-separated allowlist. Admin is enforced on Admin pages and every Admin server action and fails closed when the allowlist is set. Admin nav appears only for allowlisted emails. |
| Global Reset | Admin **Reset** keeps the current Reset UX and the mint sweep, and resets the one shared demo book. Reset does **NOT** roll back the chain. |
| Pending transaction binding | A submitted purchase / deposit / claim tx hash is stored on the shared offer or payment request. The current user's linked wallet authorizes the action; **Check status** re-verifies the stored hash, never blind re-sends. |
| Deployment gate | `LABS_DEMO_PASSWORD` is a deployment guard only, not an account and not the paid Vercel password add-on. When configured, hosted users must pass it before Auth sign-in; protected routes require both the valid gate and an authenticated Supabase session. Local stays open unless that env is set. |
| Migration state | Account/wallet migration `20260831000000_labs_accounts_and_wallets.sql`, chain-store migration `20260821120000`, shared-state migration `20260905140000`, and epoch-invariant migration `20260905150000` are applied to Labs. Migration history is reconciled. Hosted activation remains blocked. |

## 5. Open questions (must stay visible)

| ID | Question | Blocks |
|---|---|---|
| M.1.2 | DPR characterisation | All third-party holder activity |
| M.1.3 | Stichting object and board | All real collection flow |
| M.1.4 | Investor-funds licensing | Public Merkado Direct |
| M.2.1 | Assignment of future rent claims | Document template sign-off |
| M.3.1 | Related-party arm's-length file | Nothing if +25 bp is kept |
| Mint key | How `MERKADO_MINTER_PRIVATE_KEY` is funded, rotated, and authorises each offer NFT | Production minting |
| Contract deployment | When and how `MerkadoRentOfferV1` is deployed and verified on Base Sepolia | Live activation |
| Fee settlement | How the company fee is realised without reducing the landlord payout | Production fee flow |
| Wallet onboarding | WalletConnect, Privy, or both for production purchase/claim ownership | Holder authentication |
| Payment partners | Final Girasol and Sentoo fees, API contracts, KYC/consent, failure handling, and data ownership | Live fiat rails |

## 6. Vocabulary

Use: sale, purchase price, receivables, assignment, collections, discount,
fee, advance, participation, holder, distribution, rent paid forward.

Never use in customer-facing product copy: investment, investor, yield,
guaranteed return, fund (as product), loan, borrow, debt, token, or share.
The factual phrase **"not a loan"** may remain where legally useful. Do not
blindly rewrite internal legal questions or private underwriting fields.
Internal and ops docs may say NFT, Safe, `depositRent`, and `claimRent`.

Schema and code may keep legacy names (`passport`, `passportScore`) as
internal aliases for Listing Score.
