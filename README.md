# Merkado Labs

Merkado Labs is a separate experimental workspace for Curaçao market-data research. It is
not the live Merkado application and must never write to production systems automatically.

Initial work will focus on local Python experiments for collecting, preserving, cleaning,
normalizing, and matching public listing data. No scraper or frontend is included yet.

## Local setup

Python 3.12 or newer is required.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e ".[dev]"
Copy-Item .env.example .env
```

Only connect `.env` to a clearly named experimental Supabase project. Never use production
service-role credentials. See `docs/labs/SAFETY_RULES.md` before any external write.

## Validation

```powershell
python -m compileall src tests
python -m ruff check .
python -m pytest
```

Project context and experiment notes live under `docs/labs/`. Existing documents directly
under `docs/` describe production and planning context and must remain unchanged.
