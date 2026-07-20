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
- Pricing estimates: `merkado_labs.enrichment.pricing` /
  `apps/labs-dashboard/src/lib/enrichment/cost.ts` (mirrored line-for-line;
  prefer estimates over spend)
- AI tables: **service-role only**
- Review statuses: `unreviewed` / `approved_for_research` / `rejected` / `needs_changes`
- Approval never overwrites source facts
- Why prior batch used `gpt-4.1-mini`: hardcoded in `run_ai_enrichment_batch25.py` +
  former `DEFAULT_MODEL` / config default before env-only hardening
- Future hook after complete successful scrape: enqueue new/changed only — **not scheduled yet**

#### Prompt / schema / policy v4

- Current combination: prompt `listing_enrichment_v4`, JSON schema
  `listing_enrichment_schema_v4`, application policy `enrichment_policy_v4`.
- v4 preserves replay parsing for v3 proposal JSON, marks echoed source/map
  values as `redundant` rather than rejected, auto-applies grounded
  neighbourhood gap-fills, and adds source-language display-description blocks.
- The forward public-effective migration remains paused pending review.
- v3 is intentionally compact: the model emits only attributes it actually
  found (sparse `attributes[]`, capped string/array lengths) instead of a
  fixed 16-key `features` object — the main cause of structured-output
  truncation under earlier `max_output_tokens` budgets.
- Legacy v2 proposal JSON still parses for local policy replay
  (`extra="ignore"`, defaulted fields); v3 proposals do not populate the
  legacy `features` dict.

#### Exception-based review

Human review is exception-based, not a default gate: only genuine human
decisions reach `needs_attention` — source conflicts, title/description
disagreement, neighbourhood signal conflicts, high-value ambiguous fields,
new-attribute taxonomy review, or moderate confidence on material
search/display fields. Everything else is either auto-applied (evidenced,
grounded, above the field's confidence bar, no conflict/negation, does not
overwrite a protected source field) or **rejected outright with no
operational attention required** — unsupported, duplicated, forbidden,
malformed, noisy, generic-unhelpful, too-low-confidence, already
represented by stronger source data, or a partial-word/encoding artifact.
Rejected proposals never appear in the attention queue.

#### AI cost & token observability (`/enrichment`)

- Cost label shown next to every figure: *"Estimated from recorded token
  usage and configured model pricing."* — never an OpenAI invoice total.
- **Gross AI spend**: every recorded paid attempt, including retries and
  attempts later superseded or failed.
- **Retained-result cost**: only the result currently in effect per
  listing (the latest successful attempt).
- **Wasted / deferred cost**: paid attempts that were not retained (failed
  calls, structured-output errors, or attempts replaced by a newer run).
- Also shown: total API attempts (paid vs. recorded), avg cost per
  successful/attempted listing, cost per auto-applied field, structured-
  output failure rate, true attention rate (retained listings still
  needing a human look), and input/cached/output/reasoning token totals.
- **Model efficiency** groups attempts by model + prompt version + schema
  version. A different prompt or schema combination is **not directly
  comparable** to another — it changes what the model was even asked to
  do, so historical rows are labelled accordingly.
- Unknown OpenAI account-wide billing (transport retries, other models,
  other projects) cannot be reconstructed from Labs data alone; see
  `data/processed/ai_usage_reconciliation.md` for the gap analysis.

### Public-effective data contract (Browse / Passport)

Public product values come from, in order:

1. Explicit source facts
2. Safe deterministic normalized values
3. Effective map / neighbourhood values
4. Automatically applied, evidence-grounded AI attributes (`auto_apply` only)

Raw AI proposals, rejected / needs-attention suggestions, confidence scores,
evidence snippets, prompt/schema/policy metadata, internal IDs, checksums,
token usage, AI costs, and private HTML must never appear on `/browse`.

**Public attribute allowlist:** pool (+ subtype when known), furnished,
parking, parking spaces, garage, gated community, air conditioning, garden,
terrace, balcony, sea view, solar panels, generator, water heater, security,
appliances, accessibility, pet suitability.

**Effective neighbourhood priority** (one final value; never generic Curaçao):

1. Specific valid source neighbourhood → provenance `From source`
2. Valid point-in-polygon map neighbourhood → `Matched from map`
3. High-confidence grounded AI candidate only when source/map cannot provide
   one → `Extracted from listing text`
4. Otherwise unavailable

Migration `20260720140000_public_property_listings_effective.sql` replaces the
public view with this projection (owner security definer; SELECT-only grants).
Apply only after review — not part of automatic deploy.

### Security model (Labs read access)

