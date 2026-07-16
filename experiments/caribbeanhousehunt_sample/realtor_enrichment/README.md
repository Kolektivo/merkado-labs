# Original realtor enrichment (PoC)

CaribbeanHouseHunt is the **aggregator**. Each listing’s `url_page` points at an
**original realtor or agency** site.

## First controlled adapter

**Domain:** `www.realestate-curacao.com` (RE/MAX BonBini)

Selected because robots allow listing paths, pages are server-rendered with clear
labelled HTML fields (`Bathrooms`, `Living space`, `Lot size` + unit, `Pool`,
`Furnished`, `Gated resort`), and Labs already holds many matching listings.

## Rules

1. Recheck `robots.txt` before fetches.
2. Max 5 listings per controlled sample.
3. Cache pages; rate-limit; identifiable user agent.
4. Deterministic extraction only (no AI scraper).
5. Never overwrite CHH listing values; write observations + conflicts.
6. Do not expand to other domains in this PoC.

## Commands

```powershell
# Dry-run (no DB writes)
.\.venv\Scripts\python.exe experiments/caribbeanhousehunt_sample/realtor_enrichment/run_remax_sample.py --dry-run

# Write enrichment observations + conflicts to Labs
.\.venv\Scripts\python.exe experiments/caribbeanhousehunt_sample/realtor_enrichment/run_remax_sample.py --apply
```

Dashboard comparison: `/enrichment`
