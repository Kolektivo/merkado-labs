# Merkado Docs — Index

This folder holds the working context for the Merkado Labs **Merkado Direct**
and **Merkado Pay** Buildathon demo.

**Last updated:** August 19, 2026
**Canonical set:** `00`–`12` (AI Product Development OS).
**Agent entrypoints:** repository root `AGENTS.md` and `CLAUDE.md`.
**Structure decision:** `docs/decisions/ADR-0001-standard-documentation-structure.md`
and `docs/decisions/ADR-0002-private-local-evidence.md`.
**Buildathon pivot:** `docs/decisions/ADR-0005-buildathon-direct-pay-demo.md`.
**Product naming:** **Merkado Direct** is the umbrella app (My Offers, Create
Offer, Get Now, Marketplace, Portfolio). **Merkado Pay** is the renter
payment-link. Do not prominently brand a separate “Merkado Rent Advance”
product. Internal series/legal wording may remain. “Merkado Premium” is
retired.

## Terminology (canonical)

- **Merkado Direct** = umbrella Labs demo for landlords and holders: My Offers,
  Create Offer, Get Now, Marketplace, and Portfolio. Calm customer copy:
  “rent paid forward” or “get future rent paid upfront.”
- **Merkado Pay** = renter payment-link for mocked USDC rent payments.
- **Merkado account (Labs mock)** = fictional renter account with My Payments
  and Apps. Not production auth.
- **Merkado Direct · Rent Advance** = first series name (internal / legal).
- **Digital Participation Right (DPR)** = instrument name (book-entry in this
  demo). There is no token, NFT, or transferable position.
- **Listing Score** = raw 0–100 underwriting/quality input used by the pricing
  engine. Customer-facing replacement for earlier “Passport score” labels.
- **Property Score** = derived presentation score from Listing Score ×
  rent-to-market multiplier. Never fed back into pricing.
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
| Integrations | `07-integrations.md` |
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
| Get Now + Listing / Property Score | [LABS] Buildathon scope |
| Marketplace | [LABS] Built; subscribe gated |
| Portfolio | [LABS] Pre-seeded positions; automatic distributions |
| Merkado Pay (mocked USDC) | [LABS] Buildathon scope; no real wallet |
| Merkado account mock | [LABS] Buildathon scope; fictional only |
| Login / admin | Removed — demo is open |
| Listing scrapers in this repo | Removed — live on merkado-cw |
| Public holder offering | Blocked (M.1.2 / M.1.4) |
| Real network / Safe / USDC | Unselected; Luis and Luuk own |

## Reading order

1. Root `AGENTS.md`
2. `09-current-state.md`
3. `02-scope-and-decisions.md`
4. `08-security-and-privacy.md`
5. `12-deployment-runbook.md` and the root `README.md`
