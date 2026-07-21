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
  with Data Operations dispatch; **GitHub daily cron temporarily disabled**
  (`AUTOMATIC_REFRESH_ENABLED = false`). Manual/`workflow_dispatch` still available.
- **AI enrichment** v4 / v4.1 active under pipeline budgets; dashboard AI
  execution disabled.
- **Geospatial layer**: PostGIS neighbourhood boundaries and assignment.
- **Labs dashboard** (`apps/labs-dashboard`): ops + Data Operations + Browse
  public preview + Enrichment review + prototypes — **not** read-only.

Property MVP docs `docs/01`–`09` and `docs/LABS_DASHBOARD_GUIDE.md` are the
current source of truth. Start at `docs/README.md`.

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
service-role credentials. See `docs/labs/SAFETY_RULES.md` before any external write.

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
npm run build
```

## Docs

Start at `docs/README.md`. Labs safety notes live under `docs/labs/`.
Dashboard ops: `docs/LABS_DASHBOARD_GUIDE.md`.
