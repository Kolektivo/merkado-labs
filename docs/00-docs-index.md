# Merkado Docs — Index

This folder holds the working context for the Merkado Labs **Merkado Direct**
and **Merkado Pay** Buildathon demo.

**Last updated:** August 20, 2026 (PR #22 draft — landlord claim for every offer; Base Sepolia / Base Mainnet)
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
  with Apps and **My Payments**. Only Merkado Pay and Merkado Direct are
  live. Not production auth.
- **Merkado Direct · Rent Advance** = first series name (internal / legal).
- **Digital Participation Right (DPR)** = instrument name (book-entry in this
  demo). There is no token, NFT, or transferable position.
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
- **Landlord proceeds claim** = the only approved mocked landlord
  sale-proceeds settlement flow (PR #22 draft). It lets a landlord claim
  fully-funded sale proceeds for every offer
  (`landlord_claim`). The claim lifecycle is `available → processing →
  paid` (also `failed`), and the payout destination is an **unverified demo
  EOA**, never proof of wallet ownership. It is a mock business allocation,
  not an on-chain transfer receipt. MRA-001, MRA-010, and every new or
  existing offer use `landlord_claim`. Legacy missing or `automatic` modes
  migrate to `landlord_claim`; no offer derives or retains an
  `advance_settlement`. Automatic holder **rent distributions** remain
  unchanged and are separate from landlord **sale-proceeds settlement**.
- **OfferFundingRecord** = the mocked business allocation created when a
  offer is fully funded (UI wording **“Mock funding recorded”**,
  never “Deposit confirmed on-chain”). It is not an on-chain transfer
  receipt.
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
| Decision records | `decisions/` |
| AI prompts | `ai/` |
| Private local material | `private/` (gitignored) |

## Labs build status (qualitative)

| Area | Status |
|---|---|
| Merkado Direct umbrella | [LABS] Buildathon demo (see `09` after verify) |
| Pricing engine + 24% cap | [LABS] Built |
| Simulator + Listing / Property Score | [LABS] Buildathon scope |
| Marketplace | [LABS] Built; demo purchase fills a position |
| Portfolio | [LABS] Seeded positions plus purchases from Marketplace |
| Landlord proceeds claim (PR #22 draft) | [LABS] Approved target: mocked `landlord_claim` on every offer; fictional EOA payouts; not deployed |
| Merkado Pay (mocked USDC) | [LABS] Buildathon scope; UI in XCG; no real wallet |
| Merkado account mock | [LABS] Buildathon scope; fictional only |
| Admin | [LABS] Bottom of left nav — approval, collections, reset |
| Listing scrapers in this repo | Removed — live on merkado-cw |
| Public holder offering | Blocked (M.1.2 / M.1.4) |
| Real wallet / Safe transfer | Still mocked on `main`. Draft PR 19 is **not merged**. Test Safe is being created on **Base Sepolia**. Address **not in the app yet**. Base Mainnet later. Handoff in `07` / `12` |

## Reading order

1. Root `AGENTS.md`
2. `09-current-state.md`
3. `02-scope-and-decisions.md`
4. `08-security-and-privacy.md`
5. `12-deployment-runbook.md` and the root `README.md`
