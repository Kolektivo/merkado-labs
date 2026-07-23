# Merkado Labs Safety Rules

Product/architecture source of truth: `docs/README.md` (`docs/01`–`09`).
Dashboard ops: `docs/LABS_DASHBOARD_GUIDE.md`.

The live Merkado system must remain completely untouched.

The only allowed Supabase target is the standalone Labs project:

- name: `merkado-labs`;
- project reference: `csaefdkpwukshtouyixg`.

The production project `merkado-curaçao`, reference `jkrfyvukhhsapoivntms`, is forbidden.

Labs admin native listing writes (create/update/publish) target Labs only via
service-role server APIs behind the Labs admin cookie. They are not production
user Auth and must never sync to merkado.cw.

Never:

- access the production Supabase project from this workspace;
- modify the production Supabase project;
- run SQL against production;
- reset any database;
- copy production users, schemas, credentials, secrets, or private data;
- modify the live production Merkado Vercel project;
- deploy Labs work to the live Merkado domain;
- write test data to production;
- use production service-role credentials;
- push changes to GitHub without explicit approval;
- automatically promote experiments to production.

Before every Supabase write operation:

1. Verify the exact Supabase project name and project reference.
2. Confirm that both identify a clearly experimental project, such as `Merkado Labs`,
   `Merkado Test`, or `Merkado Development`.
3. Stop without writing if the connected project cannot be confirmed as experimental.

Supabase inspection must begin read-only. Do not create tables, run migrations, change RLS,
insert or delete data, or copy the production schema without explicit approval and a verified
experimental target.

All approved database changes must be represented by reviewed migration files. Enable RLS on
every table created in an exposed schema. Never run destructive SQL without explicit approval.

Service-role credentials may be used only by local backend scripts or the Labs-only GitHub
Action. Never commit, print, log, or expose them to browser code.

Preserve scraped source data in raw form before normalization.

Policy rematerialization / zero-cost proposal reeval must not call OpenAI and
must not alter billable input checksums. Prefer dry-run first; refuse writes
while `property_pipeline_runs` is active. Never invent live inventory counts
in reports — use contracts, dry-run artifacts, or verified queries.

## Vercel

A Labs-only dashboard lives in `apps/labs-dashboard`. If deployed, it must be a **separate**
Vercel project with root directory `apps/labs-dashboard` and Labs publishable env vars only.
Do not link this directory to the production Merkado Vercel project. Do not create, link,
change environment variables, or deploy without explicit repository-owner approval.

Never commit real secrets. Keep local credentials in ignored environment files, preserve
`.env.example` as placeholders only, and never expose a service-role key to browser code,
logs, reports, or source control.

Do not commit, push, deploy, or promote experiments automatically.

Do not add a new frontend surface, browser automation, AI framework, vector
database, or knowledge-graph technology without an explicit task. The existing
Labs dashboard and Terra enrichment path are already approved in this repository.
Keep work focused on Curaçao marketplace experiments.