- Anon/authenticated: **SELECT only** on `public_property_listings` (and neighbourhoods).
- No anon SELECT on `property_listings`, observations, activity events, source runs,
  AI tables, search/agent/match tables, or raw evidence.
- Labs dashboard internal queries use server-side service-role client.
- Public view uses `security_invoker=false` so the projection is readable without
  granting underlying table SELECT. The effective view joins AI proposals as
  owner and projects only public-safe JSON fields.
- Internal pages redirect to `/login` unless the signed, httpOnly Labs admin
  session cookie is valid. Admin APIs accept the cookie only after login; the
  shared secret is not accepted repeatedly by normal API calls.
- Dashboard config loads ignored values from
  `apps/labs-dashboard/.env.local`. The client refuses any Supabase URL except
  `csaefdkpwukshtouyixg`.

### Labs product previews (2026-07-17)

- `/browse` + Passport-style detail (eligible active only) — Labs prototype
- `/search-requests`, `/what-fits-me`, `/agent`, `/match-reports/[requestId]` — Labs prototypes
- Matcher: `merkado_labs.matching` (`rules_v1`) + `scripts/run_match_preview.py`
- No real email, billing, or production merkado.cw connection
- Nothing here is described as live on merkado.cw

### RE/MAX refresh (2026-07-17) and Terra prep (2026-07-20)

- Adapter `0.4.0`: full body description (was meta-only ~147 chars → avg ~1970)
- Complete Labs refresh run `a6a32434-36e5-46b1-8033-143917eb0aeb`: 220 updated, 220 evidence uploads
- Status backfill: 59 sold + 36 rented + 29 under_contract first-observed events
- Initial AI validation: 5 listings succeeded; unchanged rerun skipped (0 tokens)
- Adapter `0.4.1` (2026-07-20): parse `google.maps.LatLng` (199/220 on cache reparse), listing agent, filter agent headshots; Labs rows not updated (no import this task)
- Terra v3 five-listing canary executed 2026-07-20 (`gpt-5.6-terra` + v3): **5/5** after `hs2467` retry
- v0.4.1 activation + Terra-v3 initial backfill (2026-07-20): offline import applied — **199/220** coordinates; **193** inferred / **6** outside polygons / **21** still missing; effective neighbourhood changes **5** (generic source → map); five-listing semantic Terra refresh + remaining **211** Terra backfill completed (**220/220** Terra-v3 coverage); public eligibility stable at **119**; RE/MAX remains manual/unscheduled; normal Refresh & enrich stays new/changed only

## 4. Geospatial principles

- Preserve source latitude/longitude as evidence.
- Store derived PostGIS geography separately.
- Never silently overwrite source-provided neighbourhood.
- Store inferred neighbourhood with method, status, confidence, and timestamp.
- Bounding boxes are guards only.
- Point-in-polygon assignment is authoritative when valid boundaries and coordinates exist.
- Track coordinate provenance per source.

### Effective neighbourhood (dashboard)

Priority order used everywhere an "effective" neighbourhood is displayed
(listing detail, browse, filters, table):

1. **Source** — explicit, non-generic neighbourhood text from the realtor
   website.
2. **Map** — authoritative point-in-polygon assignment from valid
   coordinates, used only when the source value is missing or generic.
3. **AI gap-fill** — a high-confidence (≥ 0.85) evidence-grounded AI
   neighbourhood candidate, consulted **only** when both stronger tiers
   (source and map) are unavailable.
4. **Unspecified** — otherwise.

AI can never overwrite a stronger source or map value, and the map wins
over a conflicting AI candidate because AI is only consulted once both
stronger tiers are exhausted. Generic island-level mentions (`Curaçao`,
`island`, `Netherlands Antilles`, `Dutch Caribbean`, …) never count as a
specific neighbourhood.

Implementation: `apps/labs-dashboard/src/lib/domain/effective-neighbourhood.ts`,
mirrored in `src/merkado_labs/enrichment/neighbourhood.py` — keep both in
sync when the priority rules change.

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

The cleaned dashboard has six operational areas plus one prototype group:

- Overview
- Listings (including map view and listing detail)
- Sources (including source runs and source detail)
- Enrichment (review-only; execution disabled)
- Quality (eligibility, lifecycle, missing fields, evidence, geography)
- Settings
- Prototypes

Legacy top-level routes redirect into these areas:

- `/source-runs` → `/sources`
- `/eligibility`, `/lifecycle`, `/data-quality`, `/neighbourhoods` → `/quality`
- `/map` → `/listings?view=map`
- `/realtors` → `/listings`
- `/how-it-works` → `/settings`

The dashboard retains views for:

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
