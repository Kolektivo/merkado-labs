# Project instructions

## Product Lead

The user is the Product Lead and final approver. They are a product designer using
AI-assisted development, not a formally trained software developer.

Explain technical decisions in clear product language. Recommend the best approach
and provide beginner-friendly manual steps.

## Start here

Before complex work, read:

1. `docs/README.md` (documentation index and canonical source map)
2. Relevant canonical docs under `docs/01`–`07`, `09`, and
   `docs/LABS_DASHBOARD_GUIDE.md` (`docs/08` is historical only)
3. `docs/01-live-product-state.md` (canonical **current implementation state**)
4. Any file under `docs/tasks/active/`
5. Relevant code, schemas, configuration, and migrations
6. `docs/labs/SAFETY_RULES.md` before any write, deploy, or credential use

Do not require the user to paste previous AI summaries when the repository
contains the needed context.

## Source priority

1. Current code, schemas, configuration, and migrations on the active branch
2. This file
3. `docs/README.md`
4. Approved canonical documentation and decisions (`docs/01`–`07`, `09`, guide, safety)
5. `docs/01-live-product-state.md` (current state snapshot)
6. Active approved task plan under `docs/tasks/active/`
7. AI chat summaries or proposals

Report conflicts before implementation.

**Historical only — not the live backlog or current roadmap:**

- `docs/08-execution-plan-and-cursor-prompt.md`
- `docs/labs/EXPERIMENT_LOG.md`
- `docs/supabase-architecture.md` and `docs/merkado_n8n_complete_guide_v3.md`
  (production v1 **cars**, not Labs property)

Prefer `docs/03-mvp-scope-and-decisions.md` for scope and gates, and `docs/01`
for what is actually built.

## Working rules

- Respect the request type: planning and audits are read-only unless
  implementation is requested.
- Handle simple low-risk changes directly.
- Plan major, ambiguous, architectural, database, authentication, or high-risk
  work before editing.
- Make the smallest complete maintainable change.
- Preserve unrelated user changes and established patterns.
- Do not add fabricated data, speculative features, unnecessary dependencies,
  duplicate logic, or broad unrelated refactors.
- Do not weaken validation, authorization, RLS, tests, error handling, or data
  integrity.
- Never expose secrets.
- Require explicit approval for production data changes, destructive operations,
  deployments, merges, or pushes.
- Use multiple agents only for meaningful independent work.
- User Subagents (`implementation-verifier`, `product-experience-reviewer`,
  `security-data-auditor`, `debugger`) live at User scope
  (`~/.cursor/agents/`), not as committed project copies.

### Merkado Labs safety (mandatory)

- Allowed Supabase target only: Labs project reference `csaefdkpwukshtouyixg`.
- Production project reference `jkrfyvukhhsapoivntms` is forbidden.
- Never access or copy production data, users, schemas, secrets, or config.
- Never run destructive SQL without explicit approval.
- Represent every database change in a reviewed migration file before applying.
- Enable RLS on every table created in an exposed schema.
- Use service-role credentials only in local backend scripts; never commit or
  expose them.
- Preserve scraped source data in raw form before normalization.
- Do not deploy to Vercel from this repository unless explicitly instructed.
- Do not add a new frontend surface, browser automation, AI framework, vector
  database, or knowledge-graph technology without an explicit task.
- Full rules: `docs/labs/SAFETY_RULES.md` and
  `.cursor/rules/merkado-labs-safety.mdc`.

## Documentation

- Each durable fact or decision has one canonical home (see `docs/README.md`).
- Update existing canonical docs rather than creating duplicates.
- Meeting notes and research are evidence, not automatically approved
  requirements.
- Use `docs/tasks/active/` only for meaningful multi-step tasks.
- Move durable outcomes from completed tasks into canonical docs.
- There are two active docs numbered `06` (currency vs Passport). Do not
  renumber them without Product Lead approval.
- App-scoped `apps/labs-dashboard/AGENTS.md` and `CLAUDE.md` are Next.js
  instructions for that app, not duplicates of this file.

### Documentation Synchronization Protocol

Keep documentation continuous with Product Lead decisions:

1. A **direct user instruction** to create, change, remove, or approve something
   is the latest approved product intent and may supersede existing
   documentation.
2. Questions, brainstorming, examples, and unconfirmed ideas must **not**
   automatically become approved decisions.
3. Before implementation, compare the request with canonical docs.
4. If it conflicts, briefly explain the conflict, then follow the new direct
   instruction and update the affected canonical docs.
5. Do not silently follow outdated documentation over a newer explicit user
   instruction.
6. Update requirement, scope, architecture, and decision docs when the
   direction is approved (for example `docs/03`, topic docs `04`–`07`, ADRs).
7. Update `docs/01-live-product-state.md` **only after** implementation is
   completed and verified. Never describe unfinished work as live.
8. Update `docs/testing-and-uat.md` when flows, acceptance criteria,
   permissions, or risks change.
9. Every completed non-trivial task must either update the relevant docs or
   explicitly state **No documentation update needed** with a reason.
10. Production, destructive, database, billing, privacy, and security changes
    still require explicit approval before execution.

### Meeting Notes Workflow

1. Store raw notes as `docs/meetings/YYYY-MM-DD-topic.md` (use
   `docs/meetings/meeting-template.md` as a starting shape).
2. When asked to process meeting notes, extract:
   - confirmed decisions
   - proposed ideas
   - open questions
   - action items
   - affected features / docs
3. Update the correct canonical docs with **confirmed** decisions only.
4. Keep proposals and open questions clearly labeled; do not promote them to
   scope without Product Lead confirmation.
5. Add a **Processed into** section on the meeting note linking to every
   updated canonical doc.
6. Never treat unclear discussion as confirmed without asking.
7. Pasteable agent prompt: `docs/ai/meeting-notes-integration-prompt.md`.

## Verification

Python (repository root, with venv activated):

- Install: `python -m pip install -e ".[dev]"`
- Optional geo: `python -m pip install -e ".[geo]"`
- Compile check: `python -m compileall src tests`
- Lint: `python -m ruff check .`
- Tests: `python -m pytest`

Labs dashboard (`apps/labs-dashboard`):

- Install: `npm install` (from that directory) or
  `npm --prefix apps/labs-dashboard install`
- Development: `npm run dev`
- Lint: `npm run lint`
- Type check: `npm run typecheck`
- Unit tests: `npm run test:unit`
- Contract tests: `npm run test:contracts`
- Build: `npm run build`
- Browser / e2e: `npm run test:e2e` (build + Playwright)

Product Lead UAT format and critical flows: `docs/testing-and-uat.md`.

Never claim completion without running relevant available checks and reporting
actual results.

## Definition of done

- Approved scope and acceptance criteria are met
- Relevant UX states and responsive behaviour are covered
- Security, permissions, validation, and data ownership are correct
- Relevant automated checks pass
- Browser or flow testing is completed where possible
- Documentation Synchronization Protocol followed (docs updated, or explicit
  “No documentation update needed” with reason)
- Canonical documentation and current state (`docs/01`) are accurate for
  completed verified work
- Product Lead receives a beginner-friendly UAT checklist
- Remaining risks and manual actions are explicit
