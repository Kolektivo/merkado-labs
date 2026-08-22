# Project instructions

## Product Lead

The user is the Product Lead and final approver. They are a product designer using
AI-assisted development, not a formally trained software developer.

Explain technical decisions in clear product language. Recommend the best approach
and provide beginner-friendly manual steps.

## Start here

Before complex work, read:

1. `docs/00-docs-index.md` (documentation index and canonical source map)
2. Relevant canonical docs under `docs/01`–`12`
3. `docs/09-current-state.md` (canonical **current implementation state**)
4. `docs/10-execution-roadmap.md` for approved remaining work
5. Relevant code, schemas, configuration, and migrations
6. `docs/08-security-and-privacy.md` before any write, deploy, or credential use

Do not require the user to paste previous AI summaries when the repository
contains the needed context.

## Source priority

1. Current code, schemas, configuration, and migrations on the active branch
2. This file
3. `docs/00-docs-index.md`
4. Approved canonical documentation and decisions (`docs/01`–`12`, ADRs, safety)
5. `docs/09-current-state.md` (current state snapshot)
6. `docs/10-execution-roadmap.md` (approved remaining work)
7. AI chat summaries or proposals

Report conflicts before implementation.

Detailed meeting notes, research files, and task ledgers are **local-only** under
`docs/private/` and are not part of the GitHub source of truth. Prefer
`docs/02-scope-and-decisions.md` for scope and gates, `docs/09` for what is
actually built, and `docs/10-execution-roadmap.md` for approved remaining work.

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

- Merkado Direct is the umbrella Labs demo. Merkado Pay is the renter
  payment experience.
- The only approved crypto implementation is the Base Sepolia transferable
  NFT flow (ADR-0008): one non-upgradeable ERC-721 (`MerkadoRentOfferV1`)
  holding pooled native USDC rent per token id, company Safe mint, buyer pays
  the exact purchase price to the locked landlord payout address, renter
  `depositRent`, and current-owner `claimRent`. It is implemented locally
  behind config — NOT deployed, NOT activated, NOT merged. Contract
  deployment, the chain store migration, test USDC, Safe transactions,
  hosted activation, and merging require explicit approval. Base Mainnet,
  real funds, and production stay blocked.
- Allowed Supabase target only: Labs project reference `ewoxmzznkavapcxdporm`.
- Production project reference `jkrfyvukhhsapoivntms` is forbidden.
- Never access or copy production data, users, schemas, secrets, or config.
- Never run destructive SQL without explicit approval.
- Represent every database change in a reviewed migration file before applying.
- Enable RLS on every table created in an exposed schema.
- Use service-role credentials only in local backend scripts; never commit,
  print, log, or expose them to browser code.
- Do not deploy to Vercel from this repository unless explicitly instructed.
- Do not add a new frontend surface, browser automation, AI framework, vector
  database, or knowledge-graph technology without an explicit task.
- Full rules: `docs/08-security-and-privacy.md` and
  `.cursor/rules/merkado-labs-safety.mdc`.

## Private local material

- `docs/private/` is local-only working material and must never be committed.
- All meeting notes, research files, detailed task files, and scratch material
  live under `docs/private/` only. Do **not** keep tracked
  `docs/meetings/`, `docs/research/`, or `docs/tasks/` folders.
- Do not copy private content into tracked documentation unless the Product
  Lead explicitly approves that content for the repository.
- Approved, non-sensitive decisions and safe summaries still belong in the
  appropriate canonical documentation (`docs/00`–`12` and `docs/decisions/`).
- Keep `docs/ai/` and `docs/decisions/` tracked.
- The project must remain understandable from tracked docs alone — never
  require access to `docs/private/` to understand product intent or state.

## Documentation

- Each durable fact or decision has one canonical home (see `docs/00-docs-index.md`).
- Update existing canonical docs rather than creating duplicates.
- Meeting notes, research, and detailed tasks are local evidence, not
  automatically approved requirements.
- Use `docs/private/tasks/` for detailed local task ledgers; summarize approved
  remaining work in `docs/10-execution-roadmap.md`.
- Move durable outcomes from completed private tasks into canonical docs.
- Canonical product docs are `docs/00`–`docs/12` (see ADR-0001 / ADR-0002). Do
  not invent parallel numbering.
- This file is the product source of truth. The Next.js app now lives at the
  repository root.

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
6. Update approved intent in vision/scope/flows/architecture as relevant
   (`docs/01`, `02`, `03`, `05`, ADRs).
7. Update `docs/09-current-state.md` **only after** implementation is
   completed and verified. Never describe unfinished work as live.
8. Update `docs/10-execution-roadmap.md` for planned approved work
   (Now / Next / Later / Blocked). Keep detailed task ledgers in
   `docs/private/tasks/` only. Do not auto-promote every unimplemented idea
   into the roadmap.
9. Update `docs/11-testing-and-uat.md` when flows, acceptance criteria,
   permissions, or risks change.
10. Update `docs/12-deployment-runbook.md` for operational / env / deploy changes.
11. Every completed non-trivial task must either update the relevant docs or
    explicitly state **No documentation update needed** with a reason.
12. Production, destructive, database, billing, privacy, and security changes
    still require explicit approval before execution.

### Meeting Notes Workflow

1. Store raw notes as `docs/private/meetings/YYYY-MM-DD-topic.md` (use
   `docs/private/meetings/meeting-template.md` as a starting shape).
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
7. Leave unclear or confidential detail in `docs/private/meetings/`.
8. Pasteable agent prompt: `docs/ai/meeting-notes-integration-prompt.md`.

## Verification

Python scrapers and the old Labs pipeline are **removed**. Do not reintroduce
them. Live marketplace ingestion is merkado-cw only.

Dashboard (repository root):

- Install: `npm install`
- Development: `npm run dev`
- Lint: `npm run lint`
- Type check: `npm run typecheck`
- Unit tests: `npm run test:unit`
- Build: `npm run build`

Product Lead UAT format and critical flows: `docs/11-testing-and-uat.md`.

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
- Canonical documentation and current state (`docs/09`) are accurate for
  completed verified work
- Product Lead receives a beginner-friendly UAT checklist
- Remaining risks and manual actions are explicit
