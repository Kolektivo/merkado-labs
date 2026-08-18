# Merkado Docs — Index

This folder holds the working context for Merkado Labs **Rent Advance** and
**Merkado Direct** demo work.

**Last updated:** August 18, 2026
**Canonical set:** `00`–`12` (AI Product Development OS).
**Agent entrypoints:** repository root `AGENTS.md` and `CLAUDE.md`.
**Structure decision:** `docs/decisions/ADR-0001-standard-documentation-structure.md`
and `docs/decisions/ADR-0002-private-local-evidence.md`.
**Product rename:** landlord product is Merkado Rent Advance; holder platform is
Merkado Direct. “Merkado Premium” is retired.

## Terminology (canonical)

- **Merkado Rent Advance** = landlord-facing product (sale of rent receivables).
- **Merkado Direct** = holder-facing platform brand.
- **Merkado Direct · Rent Advance** = first series.
- **Digital Participation Right (DPR)** = instrument name (book-entry in this demo).
- **Passport (this demo)** = offer scores (rent vs market, condition, access).
  This is **not** the merkado.cw **Property Passport** (listing history on a
  property page). Holder-facing marketplace cards label this **Property score**.
- **Marketplace / Listings / Cars / Property** on merkado.cw remain defined in
  merkado-cw. This Labs repo no longer operates the listing pipeline.
  Rent Advance is **not** live on merkado.cw.

**Supersedes:** Labs-as-property-scraper-kitchen. That work is on merkado-cw.

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
| Rent Advance demo | [LABS] Rebuilt August 2026 |
| Pricing engine + 24% cap | [LABS] Built |
| Originate / Passport / collections | [LABS] Built |
| Merkado Direct marketplace | [LABS] Built; subscribe gated |
| Payer app (XCG, EN/NL/PAP) | [LABS] Built; one open page; no crypto |
| Login / admin | Removed — demo is open |
| Listing scrapers in this repo | Removed — live on merkado-cw |
| Public holder offering | Blocked (M.1.2 / M.1.4) |

## Reading order

1. Root `AGENTS.md`
2. `09-current-state.md`
3. `02-scope-and-decisions.md`
4. `08-security-and-privacy.md`
5. `12-deployment-runbook.md` and the root `README.md`
