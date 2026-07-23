# 12 - Deployment Runbook

**Purpose:** Setup, local operation, deployment, rollback, and environment
guidance for Merkado Labs.
**Last updated:** July 23, 2026

**Safety first:** `08-security-and-privacy.md` and
`.cursor/rules/merkado-labs-safety.mdc`.
Quick-start for the dashboard app: `apps/labs-dashboard/README.md`.
Beginner setup also summarized in root `README.md`.

Merged operational content from former `LABS_DASHBOARD_GUIDE.md`, deployment
safety notes, and repository setup.

## 1. Allowed targets

| System | Allowed | Forbidden |
|---|---|---|
| Supabase | Labs `csaefdkpwukshtouyixg` (`merkado-labs`, region `eu-west-3`) | Production `jkrfyvukhhsapoivntms` |
| Vercel | Separate Labs project, root `apps/labs-dashboard`, Labs publishable env only | Production Merkado Vercel / merkado.cw domain |
| GitHub Actions | `property-pipeline-labs.yml` with Labs secrets | Production credentials |

Do not create, link, change env vars, deploy, push, or promote without explicit
approval.

## 2. Local Python setup

Python 3.12+.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e ".[dev]"
Copy-Item .env.example .env
```

Optional geo:

```powershell
python -m pip install -e ".[geo]"
```

Root `.env.example` keys (names only): `ENVIRONMENT`, `SUPABASE_PROJECT_REF`,
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, OpenAI
enrichment keys, `LABS_ADMIN_SECRET`.

## 3. Local Labs dashboard

```powershell
npm --prefix apps/labs-dashboard install
npm --prefix apps/labs-dashboard run dev
```

Or:

```powershell
cd apps/labs-dashboard
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

### Required dashboard env (names only)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
- `LABS_ADMIN_SECRET`

### Optional

- `OPENAI_API_KEY`, `OPENAI_ENRICHMENT_MODEL`
- `GITHUB_REPOSITORY`, fine-grained `GITHUB_TOKEN` (Data Operations → Run now)
- Map style / reverse-geocode keys as in app `.env.example`

All credentials must target Labs only. Never commit `.env` / `.env.local`.

### Log in

Internal routes redirect to `/login`. Enter `LABS_ADMIN_SECRET` once. Cookie is
signed httpOnly ~12h. Sign out from Settings.

Public Browse does not use the admin cookie.

## 4. Main operational surfaces

See `03-user-flows.md` for journeys. Ops summary:

- Overview, Listings (+ Add property), Sources, Enrichment, Quality, Data
  Operations, Settings
- Browse public preview; Prototypes (What Fits Me / Property Search)

### Source-run meaning

`success` is meaningful only for a complete catalog. Bounded/partial runs are
`partial` and must never mark absent listings missing/removed.

### Troubleshoot database loading

1. Settings → five yes/no configuration statuses
2. Confirm URL points to `csaefdkpwukshtouyixg`
3. Restart dev server after env changes
4. Read error category: Configuration, Authentication, Network, or Database query
5. Do not treat a failed query as an empty database

### Do not run without approval

- source adapters or listing imports;
- complete-run lifecycle updates;
- AI enrichment jobs;
- schedules or workflows (including changing/disabling cron);
- destructive SQL or database resets;
- production Supabase or Vercel operations;
- deployments or pushes.

## 5. Property pipeline automation

- Scripts: `scripts/run_property_pipeline.py`,
  `scripts/run_property_pipeline_worker.py`
- Workflow: `.github/workflows/property-pipeline-labs.yml`
- Schedule: `0 4 * * *` UTC when on default branch;
  `AUTOMATIC_REFRESH_ENABLED = true`
- Guards hard-code Labs ref and forbid production ref
- AI budgets: USD 2/day, USD 25/month, 25 listings/run (workflow/pipeline)
- Sotheby's excluded while BLOCKED

## 6. Vercel (Labs only, approval required)

If deployed:

1. Separate Vercel project (not production Merkado)
2. Root directory: `apps/labs-dashboard`
3. Labs publishable env vars only — never service-role in client
4. Explicit owner approval before create/link/env change/deploy

No `vercel.json` is committed in this repository (verified locally).

## 7. Validation commands

Python:

```powershell
python -m compileall src tests
python -m ruff check .
python -m pytest
```

Dashboard:

```powershell
cd apps/labs-dashboard
npm run lint
npm run typecheck
npm run test:unit
npm run test:contracts
npm run build
npm run test:e2e
```

Full UAT format: `11-testing-and-uat.md`.

## 8. Rollback guidance

- Prefer feature branch for rollback of risky changes; keep one app and one
  architecture
- Database: forward-only migrations; do not edit applied migrations in place
- Data cleanup: export + checksum evidence before deletes (CHH retirement rules
  in `08-security-and-privacy.md`; detailed local notes may exist under
  `docs/private/research/`)
- Pipeline: prefer dry-run / bounded runs before widening scope
- Deploy: only with explicit approval; do not auto-promote

## 9. Supporting historical tooling

- CHH cleanup scripts: `scripts/cleanup/README.md`
- Cleanup export evidence: `data/processed/chh_cleanup_export/README.md`
