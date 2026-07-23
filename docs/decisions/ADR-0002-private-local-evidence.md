# ADR-0002: Private local evidence (meetings, research, tasks)

Status: Accepted
Date: 2026-07-23
Owners: Product Lead / Delivery

## Context

ADR-0001 placed supporting evidence under tracked `docs/meetings/`,
`docs/research/`, and `docs/tasks/`. The Product Lead later decided that detailed
meeting notes, research files, task ledgers, and scratch material must stay
local-only so confidential working material is not published on GitHub, while
canonical product knowledge remains public and understandable.

## Decision

- All meeting notes, research files, detailed task files, and scratch material
  are local-only under `docs/private/` (gitignored).
- Do not keep tracked `docs/meetings/`, `docs/research/`, or `docs/tasks/`
  folders.
- Keep `docs/ai/` and `docs/decisions/` tracked.
- Approved, non-sensitive outcomes must still be summarized in the appropriate
  canonical `docs/00`–`12` files (and ADRs when needed).
- The repository must remain understandable without access to `docs/private/`.
- Do not rewrite Git history; older commits may still contain formerly tracked
  evidence files.

## Consequences

- Positive: confidential working material stays off GitHub; GitHub docs stay
  focused on approved product knowledge.
- Negative: detailed audits and task ledgers are unavailable to readers who only
  have the GitHub clone; agents must not rely on private files as source of truth.
- Follow-up: update agent prompts, index, security, roadmap, and ADR-0001
  supporting-folder references to match this decision.

## Approval

- Product Lead: Approved (2026-07-23)
- Date: 2026-07-23
