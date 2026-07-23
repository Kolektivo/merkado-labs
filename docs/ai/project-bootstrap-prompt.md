# Project bootstrap prompt

Use this in Cursor **Plan Mode** when starting a **new** product repository (or
bootstrapping AI operating docs into an empty/near-empty repo).

This prompt creates documentation and initial tasks only. It does **not**
implement the product.

```text
Bootstrap the AI Product Development Operating System for this repository.

## Goal

Create a maintainable documentation and agent operating setup from a free-form
project description. Do not build product features yet.

## Inputs

1. Free-form description in PROJECT_BRIEF.md at the repo root (create from
   docs/ai/project-brief-template.md if missing; ask the Product Lead to fill it).
2. Optional temporary AI setup template folder (for example _ai-setup-template/)
   used as reference only — never treat it as canonical project documentation.
3. Any existing README, docs, AGENTS.md, CLAUDE.md, .cursor rules, package
   scripts, CI, or safety notes already in the repo.

## Operating mode

1. Start read-only: inventory existing files and the brief.
2. Propose the smallest non-duplicative documentation setup.
3. Wait for Product Lead approval before writing when the repo already has
   meaningful docs or product code.
4. For a brand-new empty repo with an approved brief, you may create the docs
   scaffold after stating the plan.

## Required outcomes

- Root AGENTS.md and thin CLAUDE.md (@AGENTS.md)
- Docs index with a canonical source map
- Canonical docs generated from the brief, clearly separating:
  - confirmed requirements
  - proposals
  - assumptions
  - open questions
- Current-state doc that does not claim unfinished work as live
- Testing/UAT and deployment/safety stubs only when needed for this project
- docs/tasks/active/ with initial planning tasks only (no product implementation)
- Meeting / research / ADR templates as needed
- Real install/dev/lint/test/build commands when they exist; placeholders marked
  clearly when they do not
- Beginner-friendly next-step checklist for the Product Lead
- Remove the temporary AI setup template from disk only after successful
  integration and Product Lead confirmation

## Hard rules

- Do not implement product features, schemas, or UI in this bootstrap pass.
- Do not invent confirmed requirements that are not in the brief or explicit
  approvals.
- Do not commit, push, deploy, or touch production unless explicitly asked.
- Prefer reusing existing strong docs over creating parallel homes.
- One subject → one canonical file.

## Return

1. Inventory of existing files
2. Classification of brief statements (confirmed / proposal / assumption / open)
3. Files created or updated
4. Initial tasks created (titles + goals only)
5. Beginner-friendly next-step checklist
6. What still needs Product Lead approval
7. Whether the temporary template can be deleted
```
