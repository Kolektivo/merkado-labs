# Merkado Labs

Merkado Labs is a separate experimental workspace for Curaçao market-data research.
It is not the live Merkado application and must never write to production systems
automatically.

## What exists today

- **Property foundation** in Labs Supabase (`csaefdkpwukshtouyixg`): listings,
  sources, neighbourhoods, observations, quarantine, market signals, source-run
  health, and listing activity events.
- **Direct-source adapters** under `src/merkado_labs/scrapers/` — RE/MAX is the
  first manual/bounded adapter. The former aggregator workflow is retired.
- **Geospatial layer**: PostGIS neighbourhood boundaries and assignment.
- **Read-only Labs dashboard** (`apps/labs-dashboard`) for inspection.

Property MVP docs `docs/01`–`09` are the current source of truth.

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
