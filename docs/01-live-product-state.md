# 01 — Merkado Live Product State

**Purpose:** ground truth about what exists on merkado.cw today. Anything not marked `[LIVE]` here is not built. Do not describe the product as more than this in any deck, application, or demo.

**Tag legend:** `[LIVE]` built today · `[PLANNED]` future idea in v1 docs, not built · `[RISK]` concern.

---

## 1. What Merkado is today

A vehicle marketplace aggregator for Curaçao. It solves that there is no single place to search used cars on the island (they are scattered across dealer sites, classifieds, and dozens of Facebook groups with no filters).

**Current user flow `[LIVE]`:** browse/search listings on merkado.cw, then contact the seller directly on WhatsApp. The deal happens offline.

**No on-platform transactions `[LIVE reality]`:** no payments, no checkout, no escrow, no title transfer, no logistics service. This matters because the application implies otherwise.

**Listing types `[LIVE]`:**
- Scraped listings (auto-imported from external car sites)
- Manual listings (users posting their own car)

## 2. Market context (Curaçao vehicles)

- Car-dependent island, ~156,000 people (2023 Census).
- Used cars dominate (new cars carry ~36% effective import tax).
- Popular brands: Toyota (Hilux, RAV4, Corolla), Hyundai, Kia, Chevrolet, Suzuki, Honda, US pickups, Jeeps.
- Currency: Caribbean Guilder (XCG, "Cg"), replaced ANG/NAf in 2025. Pegged 1 USD = 1.79 XCG. Display Cg primary, USD in parentheses.
- Facebook is the main private-sale channel (~107,000 island users), scattered across unsearchable groups. That fragmentation is the gap Merkado fills.
- Proven comparable: CaribbeanHouseHunt.com runs this exact aggregator model for real estate on Curaçao (45+ realtor sites, one map, 1,500+ listings). Validates the playbook and is the closest PropTech competitor.

## 3. Tech stack (actual, in production)

| Layer | Technology | Notes |
|---|---|---|
| Frontend + SSR | Next.js (App Router) on Vercel | Server-rendered for SEO |
| Database | Supabase (Postgres) | Auth, storage, RLS |
| Scraping + automation | n8n (cloud) | One workflow per source |
| AI enrichment | GPT-5-mini via OpenAI node in n8n | Single pass, batches of 5 |
| Image storage | Supabase Storage | Manual uploads only; scraped images kept as external URLs |
| Search | Postgres full-text search | Fine for current volume |
| Analytics | Plausible | Privacy-friendly |

**Frontend status `[LIVE]`:** built and audited (8.5/10 production readiness, security hardening applied: rate limiting, CSRF, ownership checks, input validation).

**NOT in the live stack:** LangGraph, CrewAI, Python ingestion pipeline, vector database (pgvector/Pinecone), any blockchain. These appear in Luuk's application but are not part of v1.

**Payments `[PLANNED]`:** none integrated. Viable Curaçao options for later: Sentoo (local bank A2A, ~1% capped) and CX Pay (cards). Stripe does not operate in Curaçao.

## 4. Data pipeline (actual n8n setup)

| Job | Schedule | Status |
|---|---|---|
| Scrape CuraCars, SeriDomi, AutosOpCuracao, Autobedrijf Willemstad | Daily 1:00 AM UTC | `[LIVE]` |
| Scrape Economic Auto Center | Hourly (rate-limited, 4s delay) | `[LIVE]` |
| AI Enrichment (normalize + fill fields + validate) | Daily 2:00 AM UTC, GPT-5-mini | `[LIVE]` |
| Freshness Check (expire stale listings) | Daily 2:30 AM UTC | Built, inactive |
| Tier 2 sources (BookingCarsCuracao, CAOCARS) | TBD | Not built |

**Dedup today `[LIVE reality]`:** each scraper does same-source dedup. A `fingerprint` hash (make + model + year + key fields) and image perceptual hashes (`phash`) are generated and stored, but cross-source dedup is NOT actively queried. So the same car on two sites can appear twice. Known limitation.

**Live inventory:** ~150-200 aggregated listings across 5 sources, plus 20-30 manually seeded.

**Reframe worth remembering:** this pipeline (n8n scrape → GPT-5-mini structure + validate → Supabase, with fingerprint/phash) is effectively a simplified "Passport" already running for cars. Strongest honest proof point for the v2 pitch.

## 5. Confirmed data sources (cars)

Tier 1 (built, running): CuraCars (~49-60), SeriDomi (~15-25), Autobedrijf Willemstad (36), AutosOpCuracao (26), Economic.cw (large).
Tier 2 (not built): BookingCarsCuracao (~13), CAOCARS (JS-heavy, needs check).
Facebook groups: very active but DO NOT scrape; manual seed only.
Confirmed scam (excluded): CuracaoCars.com / CarroCarros network.

## 6. Database schema (Supabase, actual `[LIVE]`)

Core rule: manual listings belong to users, scraped listings belong to sources.

- `listings` — one row per car. listing_origin ('manual'/'scraped'), seller_id, source_id, make, model, year, price, currency, mileage, transmission, fuel_type, body_type, condition, slug (unique), status ('active'/'sold'/'expired'/'removed'), fingerprint, last_seen_at, source_url. Only status='active' is public.
- `listing_images` — many per listing. storage_path (manual) or external_url (scraped), is_primary, phash. At least one URL required. Unique (listing_id, external_url).
- `listing_details` — 1:1 specs (trim, drive_type, colors, engine_size, seats, validated_at). validated_at marks AI-processed rows.
- `listing_features` — feature tags by category.
- `listing_favorites` — favorites with count triggers.
- `listing_reports` — moderation reports.
- `sources`, `listing_sources` — source tracking + many-to-many.
- `users` — WhatsApp number, seller type, auth provider.
- `saved_searches` — alert criteria.
- `contact_events` — WhatsApp/phone/source-link click analytics.

Enforced value formats: body_type (Hatchback, Sedan, SUV & Crossover, Pickup & Truck, Van & MPV, Convertible); fuel_type (gasoline/diesel/hybrid/electric); transmission (automatic/manual); condition (like_new/good/okay/needs_repair); drive_type (FWD/RWD/AWD/4WD).

## 7. Monetization (actual v1 model)

Listing-based, not transaction-based. Perk tiers (Boost, Premium) with ~23 perks: featured placement, extended expiry, verified badge, etc. `[PLANNED/partial]`

**Note:** the "verified / structural check" perk is "needs build" in the monetization doc. Inspections, escrow, and title transfer are NOT delivered services today.

## 8. What is explicitly NOT built (v1)

- On-platform payments / checkout / escrow (any asset)
- Inspection / structural check as a delivered service
- Title transfer or logistics service
- Rentals (cars or property)
- Any real estate functionality
- Any blockchain / tokenization / wallet
- Vector DB / entity resolution beyond hash matching
- Cross-source dedup (generated but not queried)
