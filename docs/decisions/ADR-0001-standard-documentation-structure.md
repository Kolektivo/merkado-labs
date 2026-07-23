# ADR-0001: Standard documentation structure (AI Product Development OS)

Status: Accepted
Date: 2026-07-23
Owners: Product Lead / Delivery

## Context

Merkado Labs documentation used overlapping numbered files (two active `06`
docs), a historical `08` sometimes mistaken for the live roadmap, and
Labs-specific material under `docs/labs/` mixed with dated evidence. The
repository needed one maintainable canonical set that AI agents and humans can
follow without losing unique requirements, decisions, or historical evidence.

## Decision

Adopt the standard AI Product Development OS documentation tree:

- `docs/00-docs-index.md` through `docs/12-deployment-runbook.md`
- Supporting folders: `decisions/`, `meetings/`, `research/`, `tasks/active/`,
  `tasks/archive/`, `ai/`
- Keep app-scoped `AGENTS.md` / `CLAUDE.md` / README beside `apps/labs-dashboard`
- Keep executable safety enforcement in `.cursor/rules/`
- Move dated audits, experiment logs, legacy cars guides, and decision history
  under `docs/research/` with HISTORICAL banners on migrated/restored evidence
  only
- Remove `docs/labs/` after verified content coverage
- Continuous sync: approved intent → vision/scope/flows/architecture; verified
  implementation → `09`; approved remaining work → `10` + tasks; acceptance →
  `11`; operations → `12`

Currency and pricing policy merges into `06-data-model.md` under
**Currency, pricing, and normalization rules**. Property Passport content is
split across canonical files with cross-links. `10-execution-roadmap.md` uses
**Now / Next / Later / Blocked** for approved work only.

## Options considered

### Option A: Keep existing `01`–`09` numbering and patch gaps

- Benefits: smaller rename surface
- Risks: continued dual-`06` confusion; historical `08` confusion
- Product impact: agents keep misreading backlog
- Technical impact: bootstrap prompt cannot standardize new repos

### Option B: Full standard `00`–`12` restructure (chosen)

- Benefits: one subject → one home; clear current vs historical; portable OS
- Risks: large path update sweep; temporary dual files during merge
- Product impact: clearer Product Lead review surfaces
- Technical impact: requires coverage ledger before deleting sources

## Reason

Option B matches the approved Product Lead plan, removes known numbering
hazards, and aligns future bootstrap work with one exact structure.

## Consequences

- Positive: clearer agent entry, safer historical labeling, portable docs OS
- Negative: all path references must be updated; short transition where sources
  remain until coverage passes
- Follow-up: archive the docs-standardization task after coverage gate

## Reversal or migration

Git history retains prior paths. Reversal would require restoring former
filenames from git and re-pointing `AGENTS.md` / Cursor rules — not recommended
without Product Lead approval.

## Approval

- Product Lead: Approved (A1–A9 refinements, 2026-07-23)
- Technical owner: Delivery agent implementation on branch
  `docs/standardize-documentation`
- Date: 2026-07-23
