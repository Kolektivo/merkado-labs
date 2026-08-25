# 02 - Scope and Decisions

**Purpose:** Current Labs MVP scope, resolved decisions, and open gates.
**Last updated:** August 21, 2026 (Base Sepolia transferable NFT rent offer)

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
| P0 | My Offers | Draft/unfunded totals excluded; sale + collection/claim status |
| P0 | Merkado Pay | Live USDC rent deposit on **Base Sepolia** via `depositRent` (Base Mainnet later); exact monthly amount, opaque payment id; English-only; no demo outcomes |
| P0 | Shared state | One confirmed deposit updates request, receivable, collection, claim once |
| P0 | Portfolio | Pre-seeded positions; Position ID; current NFT owner claims rent (`claimRent`) |
| P0 | Account mock | Apps launcher. Marketplace chrome stays visually disabled. Only Merkado Pay and Merkado Direct are live apps. |
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
| Renter product | Merkado Pay (USDC rent deposit in this demo) |
| Instrument | Transferable offer NFT (`MerkadoRentOfferV1`, ERC-721) on Base Sepolia. One NFT per approved listing, minted by the backend mint key. Current token owner = holder. Not a public token market. |
| Commercial form | True sale of receivables (*koop en cessie*) |
| Contract | `MerkadoRentOfferV1`, non-upgradeable, holds pooled Circle native USDC rent accounted per `tokenId`. No listing expiry. |
| Landlord money | The buyer pays the exact purchase price **directly to the locked landlord payout address**; the NFT moves minter → buyer atomically in the same transaction. No landlord claim button, no funding record, no separate payout Safe. The fee is already included and must not look like a second deduction. |
| Holder claims | Rent stays in the pooled contract until the current NFT owner calls `claimRent(tokenId)` in Portfolio. Only the current owner can claim. NFT transfers move claim rights with the token. |
| Renter deposit | `depositRent(tokenId, opaquePaymentId, amount)` with the exact monthly amount. The app schedules the six-month term; the contract imposes no deposit cap. Rent is not paid to the landlord a second time. |
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
| Contract env | `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS` — empty until deployment; surfaces show a not-configured state when empty |
| Backend mint key | server-held EOA mint key (`MERKADO_MINTER_PRIVATE_KEY`). Mints offer NFTs. `NEXT_PUBLIC_MERKADO_COMPANY_SAFE` is a legacy display label, not the minter. |
| RPC env | Server-only `MERKADO_RPC_URL`, default `https://sepolia.base.org` |
| Other networks | Optimism keys stay in the catalog if later opted in. They are hidden in Admin. |
| Marketplace purchase | Any wallet buys the whole offer. Buyer pays the exact purchase price to the locked landlord payout address; NFT moves Safe → buyer atomically. Fractional purchases are rejected. Not a public offering. |
| Listing window | No listing expiry. Offers stay purchasable until sold. |
| Demo book | Auto-seeds **MRA-001** + **MRA-010**, both approved (`funding`) and minted as NFTs. `MRA-001` is the locked reference deal and cannot be re-created. Additional offers are created via Create Offer. |
| Production marketplace | merkado-cw only |
| Supabase | Labs `ewoxmzznkavapcxdporm` only |
| Chain store | New tables `ra_chain_epochs`, `ra_chain_offers`, `ra_chain_events`, `ra_rent_payment_attempts`, `ra_rent_deposit_verifications`, `ra_rent_claim_verifications` (RLS on; service-role only) |
| Account chrome | Labs `/account` mirrors merkado-cw navbar, sidebar, and footer visually. Marketplace, listing, billing, and other chrome stay visibly disabled. Direct **Admin** is a separate operations page at the bottom of the left nav. Apps has its own group, above Account. Only **Merkado Pay** and **Merkado Direct** are live apps. **My Payments** lives inside Merkado Pay. |
| Demo account identity | Labs account and seeded renter are **Luuk Weber**, with the Product Lead–supplied avatar. |
| Hosted demo access | Shared host password in the app (`LABS_DEMO_PASSWORD`). Not a Merkado account and not the paid Vercel password add-on. Local stays open unless that env is set. Hosted production stays locked if the password is missing. |

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
