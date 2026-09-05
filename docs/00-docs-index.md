# Merkado Docs — Index

This folder holds the working context for the Merkado Labs **Merkado Direct**
and **Merkado Pay** Buildathon demo.

**Last updated:** September 1, 2026 (Supabase Auth identity, account-owned state, linked wallet, ADMIN_EMAILS admin)
**Canonical set:** `00`–`12` (AI Product Development OS).
**Agent entrypoints:** repository root `AGENTS.md` and `CLAUDE.md`.
**Structure decision:** `docs/decisions/ADR-0001-standard-documentation-structure.md`
and `docs/decisions/ADR-0002-private-local-evidence.md`.
**Buildathon pivot:** `docs/decisions/ADR-0005-buildathon-direct-pay-demo.md`.
**Base Sepolia NFT flow:** `docs/decisions/ADR-0008-base-sepolia-nft-rent-offer.md`
(supersedes ADR-0006 / ADR-0007 where they conflict).
**Auth / accounts / wallet linking:** `docs/decisions/ADR-0009-auth-accounts-wallet-linking.md`.
**Product naming:** **Merkado Direct** is the umbrella app (My Offers, Create
Offer, Simulator, Marketplace, Portfolio). **Merkado Pay** is the renter
payment-link. **Admin** is the operations page at the bottom of the left nav.
Do not prominently brand a separate “Merkado Rent Advance” product. Internal
series/legal wording may remain. “Merkado Premium” is retired.

## Terminology (canonical)

- **Merkado Direct** = umbrella Labs demo for landlords and holders: My Offers,
  Create Offer, Simulator, Marketplace, and Portfolio. Calm customer copy:
  “rent paid forward” or “get future rent paid upfront.”
- **Merkado Pay** = renter payment-link for live USDC rent deposits on
  Base Sepolia by default (Base Mainnet later). The renter pays the same
  rent through the `MerkadoRentOfferV1` contract.
  Customer screens show **XCG** at **1 USD = 1.79 XCG**. USDC still settles
  1:1 with the stored USD rent.
- **Merkado account (Labs demo auth)** = a **Supabase Auth** identity
  (email magic link) that owns an isolated demo book.
  Auth identity is separate from wallet authorization. Each account can
  walk create → buy → pay → claim in its own book. Not production auth.
- **Labs demo sign-in (`/enter`)** = Supabase Auth primary entry: **Email me a
  sign-in link**, plus the legacy **host
  password** as a deployment-gate fallback. Not a Merkado account and not
  live on merkado.cw. Hosted production requires the deployment gate and an
  authenticated session; it fails closed at `/enter`.
- **Linked wallet** = one active wallet per account, linked by signing a
  one-time, account/domain/chain/nonce-bound challenge
  (`ra_link_challenges` → `ra_account_wallets`). Connection alone never
  links; at most one active wallet per account. Marketplace purchases and
  Portfolio `claimRent` use the linked wallet.
- **ADMIN_EMAILS admin** = server-side comma-separated allowlist. Admin is
  enforced on Admin pages and on every Admin server action. Missing or empty
  configuration fails closed. Admin nav appears only for allowlisted emails.
- **Account-owned demo state** = each authenticated account's book is keyed
  `ra_demo_state id='live' + account_id=<auth user id>`. The legacy shared
  `NULL` row is ignored by the account-scoped code paths.
- **Global Reset (Admin)** = preserves the current Reset UX and the mint
  sweep, and starts a **new chain-store epoch** (prior active epochs are
  deactivated atomically). Old Base Sepolia transactions stay tied to their
  original account / contract / epoch and cannot mutate fresh reset state.
  Reset does **not** roll back the chain.
- **Pending transaction recovery** = a submitted purchase / deposit / claim
  tx hash is bound to account + offer/payment request + token + chain +
  contract + epoch; compare-and-set (first valid submission wins); the sender
  is derived from verified chain facts, never a client-supplied address;
  **Check status** re-verifies, never blind re-sends. Mint recovery pins to
  the offer's original contract at broadcast; the env address is used only
  for new broadcasts.
- **Merkado Direct · Rent Advance** = first series name (internal / legal).
- **Digital Participation Right (DPR)** = instrument name. The instrument
  is now a **transferable offer NFT** (`MerkadoRentOfferV1`, ERC-721) on
  Base Sepolia. Merkado mints one offer NFT per approved listing from the
  backend mint key. The current NFT owner is the holder. Customer copy still
  does not sell this as a token market or public offering.
- **MerkadoRentOfferV1** = the single non-upgradeable ERC-721 contract.
  It holds pooled Circle native USDC rent, accounted per `tokenId`. The
  backend mint key mints; the current owner claims accrued rent.
- **OfferFundingRecord / LandlordProceedsClaim** = retired. The buyer pays
  the exact purchase price directly to the locked landlord payout address;
  there is no separate funding record or landlord claim.
- **Listing Score** (on screen: **Property quality**) = raw 0–100 listing
  quality used to set the cash offer.
- **Payer Score** (on screen: **Payment history**) = raw 0–100 renter
  payment reliability used to set the cash offer.
- **Property Score** (on screen: **Combined property view**) = presentation
  score from Listing Score and rent vs typical nearby rent. Never prices
  the quote.
