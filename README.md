# Merkado Labs

Merkado Labs is a separate experimental workspace for Curaçao market-data research.
It is not the live Merkado application and must never write to production systems
automatically.

## What exists today

- **Property foundation** in Labs Supabase (`csaefdkpwukshtouyixg`): listings,
  sources, neighbourhoods, observations, quarantine, market signals, source-run
  health, listing activity events, and public-effective browse projection.
- **Four Ready adapters** under `src/merkado_labs/scrapers/`: Keller Williams
  v0.3.1, RE/MAX v0.4.1, Moret v0.2.0, Monumentenzorg v0.2.0. Sotheby's is
  BLOCKED and excluded from Ready pipelines. CHH is retired/removed.
- **Property pipeline** (orchestrator/worker/locks/anomaly/budgets/`change_hash`)
  is **on hold** (2026-07-27 Product Lead): GitHub workflow disabled, cron
  removed, `LABS_OPERATIONS_ENABLED=false`, Labs `OPENAI_API_KEY` removed,
  `AUTOMATIC_REFRESH_ENABLED = false`. Live Ready inventory runs on merkado-cw.
- **AI enrichment** paused on Labs; paid Terra enrichment runs on merkado-cw.
- **Geospatial layer**: PostGIS neighbourhood boundaries and assignment.
- **Labs dashboard** (`apps/labs-dashboard`): ops + Data Operations + Browse
  public preview + filtered Property Passport activity + Enrichment review +
  native listing and guided-search prototypes — **not** read-only.
- **Labs dataset:** inventory, public-eligible, and pricing readiness figures
  change over time — see **`docs/09-current-state.md`** only (dated audits under
  local `docs/private/research/` are historical evidence, not the live snapshot).

Canonical docs (`docs/00`–`12`) are the current source of truth. Start at
`docs/00-docs-index.md` (terminology: Marketplace / Listings / Property = real
estate only — ADR-0003). Agent operating rules: root `AGENTS.md` (Claude:
`CLAUDE.md`). Verification and Product Lead UAT: `docs/11-testing-and-uat.md`.
Full ops/deploy guidance: `docs/12-deployment-runbook.md`.

## Local setup (Python)

Python 3.12 or newer is required.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e ".[dev]"
Copy-Item .env.example .env
```

Optional geospatial tooling:

```powershell
python -m pip install -e ".[geo]"
```

Only connect `.env` to the Labs Supabase project. Never use production
service-role credentials. See `docs/08-security-and-privacy.md` before any external write.

## Labs dashboard (Next.js)

```powershell
cd apps/labs-dashboard
npm install
Copy-Item .env.example .env.local
npm run dev
```

Details, routes, and Vercel setup: `apps/labs-dashboard/README.md`.

## Validation

```powershell
python -m compileall src tests
python -m ruff check .
python -m pytest
```

Dashboard checks:

```powershell
cd apps/labs-dashboard
npm run lint
npm run typecheck
npm run test:unit
npm run test:contracts
npm run build
npm run test:e2e
```

Full verify matrix and Product Lead UAT: `docs/11-testing-and-uat.md`.

## Docs

Start at `docs/00-docs-index.md`. Agent entry: `AGENTS.md`. Safety:
`docs/08-security-and-privacy.md`. Dashboard ops: `docs/12-deployment-runbook.md`
and `apps/labs-dashboard/README.md`.
