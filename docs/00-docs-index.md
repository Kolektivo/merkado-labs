# Merkado Docs — Index

This folder holds the working context for the Merkado Labs **Merkado Direct**
and **Merkado Pay** Buildathon demo.

**Last updated:** August 21, 2026 (payout-first, whole-offer flow)
**Canonical set:** `00`–`12` (AI Product Development OS).
**Agent entrypoints:** repository root `AGENTS.md` and `CLAUDE.md`.
**Structure decision:** `docs/decisions/ADR-0001-standard-documentation-structure.md`
and `docs/decisions/ADR-0002-private-local-evidence.md`.
**Buildathon pivot:** `docs/decisions/ADR-0005-buildathon-direct-pay-demo.md`.
**Product naming:** **Merkado Direct** is the umbrella app (My Offers, Create
Offer, Simulator, Marketplace, Portfolio). **Merkado Pay** is the renter
payment-link. **Admin** is the operations page at the bottom of the left nav.
Do not prominently brand a separate “Merkado Rent Advance” product. Internal
series/legal wording may remain. “Merkado Premium” is retired.

## Terminology (canonical)

- **Merkado Direct** = umbrella Labs demo for landlords and holders: My Offers,
  Create Offer, Simulator, Marketplace, and Portfolio. Calm customer copy:
  “rent paid forward” or “get future rent paid upfront.”
- **Merkado Pay** = renter payment-link for mocked USDC rent payments on
  Base Sepolia by default (Base Mainnet later).
  Customer screens show **XCG** at **1 USD = 1.79 XCG**. USDC still settles
  1:1 with the stored USD rent.
- **Merkado account (Labs mock)** = demo renter account (**Luuk Weber**)
  with Apps. Merkado Pay and Merkado Direct are the enabled apps. Automatic
  landlord payout status stays on My Offers. Account Settings stays visible in
  marketplace account chrome but is inactive. Not production auth.
- **Merkado Direct · Rent Advance** = first series name (internal / legal).
- **Digital Participation Right (DPR)** = instrument name. In this demo the
  offer is created by Merkado after approval — one listing offer per
  listing, for tracking and a later resale. Customer copy still does not
  sell this as a token or public offering. Merkado is not a custody
  product: after sale, that listing collects rent.
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

**Supersedes:** Labs-as-property-scraper-kitchen. That work is on merkado-cw.
ADR-0004 remains the Labs-rebuild record; ADR-0005 supersedes only the
customer brand split, no-crypto-as-product stance, and holder-only Direct
framing where they conflict.

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
| Decision records | `decisions/` (walletless landlord: ADR-0006; payout-first whole offer: ADR-0007) |
| AI prompts | `ai/` |
| Private local material | `private/` (gitignored) |

## Labs build status (qualitative)

| Area | Status |
|---|---|
| Merkado Direct umbrella | [LABS] Buildathon demo (see `09` after verify) |
| Pricing engine + 24% cap | [LABS] Built |
| Simulator + Listing / Property Score | [LABS] Buildathon scope |
| Marketplace | [LABS] Built; 100% whole-offer purchase with mocked Connect wallet step and 60-day expiry |
| Portfolio | [LABS] Seeded positions plus purchases from Marketplace |
| Merkado Pay (mocked USDC) | [LABS] Buildathon scope; UI in XCG; stablecoin QR; disabled Sentoo preview; no real wallet or bank transfer |
| Merkado account mock | [LABS] Buildathon scope; fictional only |
| Admin | [LABS] Bottom of left nav — approval, collections, reset |
| Listing scrapers in this repo | Removed — live on merkado-cw |
| Public holder offering | Blocked (M.1.2 / M.1.4) |
| Walletless landlord | [LABS] Payout selected before request; automatic mocked sale payout; Girasol bank preview is Coming soon |
| Real wallet / Safe transfer | Still mocked on `main`. Draft PRs 19, 20, and 22 are **not merged**. Luis has a 2-of-3 Base Sepolia Safe on that stack. NFT flow still mocked. Handoff in `07` / `12`. Architecture: `ADR-0006` |

## Reading order

1. Root `AGENTS.md`
2. `09-current-state.md`
3. `02-scope-and-decisions.md`
4. `08-security-and-privacy.md`
5. `12-deployment-runbook.md` and the root `README.md`
