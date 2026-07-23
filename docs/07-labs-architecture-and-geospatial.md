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
  -> optional AI enrichment proposals (pipeline under budgets; never overwrites source facts)
  -> geospatial assignment when coordinates changed
  -> Labs dashboard review / Data Operations
```

Four Ready sources share the Labs property pipeline (orchestrator/worker/locks/
anomaly/budgets/`change_hash`). **Daily cron is On**
(`AUTOMATIC_REFRESH_ENABLED = true`) after 2026-07-21 gates; first normal daily
cron on the default branch observed 2026-07-22 (run `29984863341`).
Manual/`workflow_dispatch` and Data Operations dispatch remain available.
Sotheby's is excluded.

### Labs admin native listing path (prototype)

```text
LABS ADMIN SESSION
  -> /listings/new wizard (details → features → photos → review preview)
  -> service-role APIs under assertLabsAdminSession
  -> property_listings (listing_origin=manual)
  -> listing_images + Storage bucket listing-images
  -> immutable activity events (submitted/published/…)
  -> public_property_listings when eligibility passes
```

End-user Auth seller accounts are **not** implemented here. Labs must not use
the admin secret as production user auth. Manual rows never enter adapters,
source runs, or absence/removal logic. AI enrichment is not auto-run for manuals.

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
- Dashboard `/enrichment` is **review-only** (AI job execution disabled in UI)
- Pipeline AI runs under budgets when the property-pipeline worker executes
- Shared runner: `scripts/run_ai_enrichment.py` / `merkado_labs.enrichment.jobs`
- Pricing estimates: `merkado_labs.enrichment.pricing` /
  `apps/labs-dashboard/src/lib/enrichment/cost.ts` (mirrored line-for-line;
  prefer estimates over spend)
- AI tables: **service-role only**
- Review statuses: `unreviewed` / `approved_for_research` / `rejected` / `needs_changes`
- Approval never overwrites source facts
- Why prior batch used `gpt-4.1-mini`: hardcoded in `run_ai_enrichment_batch25.py` +
  former `DEFAULT_MODEL` / config default before env-only hardening
- After complete successful scrape: enqueue new/changed only via property pipeline;
  daily cron armed On (`AUTOMATIC_REFRESH_ENABLED = true`); GHA schedule begins
  on default branch only

#### Prompt / schema / policy v5 (current)

- Current combination: prompt `listing_enrichment_v5`, JSON schema
  `listing_enrichment_schema_v5`, application policy `enrichment_policy_v5`
  (English-default public presentation: `display_title` / `display_summary` /
  English overview + optional Dutch `display_description_nl` for About this
  property; scrapers keep raw source title/description; AI never
  overwrites protected facts; deterministic bilingual Dutch/English evidence;
  curated Blue Bay gated rule; operational UI label **Needs review** for
  current unresolved conflicts only; historical v3/v4 rows stay in advanced
  audit). Dashboard `POLICY_VERSION = enrichment_policy_v5`
  (`apps/labs-dashboard/src/lib/enrichment/versions.ts`). Public Browse/Passport
  expose English presentation (AI or deterministic fallbacks), SEO/JSON-LD in
  English, stable URLs `/browse/{uuid}`, and `image_urls` galleries.
- One-time English migration (`scripts/migrate_english_presentation.py`) was
  **applied** 2026-07-21 for **289** active Ready listings (~USD **7.83** under
  USD **15** / **320**-call caps). Dutch About-this-property backfill
  (`scripts/migrate_dutch_descriptions.py`) **applied** for **285** public
  listings (~USD **2.42**). Unchanged bilingual hashes skip at zero cost. See
  `labs/PROPERTY_DATA_QUALITY_REPORT.md` and `01-live-product-state.md`.
- Prior Labs activation (2026-07-20, v4.1): rematerialized on 346 retained v4
  proposals with **USD 0.00** OpenAI/Terra cost; field `needs_attention`
  151 → 53 (1.18%); listing review badges 124 → 50; second apply proved
  idempotent. Public view name is `public.public_property_listings` (migration
  filename `20260720140000_public_property_listings_effective.sql` replaced that
  view; there is no separate `*_effective` relation). Gallery / English /
  bilingual view migrations are in Labs and expose `image_urls` +
  `display_description_nl`. Ready-source galleries were already stored
  (~12.1k URLs); no lifecycle scrape or image binary copy was required.
- Quality pass (2026-07-21): prior policy **v4.2** zero-cost rematerialization
  completed to a fixed point (`transitions={}`, `changed=0`; openai_calls=0;
  decision bag 5611→3590 after synonym dedupe). Root-cause fix: immutable
  proposal inputs + canonical-key dedupe (never FD/audit backfill). Historical
  Phase-0 public eligibility snap was KW88/Moret71/REMAX118/Monumentenzorg2;
  post-validation snapshot (same day / tip `d2abb557`): public view **286**
  (KW **88** / Remax **125** / Moret **71** / Monumentenzorg **2**); EN/NL
  About-this-property on **283**. Image identity/dedup: RE/MAX fixture 82→42
  via `build_gallery`; Labs cleanup removed 5705 duplicate gallery slots;
  frontend mirror in `apps/labs-dashboard/src/lib/listing-gallery-urls.ts`;
  later one confirmed RE/MAX residual cleaned idempotently (`d2abb557`). See
  `docs/labs/PROPERTY_DATA_QUALITY_REPORT.md`.
- v5 preserves replay parsing for v3/v4 proposal JSON, marks echoed source/map
  values as `redundant` rather than rejected, auto-applies grounded
  neighbourhood gap-fills, and adds English public presentation fields.
- Labs public-effective view prefers retained v5 proposals (fallback v4 then v3)
  and exposes `display_title` / `display_summary` / English description +
  `image_urls` (never evidence/tokens/cost).
- Cross-source v4 canary (20 public) + public backfill (254; 253 succeeded)
  completed under the USD 25 hard ceiling (~USD 7.42 total exact). Production
  Merkado migration remains paused.
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
terrace, balcony, sea view, waterfront, solar panels, generator, water heater,
security, appliances, accessibility, pet suitability.

**Image identity / galleries:** adapters extract full galleries into
`property_listings.image_urls`; RE/MAX uses `build_gallery` with identity
dedup. Labs cleanup (2026-07-21) removed duplicate slots without scraping.

**Effective neighbourhood priority** (one final value; never generic Curaçao):

1. Specific valid source neighbourhood → provenance `From source`
2. Valid point-in-polygon map neighbourhood → `Matched from map`
3. High-confidence grounded AI candidate only when source/map cannot provide
   one → `Extracted from listing text`
4. Otherwise unavailable

Migration `20260720140000_public_property_listings_effective.sql` replaces the
view `public.public_property_listings` with this projection (owner security
definer; SELECT-only grants). Filename says “effective”; there is no separate
`public_property_listings_effective` relation. **Applied in Labs**; production
merkado.cw property projection remains paused / not part of automatic deploy.

### Security model (Labs read access)

- Anon/authenticated: **SELECT only** on `public_property_listings` (and neighbourhoods).
- No anon SELECT on `property_listings`, observations, activity events,
  AI tables, search/agent/match tables, or raw evidence. Public Passport
  activity is fetched server-side with the Labs service role, eligibility is
  checked against the public view, and only filtered labels/dates/price deltas
  are rendered.
- **Known Labs-only security debt:** orchestration progress tables
  `property_pipeline_runs`, `property_pipeline_source_stages`,
  `property_pipeline_items`, and `property_pipeline_events` retain historical
  anon/authenticated SELECT policies from the Data Operations migration. They
  contain operational bookkeeping, not raw HTML or service credentials, but
  should be made admin-only before any production handoff. This final cleanup
  does not broaden into a retrospective RLS redesign.
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

### Labs product surfaces

- `/browse` + Passport-style detail — **public preview** (eligible active only;
  separate from Prototypes nav)
- `/data-operations` — Labs-only pipeline enqueue/dispatch (admin + credentials)
- `/search-requests`, `/what-fits-me`, `/agent`, `/match-reports/[requestId]` —
  Labs prototypes; guided intake → draft → review/edit → explicit confirmation
  is demonstrable with the retained request/entitlement/15-report fixture
- Matcher: `merkado_labs.matching` (`rules_v1`) + `scripts/run_match_preview.py`
- No real email, billing, subscription, entitlement enforcement, paywall, or
  production merkado.cw connection. “Show three / pay to unlock more” is an
  open product decision and is not implemented.
- Nothing here is described as live on merkado.cw

### RE/MAX refresh (2026-07-17) and Terra prep (2026-07-20)

- Adapter `0.4.0`: full body description (was meta-only ~147 chars → avg ~1970)
- Complete Labs refresh run `a6a32434-36e5-46b1-8033-143917eb0aeb`: 220 updated, 220 evidence uploads
- Status backfill: 59 sold + 36 rented + 29 under_contract first-observed events
- Initial AI validation: 5 listings succeeded; unchanged rerun skipped (0 tokens)
- Adapter `0.4.1` (2026-07-20): parse `google.maps.LatLng` (199/220 on cache reparse), listing agent, filter agent headshots; Labs rows not updated (no import this task)
- Terra v3 five-listing canary executed 2026-07-20 (`gpt-5.6-terra` + v3): **5/5** after `hs2467` retry
- v0.4.1 activation + Terra initial backfill (2026-07-20): offline import applied — **199/220** coordinates; **193** inferred / **6** outside polygons / **21** still missing; effective neighbourhood changes **5** (generic source → map); five-listing semantic Terra refresh + remaining **211** Terra backfill completed (**220/220** coverage); catalog contract **220**; pipeline ready / cron On (default-branch schedule observed) / dispatch available; normal Refresh & enrich stays new/changed only

## 4. Geospatial principles

- Preserve source latitude/longitude as evidence.
- Store derived PostGIS geography separately.
- Never silently overwrite source-provided neighbourhood.
- Store inferred neighbourhood with method, status, confidence, and timestamp.
- Bounding boxes are guards only.
- Point-in-polygon assignment is authoritative when valid boundaries and coordinates exist.
- Track coordinate provenance per source.

### Map gaps vs neighbourhood-search gaps

Do not conflate:

| Gap | Meaning |
|---|---|
| **Map gap** | Missing coordinates (Labs snapshot: **28** listings) — no PIP assignment possible |
| **Neighbourhood-search gap** | Filter/search coverage where source neighbourhood text can still contribute |

PIP is authoritative when valid coordinates and boundaries exist. Source
neighbourhood remains a fallback for filter/search when map assignment is
unavailable. Display aliases do not merge assets.

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

### Canonical neighbourhood display aliases

After effective resolution, **display-only** canonicalization collapses safe
duplicate labels without merging property assets:

- Blue Bay resort / marketing variants → **Blue Bay**
- Reviewed `… Curaçao` / `… Curacao` island suffixes → base neighbourhood
- **St. Joris** → **Sint Joris**
- **Salina** / **Salinja** / **Saliña** → **Saliña** (not Salinja Abou / Saliña Ariba)
- **Marie Pompoen** / dual-label source forms → **Marie Pampoen**
- Ambiguous multi-place or uncertain forms stay **separate** (no invented merge)

Source evidence (`source_neighbourhood_text`, map assignment names) stays raw.
Filter options and filter matching use the canonical display key so each
neighbourhood appears once and selecting it returns every mapped variant.

Python: `src/merkado_labs/enrichment/neighbourhood_canonical.py`  
Dashboard: `apps/labs-dashboard/src/lib/domain/neighbourhood-aliases.ts`  
Keep the alias tables in sync.

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

Operational areas, Data Operations, Explore/public preview, plus prototypes:

- Overview
- Listings (including map view and listing detail)
- Sources (including source runs and source detail)
- Enrichment (review-only; execution disabled)
- Quality (eligibility, lifecycle, missing fields, evidence, geography)
- Data Operations (Labs pipeline enqueue/dispatch)
- Settings (Automatic refresh **On**; daily default-branch cron observed)
- Browse — public preview under Explore (not nested only under Prototypes)
- Prototypes (Search Request / What Fits Me / Agent / Match Reports)

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
- safe map filtering by source and lifecycle state;
- Data Operations dispatch status (cron On; default-branch schedule observed).

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
