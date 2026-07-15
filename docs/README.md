# Merkado Docs — Index

This folder holds the full working context for Merkado, split into focused files so each can be used in the workspace where it matters (Cursor, planning chats, the deck).

**Last updated:** July 2026  
**Build context:** solo build for the 21-day Future Caribbean Buildathon (Track 09), unless other engineering support is confirmed.

## Labs build status (this repository)

| Area | Status |
|---|---|
| CHH harvest → Labs snapshots → importer | Built; daily GitHub Action available |
| Labs property schema + RLS | Built in `csaefdkpwukshtouyixg` |
| Market signals + pilot contract assessment | Built in Labs (scripts + tables) |
| Geospatial boundaries + neighbourhood assignment | Built in Labs |
| Read-only Labs dashboard (`apps/labs-dashboard`) | Built; deployable as a separate Vercel project |
| Real estate UI on live merkado.cw | Not in this repo — still production scope |

## The files

| File | What it covers | Use it when |
|---|---|---|
| `01-live-product-state.md` | What is actually built and running on merkado.cw today. The authoritative current state. | You need ground truth about the live product. Never over-promise past this file. |
| `02-v2-vision.md` | Luuk's direction: two-tier marketplace, the Passport, the asset arc, tokenization. | You need the "where this is going" picture. |
| `03-buildathon-scope-and-discovery.md` | The scoping/discovery phase: deliverables, priority, reuse vs new build, MVP thinking, plus Labs progress. | Day-to-day sprint planning and scope decisions. |
| `04-reality-check.md` | Claim vs actual. Where the deck/application say more than is true. | Before submitting or presenting anything. |
| `05-open-questions-luuk.md` | Questions blocking architecture decisions, with status. | Tracking what we still need answered. |
| `06-technical-decisions.md` | The key forks that shape the architecture, with a recommended lean on each. | Making or revisiting a big technical call. |
| `07-intelligence-layer.md` | Canonical definition of data harvesting, the lightweight knowledge graph, market signals, and MVP boundaries. | Building or explaining the intelligence layer and its data model. |
| `08-labs-property-foundation.md` | Labs-only Supabase schema, CHH snapshot import, RLS, inspectors, operations, and rollback notes. | Working with the isolated property data foundation. |
| `09-labs-geospatial-layer.md` | PostGIS boundaries, assignment model, geo scripts, and map notes for Labs. | Working on coordinates, neighbourhood inference, or the dashboard map. |
| `labs/PROJECT_CONTEXT.md` | What Merkado Labs is, allowed domains, and current Labs project state. | Orienting a new session or collaborator in this repo. |
| `labs/SAFETY_RULES.md` | Hard rules: Labs-only Supabase, no production access, secrets, deploy discipline. | Before any write, deploy, or credential use. |
| `labs/EXPERIMENT_LOG.md` | Dated experiment notes for harvest and data-quality work. | Recording or reviewing what was tried. |

Production reference copies (not Labs build docs):

| File | What it covers |
|---|---|
| `supabase-architecture.md` | Production v1 car-marketplace Supabase reference |
| `merkado_n8n_complete_guide_v3.md` | Production v1 n8n scraping/enrichment guide |

## Tag legend (used across all files)

- `[LIVE]` = built and running in production today
- `[PLANNED]` = in v1 docs as a future idea, not built
- `[WIP]` = being scoped or partially built for the buildathon
- `[LABS]` = built in Merkado Labs only (not live on merkado.cw)
- `[OPEN]` = unresolved question, waiting on Luuk
- `[RISK]` = flagged concern

## Reading order for someone new

1. `01-live-product-state.md` (what exists on merkado.cw)
2. `02-v2-vision.md` (where it's going)
3. `03-buildathon-scope-and-discovery.md` (what we build in 21 days + Labs progress)
4. `07-intelligence-layer.md` (how harvested data becomes connected market intelligence)
5. `08-labs-property-foundation.md` and `09-labs-geospatial-layer.md` (what Labs already has)
6. Then `04`, `05`, `06`, and `labs/` as reference.

## Source documents

Live v1 (project docs): merkado-strategy-v3_3, supabase-architecture, supabase-rules, development_execution_plan_v2, merkado-monetization-v1, merkado_n8n_complete_guide_v3, cursor-rules-v3_4, vehicle-makes-models.json

Buildathon v2 (Luuk): Merkado_Application_v3.docx, Merkado_Loom_Deck.pptx, Merkado_Workflow_Diagram_v2.png

## Docs still to create (once decisions land)

`merkado-v2-vision-spec`, `property-passport-spec`, `proptech-data-sources`, `wealthtech-compliance-notes`. The intelligence-layer foundation is documented in `07`; Labs implementation notes are in `08`–`09`. See `06-technical-decisions.md` for what unblocks the remaining specs.
