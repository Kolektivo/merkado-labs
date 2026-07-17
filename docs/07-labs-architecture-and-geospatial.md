# 07 - Labs Architecture & Geospatial Layer

**Purpose:** Technical boundaries and source-neutral architecture for the isolated property Labs environment.

## 1. Environment boundary

Allowed Supabase project only:

- name: `merkado-labs`
- reference: `csaefdkpwukshtouyixg`
- region: `eu-west-3`

Production project `jkrfyvukhhsapoivntms` is forbidden for this work.

Production and Labs must never share service-role credentials, writes, migrations, or deployments automatically.

## 2. High-level model

- `property_sources`: direct source websites
- `property_listings`: source-specific advertisements
- `property_assets`: possible canonical real-world properties
- immutable listing observations
- immutable price observations
- source-run records
- activity events
- ingestion quarantine/conflicts
- neighbourhoods and aliases
- geospatial assignment fields/functions
- later market signals and evidence links

Importing a source listing must not automatically create, merge, or link a canonical property asset.

## 3. Source-neutral import flow

```text
DIRECT SOURCE ADAPTER
  -> private raw evidence (Storage HTML + observation metadata)
  -> deterministic extraction (source description, fields, amenities)
  -> immutable listing / price observations
  -> currency benchmark
  -> lifecycle comparison (sold / rented / under_contract / first-observed)
  -> optional AI enrichment proposals (manual; never overwrites source facts)
  -> geospatial assignment when coordinates changed
  -> Labs dashboard review
```

Each source runs independently. Scheduling remains off until explicitly approved.

### Evidence layers

| Layer | Storage | Rule |
|---|---|---|
| Raw evidence | Private bucket `listing-raw-evidence` + `listing_observations` metadata | Full HTML never in public queries |
| Deterministic extract | `property_listings` + observation `normalized_payload` | Code parsing first; provenance retained |
| AI proposals | `ai_enrichment_proposals` + `ai_enrichment_jobs` | Separate proposal layer; source facts immutable |

### OpenAI enrichment (Labs only)

- Env (all server-only; never `NEXT_PUBLIC_`): `OPENAI_API_KEY`,
  `OPENAI_ENRICHMENT_MODEL` (**required**, no silent default),
  `OPENAI_ENRICHMENT_REASONING_EFFORT`, `OPENAI_ENRICHMENT_MAX_OUTPUT_TOKENS`,
  `OPENAI_ENRICHMENT_BATCH_SIZE`
- Unknown model pricing displays **unavailable** (does not borrow another model's rates)
- Admin gate: `LABS_ADMIN_SECRET` → signed httpOnly Labs admin session cookie
  (secret never in sessionStorage/localStorage/client state after unlock)
- Manual dashboard flow: `/enrichment` → unlock → preview → run job → poll → review
- Shared runner: `scripts/run_ai_enrichment.py` / `merkado_labs.enrichment.jobs`
- Pricing estimates: `merkado_labs.enrichment.pricing` (prefer estimates over spend)
- AI tables: **service-role only**
- Review statuses: `unreviewed` / `approved_for_research` / `rejected` / `needs_changes`
- Approval never overwrites source facts
- Why prior batch used `gpt-4.1-mini`: hardcoded in `run_ai_enrichment_batch25.py` +
  former `DEFAULT_MODEL` / config default before env-only hardening
- Future hook after complete successful scrape: enqueue new/changed only — **not scheduled yet**

### Security model (Labs read access)

- Anon/authenticated: **SELECT only** on `public_property_listings` (and neighbourhoods).
- No anon SELECT on `property_listings`, observations, activity events, source runs,
  AI tables, search/agent/match tables, or raw evidence.
- Labs dashboard internal queries use server-side service-role client.
- Public view uses `security_invoker=false` so the projection is readable without
  granting underlying table SELECT.

### Labs product previews (2026-07-17)

- `/browse` + Passport-style detail (eligible active only) — Labs prototype
- `/search-requests`, `/what-fits-me`, `/agent`, `/match-reports/[requestId]` — Labs prototypes
- Matcher: `merkado_labs.matching` (`rules_v1`) + `scripts/run_match_preview.py`
- No real email, billing, or production merkado.cw connection
- Nothing here is described as live on merkado.cw

### RE/MAX refresh (2026-07-17)

- Adapter `0.4.0`: full body description (was meta-only ~147 chars → avg ~1970)
- Complete Labs refresh run `a6a32434-36e5-46b1-8033-143917eb0aeb`: 220 updated, 220 evidence uploads
- Status backfill: 59 sold + 36 rented + 29 under_contract first-observed events
- Initial AI validation: 5 listings succeeded; unchanged rerun skipped (0 tokens)

## 4. Geospatial principles

- Preserve source latitude/longitude as evidence.
- Store derived PostGIS geography separately.
- Never silently overwrite source-provided neighbourhood.
- Store inferred neighbourhood with method, status, confidence, and timestamp.
- Bounding boxes are guards only.
- Point-in-polygon assignment is authoritative when valid boundaries and coordinates exist.
- Track coordinate provenance per source.

## 5. Assignment operations

Neighbourhood assignment runs after a successful direct-source import when coordinates are new or changed.

Do not clear or reassign geography after source failure.

Reprocess only when:

- coordinates changed;
- boundaries changed;
- assignment logic changed;
- an explicit reviewed reprocessing task runs.

Continue to support:

- source coordinates;
- derived geography point;
- source neighbourhood;
- inferred neighbourhood;
- assignment status/method;
- assigned timestamp/confidence;
- coordinate provenance.

## 6. Dashboard requirements

Add or retain views for:

- source coverage and source-run health;
- original vs XCG benchmark price;
- explicit/inferred currency;
- conversion provider/timestamp;
- active, sold, missing, and removed states;
- no-price exclusions/public eligibility;
- activity timeline;
- coordinate quality and assignment status;
- safe map filtering by source and lifecycle state.

Sold and removed records may appear in admin/history views, but not active inventory.

## 7. Migration and rollback rules

- Use forward-only migrations.
- Never edit applied migrations.
- No database resets.
- RLS on every exposed table.
- Begin read-only before any write.
- Verify Labs project reference before every write.
- Clearing inferred fields is safer than dropping PostGIS.
- Do not deploy Labs to the production Merkado Vercel project.