- **Rent vs typical rent** = contractual rent ÷ typical nearby rent. Below
  typical is usually stronger. Internal name: rent-to-market.
- **Connected landlord** = internal related-party flag only. Hidden from
  customer screens. Extra fee still exists in the engine if the seed book
  has it. Operations manage approval in **Admin**.
- **Passport (legacy internal field)** = stored offer scorecard object
  (`passport.total` is the Listing Score). This is **not** the merkado.cw
  **Property Passport** (listing history on a property page).
- **Marketplace / Listings / Cars / Property** on merkado.cw remain defined in
  merkado-cw. This Labs repo no longer operates the listing pipeline.
  This demo is **not** live on merkado.cw.
- **60-day listing window (display-only)** = informational customer text
  "Available until [date] · 60-day listing window" on customer Marketplace
  and My Offers. It is **never enforced**: offers stay purchasable after the
  date, no Expired status derives from it, and the contract has no expiry.
- **Pay QR and copy controls** = informational only. The QR (receiving
  address, USDC amount, payment reference) and "copy address" / "copy amount"
  controls never submit a payment; the wallet **Pay rent** action calling
  `depositRent(tokenId, opaquePaymentId, amount)` is the only valid path.
- **Customer statuses** = Under review → Listed → Sold → Paid plus Denied /
  Expired / Closed. "Paid" is the landlord proceeds card only; the offer stays
  "Sold". Mint / NFT / contract / Safe / Funding wording stays in Admin only.

**Supersedes:** Labs-as-property-scraper-kitchen. That work is on merkado-cw.
ADR-0004 remains the Labs-rebuild record; ADR-0005 supersedes only the
customer brand split, no-crypto-as-product stance, and holder-only Direct
framing where they conflict. ADR-0008 supersedes ADR-0006 / ADR-0007 where
they conflict (mock provider boundary, sales-proceeds Safe payout, mocked
Connect wallet, listing expiry, landlord claim after sale).

## Canonical source map

| Subject | Canonical home |
|---|---|
| Docs index (this file) | `00-docs-index.md` |
| Product vision | `01-product-vision.md` |
| Scope and approved decisions | `02-scope-and-decisions.md` |
| User flows and UX journeys | `03-user-flows.md` |
| Design system / UI rules | `04-design-system.md` |
| Architecture | `05-architecture.md` |
| Data model, lifecycle, currency | `06-data-model.md` |
| Integrations + Luis Web3 handoff | `07-integrations.md` |
| Security and privacy | `08-security-and-privacy.md` |
| Current implementation state | `09-current-state.md` |
| Execution roadmap | `10-execution-roadmap.md` |
| Testing and Product Lead UAT | `11-testing-and-uat.md` |
| Deployment and local ops | `12-deployment-runbook.md` |
| Decision records | `decisions/` (Base Sepolia NFT flow: ADR-0008; auth/accounts/wallet linking: ADR-0009; prior: ADR-0006, ADR-0007) |
| AI prompts | `ai/` |
| Private local material | `private/` (gitignored) |

## Labs build status (qualitative)

| Area | Status |
|---|---|
| Merkado Direct umbrella | [LABS] Buildathon demo (see `09` after verify). Customer statuses Under review → Listed → Sold → Paid plus Denied / Expired / Closed. Save draft persists into My Offers → Draft |
| Pricing engine + 24% cap | [LABS] Built |
| Simulator + Listing / Property Score | [LABS] Buildathon scope |
| Marketplace | [LABS] Whole-offer purchase; buyer pays the landlord payout address directly; NFT moves Safe → buyer atomically. Display-only "Available until [date] · 60-day listing window" — never enforced |
| Portfolio | [LABS] Seeded positions plus purchases; current NFT owner claims rent (`claimRent`) |
| Merkado Pay (USDC rent deposit) | [LABS] Live flow on Base Sepolia via `depositRent`; UI in XCG; 1:1 USDC. QR / copy controls informational only; depositRent is the only payment path |
| Labs sign-in / accounts | [LABS] Supabase Auth primary identity (email magic link only). Each account owns an isolated demo book; one linked wallet per account; same account can create → buy → pay → claim. Identity-only OAuth authorization is supported. Not activated or merged |
| Admin | [LABS] Bottom of left nav, gated by `ADMIN_EMAILS` allowlist — approval, collections, reset. Reset = fresh seed + new chain-store epoch (chain not rolled back); mint/funding wording Admin-only |
| Account-owned state + wallet linking (ADR-0009) | [LABS] Implemented behind config; account-owned state and wallet linking are applied to the approved Labs branch. Not live |
| Listing scrapers in this repo | Removed — live on merkado-cw |
| Public holder offering | Blocked (M.1.2 / M.1.4) |
| Base Sepolia NFT flow (ADR-0008) | [LABS] Implemented locally behind config: test deployment exists for local/staging verification; migrations not applied; hosted flow not activated or merged |
| Real wallet / Safe / mainnet | Base Mainnet, real funds, production, and deployment gates stay blocked. See `09`, `10`, `12` |

## Reading order

1. Root `AGENTS.md`
2. `09-current-state.md`
3. `02-scope-and-decisions.md`
4. `08-security-and-privacy.md`
5. `12-deployment-runbook.md` and the root `README.md`
