# Merkado Docs — Index

This folder holds the full working context for Merkado, split into focused files so each can be used in the workspace where it matters (Cursor, planning chats, the deck).

**Last updated:** July 2026
**Build context:** solo build for the 21-day Future Caribbean Buildathon (Track 09), unless other engineering support is confirmed.

## The files

| File | What it covers | Use it when |
|---|---|---|
| `01-live-product-state.md` | What is actually built and running on merkado.cw today. The authoritative current state. | You need ground truth about the live product. Never over-promise past this file. |
| `02-v2-vision.md` | Luuk's direction: two-tier marketplace, the Passport, the asset arc, tokenization. | You need the "where this is going" picture. |
| `03-buildathon-scope-and-discovery.md` | The scoping/discovery phase we are in now: deliverables, priority, reuse vs new build, MVP thinking. | Day-to-day sprint planning and scope decisions. |
| `04-reality-check.md` | Claim vs actual. Where the deck/application say more than is true. | Before submitting or presenting anything. |
| `05-open-questions-luuk.md` | Questions blocking architecture decisions, with status. | Tracking what we still need answered. |
| `06-technical-decisions.md` | The key forks that shape the architecture, with a recommended lean on each. | Making or revisiting a big technical call. |

## Tag legend (used across all files)

- `[LIVE]` = built and running in production today
- `[PLANNED]` = in v1 docs as a future idea, not built
- `[WIP]` = being scoped for the buildathon, decision pending
- `[OPEN]` = unresolved question, waiting on Luuk
- `[RISK]` = flagged concern

## Reading order for someone new

1. `01-live-product-state.md` (what exists)
2. `02-v2-vision.md` (where it's going)
3. `03-buildathon-scope-and-discovery.md` (what we build in 21 days)
4. Then `04`, `05`, `06` as reference.

## Source documents

Live v1 (project docs): merkado-strategy-v3_3, supabase-architecture, supabase-rules, development_execution_plan_v2, merkado-monetization-v1, merkado_n8n_complete_guide_v3, cursor-rules-v3_4, vehicle-makes-models.json

Buildathon v2 (Luuk): Merkado_Application_v3.docx, Merkado_Loom_Deck.pptx, Merkado_Workflow_Diagram_v2.png

## Docs still to create (once decisions land)

`merkado-v2-vision-spec`, `property-passport-spec`, `proptech-data-sources`, `wealthtech-compliance-notes`. See `06-technical-decisions.md` for what unblocks each.
