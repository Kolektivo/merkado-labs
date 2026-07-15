# Labs property foundation

This foundation exists only in Supabase project `csaefdkpwukshtouyixg` (`merkado-labs`).
It is not a production schema and must never be applied to another project.

**Status:** `[LABS]` built — schema, CHH snapshot import, signals, pilot contract assessment,
and a read-only dashboard are in place.

## Model

`property_listings` is one advertisement from one source. Its identity is scoped to
`(property_source_id, external_id)`. For CaribbeanHouseHunt (CHH), `external_id` contains
`urlid`, and `external_id_status` is always `provisional` until evidence across real source
changes establishes its behavior.

`property_assets` represents a possible canonical, real-world property. Importing a listing
never creates, links, or merges an asset. Canonical matching is a separate reviewed process.

`listing_observations` stores immutable raw and normalized harvest evidence. A listing/snapshot
pair is unique. `price_observations` is also immutable: a changed price is appended as a new
row rather than replacing history. Inspector-safe observation counters are maintained on
`property_listings`, so anonymous clients do not need access to raw evidence.

`ingestion_quarantine` holds malformed records and possible reuse/collision of provisional
identifiers. Quarantined rows require human review; they are never silently merged.

Related Labs tables (separate migrations):

- `market_signals` / `signal_evidence` — calculated rent-per-m² style signals
- `neighbourhood_aliases` — normalized name mapping with cycle prevention
- `rental_contracts` / `contract_market_assessments` — pilot contract vs market signal
- geospatial columns and assignment functions — see `09-labs-geospatial-layer.md`

## Migrations

| Migration | Purpose |
|---|---|
| `20260715135549_create_property_foundation.sql` | Core tables, triggers, grants, RLS |
| `20260715135816_index_quarantine_source.sql` | Quarantine source index |
| `20260715143200_create_monthly_rent_signals.sql` | `market_signals` + `signal_evidence` |
| `20260715144130_create_neighbourhood_aliases.sql` | Alias table + cycle trigger |
| `20260715145828_create_rental_contract_assessments.sql` | Empty no-op (superseded) |
| `20260715145900_create_rental_contract_assessments.sql` | Contracts + assessments |
| `20260715194000_create_property_geospatial.sql` | PostGIS + inferred assignment columns |
| `20260715194500_create_neighbourhood_assignment_functions.sql` | Preview/summarize/apply RPCs |

The foundation migration creates seven core tables, foreign-key indexes, immutable-observation
triggers, counter triggers, constraints, grants, and RLS policies. RLS is enabled on every
table created in an exposed schema.

Anonymous access is SELECT-only and limited to:

- `property_sources`
- `neighbourhoods`
- `property_assets`
- `property_listings`
- `price_observations`

There are no anonymous insert, update, or delete policies. `listing_observations` and
`ingestion_quarantine` have no anonymous grants or policies. Dashboard and Streamlit clients
must not attempt to read those tables.

## Required environment-variable names

Set these locally without committing or printing their values:

- `SUPABASE_PROJECT_REF`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` for backend importers / GitHub Action only
- `SUPABASE_PUBLISHABLE_KEY` for the read-only Streamlit inspector
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the Labs dashboard

Importers, the GitHub Action, the Streamlit inspector, and the dashboard all reject a URL
whose host is not `csaefdkpwukshtouyixg.supabase.co`. Writers also reject any project-ref
value other than `csaefdkpwukshtouyixg`.

## CHH snapshot import

The importer no longer uses the early 12-listing sample as its write path. It imports the
**latest immutable snapshot** under:

`experiments/caribbeanhousehunt_sample/snapshots/<UTC>/`

Each snapshot must contain exactly **1,449** matching unique `urlid` values (current contract
in `import_supabase.py`). The importer computes the evidence checksum locally, does not scrape
during import, and does not request images.

Create / compare snapshots:

```powershell
python experiments/caribbeanhousehunt_sample/create_snapshot.py
python experiments/caribbeanhousehunt_sample/compare_snapshots.py
```

Validate then write:

```powershell
python experiments/caribbeanhousehunt_sample/import_supabase.py --dry-run
python experiments/caribbeanhousehunt_sample/import_supabase.py
```

Scheduled path: `.github/workflows/chh-daily-harvest.yml` runs snapshot + import daily against
Labs secrets only.

The import upserts the CHH source, represented neighbourhoods, and source listings. It keeps
`property_asset_id` null. Observation and price inserts use natural conflict keys, so
rerunning the same snapshot does not duplicate history. Conflicting identity fields or
malformed records are quarantined.

Historical note: the first reviewed import was a controlled 12-listing sample. That sample
remains useful as early evidence; it is not the current importer contract.

## Inspectors and dashboard

Streamlit (local):

```powershell
python -m streamlit run experiments/caribbeanhousehunt_sample/app.py
```

Next.js Labs dashboard:

```powershell
cd apps/labs-dashboard
npm install
Copy-Item .env.example .env.local
npm run dev
```

Both use only the publishable key. They read normalized listing fields and inspector-safe
counters. Raw database observations and quarantine rows remain inaccessible. If Labs Supabase
is unavailable, Streamlit may fall back to reviewed local JSON with a clear warning; the
dashboard shows an error state instead of fabricating records.

Dashboard routes and Vercel notes: `apps/labs-dashboard/README.md`.

## Supporting scripts

| Script | Role |
|---|---|
| `calculate_market_signals.py` | Monthly XCG rent/m² → `market_signals` |
| `assess_pilot_contract.py` | Pilot contract vs signals |
| `review_neighbourhood_aliases.py` | Alias review helper |

## Rollback

Do not edit or delete an applied migration. Create and review a new forward migration that
drops policies, triggers, functions, and tables in dependency order. Dropping this foundation
deletes imported evidence and is destructive, so it requires explicit approval before it is
applied. Core dependency order:

1. `ingestion_quarantine`
2. `price_observations`
3. `listing_observations`
4. `property_listings`
5. `property_assets`
6. `neighbourhoods`
7. `property_sources`
8. the foundation migration-created trigger functions

Drop related signal/contract/geospatial objects with their own reviewed forward migrations
first when those layers are present. For a data-only rollback, use a separately reviewed
migration or backend maintenance script scoped to the CHH source. Never use an unreviewed
dashboard deletion or destructive reset against a remote project.
