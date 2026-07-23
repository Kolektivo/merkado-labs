# 08 - Security and Privacy

**Purpose:** Privacy, authentication, authorization, RLS, and environment safety
for Merkado Labs.
**Last updated:** July 23, 2026

**Enforcement:** `.cursor/rules/merkado-labs-safety.mdc` (do not weaken).
**Related:** `05-architecture.md`, `06-data-model.md`, `12-deployment-runbook.md`.

Merged from former `docs/labs/SAFETY_RULES.md` and safety sections of former
`docs/09-project-safety-and-history.md`, plus Passport user-data principles.

## 1. Environment boundary

The live Merkado system must remain completely untouched.

**Allowed Supabase target only:**

- name: `merkado-labs`
- project reference: `csaefdkpwukshtouyixg`
- region (Labs identity): `eu-west-3`

**Forbidden production target:**

- name: `merkado-curaçao`
- project reference: `jkrfyvukhhsapoivntms`

Never:

- access or modify production Supabase;
- run SQL against production;
- reset any database;
- copy production users, schemas, credentials, secrets, or private data;
- use production service-role credentials;
- expose service-role credentials to browser code, logs, reports, or source control;
- modify or deploy the production Vercel project / live Merkado domain;
- write test data to production;
- push changes to GitHub without explicit approval;
- automatically promote experiments to production;
- edit applied migrations in place;
- run unreviewed destructive commands.

## 2. Required workflow before writes

1. Begin with read-only repository and schema inspection.
2. Verify the exact Labs project name and reference before every write.
3. Confirm the connected project is clearly experimental (`Merkado Labs`,
   `Merkado Test`, or `Merkado Development`). Stop if not confirmed.
4. Use forward-only migrations or reviewed controlled server-side scripts.
5. Represent every approved database change in a reviewed migration file.
6. Enable RLS on every table created in an exposed schema.
7. Never run destructive SQL without explicit approval.
8. Preserve scraped source data in raw form before normalization.
9. Run adapters manually and bounded before scheduling.
10. Never create missing/removal events from failed or partial runs.
11. Never commit secrets. Keep `.env` files local and ignored. Only
    `.env.example` placeholder names may be documented in the repository —
    never real credential values.
12. Prefer dry-run first for policy rematerialization; refuse writes while
    `property_pipeline_runs` is active. Zero-cost reeval must not call OpenAI or
    alter billable input checksums.
13. Never invent live inventory counts in reports — use contracts, dry-run
    artifacts, or verified queries.

## 3. Labs admin authentication (verified locally)

- Shared secret: `LABS_ADMIN_SECRET` (server env).
- Login: `POST /api/admin/login` → signed httpOnly cookie `labs_admin_session`
  (HMAC-SHA256, ~12h TTL, `sameSite=lax`, `secure` in production).
- Page gate: `src/proxy.ts` — public `/login` and `/browse`; other pages require
  session. `/api/*` uses per-route session asserts.
- Native listing writes use service-role server APIs behind the Labs admin cookie.
  They are **not** production user Auth and must never sync to merkado.cw.
- Public Browse/Passport uses the publishable Labs key against
  `public_property_listings` only.

## 4. Authorization and RLS (summary)

- Core property tables have RLS enabled; hardened migrations revoke anon access
  from internal tables.
- Public read path is the `public_property_listings` view (effective fields only).
- AI jobs/proposals are service-role oriented; anon must not access internal AI
  tables.
- Native listing write RPCs are granted to `service_role`.
- Inspect actual migrations under `supabase/migrations/` before changing policy.

See also `06-data-model.md` § RLS and public/admin access.

## 5. CHH retirement safety

CHH must remain removed from active code, workflows, configuration, UI, tests,
source registration, and Labs data. Do not restore a runnable CHH fallback.
Historical evidence only: `docs/research/` (experiment log, richer-harvest audit,
decision history).

Before any similar data cleanup in future:

- confirm project reference;
- produce affected counts per table;
- create export/checksum rollback evidence;
- delete in dependency-safe order;
- run integrity, RLS, test, and dashboard checks.

## 6. Deployment and technology safety

- Labs dashboard may only use a **separate** Labs Vercel project with root
  `apps/labs-dashboard` and Labs publishable env vars.
- Do not link this directory to the production Merkado Vercel project.
- Do not create, link, change environment variables, or deploy without explicit
  repository-owner approval.
- Do not add a new frontend surface, browser automation, AI framework, vector
  database, or knowledge-graph technology without an explicit task. The existing
  Labs dashboard and Terra enrichment path are already approved.
- Keep work focused on Curaçao marketplace experiments.

Operational detail: `12-deployment-runbook.md`.

## 7. User data and privacy principles (guided discovery)

From Property Passport / intelligence framing — apply before production Auth
launch:

- Ask only for information needed to improve the search.
- Prefer approximate ranges over exact salary, savings, or debt values.
- Clearly mark optional questions.
- Explain how answers affect recommendations.
- Do not infer sensitive personal attributes.
- Do not use family, income, or financial inputs for unrelated advertising.
- Allow users to edit and delete their search profile.
- Separate user-provided facts from Merkado-derived recommendations.
- Define retention, consent, cancellation, and email preference rules before
  launch.

Labs What Fits Me today is an admin-session prototype without production customer
profiles.

## 8. Service-role credential rules

Service-role credentials may be used only by local backend scripts or the
Labs-only GitHub Action. Never commit, print, log, or expose them to browser
code.

## 9. Private local documentation (`docs/private/`)

`docs/private/` is a **local-only**, **gitignored**, **non-canonical** workspace
for confidential material. Intended uses:

- confidential meeting notes
- private research
- rough or sensitive task drafts
- temporary working notes

Rules:

- Never commit anything under `docs/private/`.
- Do not copy private content into tracked documentation unless the Product
  Lead explicitly approves that content for the repository.
- Approved decisions and safe summaries still belong in canonical docs
  (`docs/00`–`12`, ADRs, and the appropriate tracked evidence folders).
- The repository must remain understandable without access to `docs/private/`.
- Secrets, credentials, and production data still follow the rules above —
  private docs are not a place to store service-role keys or production copies.
