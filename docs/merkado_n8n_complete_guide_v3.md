# Merkado V1 — n8n Scraping & Supabase Complete Guide

**Version:** V3 (updated to match actual deployed workflows)
**Purpose:** This is the single, complete reference for building and running all n8n workflows for Merkado. It covers what to build, how data flows into Supabase, all rules and constraints, and step-by-step implementation details. Written so an AI agent can follow it end-to-end.

**Project:** Merkado V1 — Car marketplace aggregator for Curaçao.
**Stack:** Supabase (Postgres + Auth + Storage) + n8n (scraping & automation)

**Current state:**
- Supabase database is fully configured (tables, RLS, triggers all in place)
- n8n cloud is connected to Supabase with working credentials (service role)
- The `sources` table is already populated with all target websites
- robots.txt has been verified — all sources allow scraping
- All 5 scrapers are built and active
- AI Enrichment workflow is built and active
- Freshness Check workflow is built (inactive, ready to enable)

**Related project docs:**
- `Merkado_Supabase_Architecture_V1.md` — full database schema, RLS rules, storage
- `SUPABASE.md` — Supabase development rules and table details

---

# 1. Architecture Overview

Merkado has two types of listings:

1. **Manual listings** — created by real users on the platform
2. **Scraped listings** — imported from external car websites

The system has 3 independent jobs that all read/write to the same Supabase database:

```
JOB 1: SCRAPING — One workflow per source website (5 total)
Each runs on its own daily timer (at 1:00 AM UTC, except Economic which runs hourly).
Each scrapes one website and writes cars into Supabase.
They run independently and don't know about each other.

JOB 2: AI ENRICHMENT — One workflow (runs daily at 2:00 AM UTC)
Single unified pass that does both normalization and enrichment:
  - Normalizes make/model spelling, title formatting, trim cleanup
  - Fills missing fields (body_type, fuel_type, transmission, etc.)
  - Works on ALL unvalidated active listings (scraped + manual)
  - Sets validated_at when complete
Uses GPT-5-mini via OpenAI node. Processes in batches of 5.

JOB 3: FRESHNESS CHECK — One workflow (runs daily at 2:30 AM UTC)
Checks last_seen_at on scraped listings.
Marks listings not seen in 2+ days as 'expired'.
Has a safety cap of 40 expirations per run.
```

Visual:

```
┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
│ CuraCars   │ │ SeriDomi   │ │ AutosOp    │ │ Autobedrijf│ │ Economic   │
│ scraper    │ │ scraper    │ │ scraper    │ │ scraper    │ │ scraper    │
│ (daily 1AM)│ │ (daily 1AM)│ │ (daily 1AM)│ │ (daily 1AM)│ │ (hourly)   │
└─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └─────┬──────┘
      │              │              │              │              │
      │   Each writes independently to Supabase   │              │
      ▼              ▼              ▼              ▼              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         SUPABASE DATABASE                               │
│                                                                         │
│  listings  ◄──── listing_sources ────► sources                          │
│     │                                                                    │
│     ├── listing_images                                                   │
│     ├── listing_details (trim, engine_size, colors, seats, drive_type)   │
│     └── listing_features (AC, power windows, etc.)                       │
└──────────────────────────▲──────────────────────▲───────────────────────┘
                           │                      │
                    ┌──────┴───────┐       ┌──────┴───────┐
                    │ AI Enrichment│       │ Freshness    │
                    │ (daily 2AM)  │       │ Check (2:30) │
                    └──────────────┘       └──────────────┘
```

---

# 2. Supabase Tables — What n8n Can and Cannot Touch

## Tables n8n writes to:

| Table | What n8n writes | When |
|-------|----------------|------|
| `listings` | New car records + updates to existing + `last_seen_at` | Every scrape cycle + AI enrichment |
| `listing_sources` | Source URL, external_id, last_seen_at, raw_payload | Every scrape cycle |
| `listing_images` | ALL available image external_urls (multiple per listing) | When new listing inserted |
| `listing_details` | Trim, engine_size, drive_type, colors, seats, interior_color, validated_at | Scrape cycle + AI enrichment |
| `listing_features` | Feature tags like AC, power windows (when available) | Scrape cycle (best effort) |

**Note:** The scrapers do NOT update `sources.last_scraped_at` in the current implementation.

## Tables n8n NEVER writes to:

| Table | Why not |
|-------|---------| 
| `profiles` | Real users only — not for scraped data |
| `public_profiles` | It's a database view, cannot be written to |
| `listing_favorites` | User action only |
| `contact_events` | Frontend analytics only |
| `listing_reports` | User/moderation only |
| `sources` | Pre-populated, not updated by scrapers |

---

# 3. Merkado UI Categories (The Target)

All scraped data must map to these exact categories. Anything from a source website that doesn't match must be normalized to fit one of these. If it can't be mapped confidently, leave the field NULL.

### body_type (stored in `listings.body_type`)

The AI Enrichment workflow uses **UI label format** for body_type values. These are the values written directly to the database:

| UI Label | Database value |
|----------|---------------|
| Hatchback | `Hatchback` |
| Sedan | `Sedan` |
| SUV & Crossover | `SUV & Crossover` |
| Pickup & Truck | `Pickup & Truck` |
| Van & MPV | `Van & MPV` |
| Convertible | `Convertible` |

**Important:** Scrapers may write snake_case values (`suv_crossover`, `sedan`, etc.) while the AI Enrichment writes UI labels (`SUV & Crossover`, `Sedan`, etc.). The frontend must handle both formats, or a migration should normalize all values to one format.

### fuel_type (stored in `listings.fuel_type`)
| UI Label | Database value |
|----------|---------------|
| Gasoline | `gasoline` |
| Diesel | `diesel` |
| Hybrid | `hybrid` |
| Electric | `electric` |

### condition (stored in `listings.condition`)
| UI Label | Database value |
|----------|---------------|
| Like new | `like_new` |
| Good | `good` |
| Okay | `okay` |
| Needs repair | `needs_repair` |

### transmission (stored in `listings.transmission`)
| UI Label | Database value |
|----------|---------------|
| Automatic | `automatic` |
| Manual | `manual` |

### drive_type (stored in `listing_details.drive_type`)

The AI Enrichment uses uppercase values with 4WD as a separate option:

| Value | Notes |
|-------|-------|
| `FWD` | Front wheel drive |
| `RWD` | Rear wheel drive |
| `AWD` | All wheel drive |
| `4WD` | Four wheel drive (used by AI Enrichment) |

---

# 4. Realistic Data Expectations from Curaçao Sources

**Important context:** These are small Curaçao dealer and classifieds websites. Data quality varies wildly. Some have detailed specs, others barely have a price and a photo. The scraper must handle this gracefully — extract what's available, leave the rest NULL, and let AI Enrichment fill gaps later.

### What each source typically has:

| Field | CuraCars | SeriDomi | AutosOpCuracao | Autobedrijf Willemstad | Economic.cw |
|-------|----------|----------|----------------|------------------------|-------------|
| Make | ✅ | ✅ | ✅ | ✅ | ✅ |
| Model | ✅ | ✅ | ✅ | ✅ | ✅ |
| Year | Usually | ✅ | Usually | ✅ | Usually |
| Price | Usually | ✅ | Usually | ✅ | Usually |
| Mileage | Sometimes | ✅ | Sometimes | ✅ | Sometimes |
| Transmission | Sometimes | Sometimes | Sometimes | ✅ | Sometimes |
| Fuel type | Rarely | Sometimes | Sometimes | ✅ | Rarely |
| Body type | Rarely | Rarely | Rarely | Sometimes | Rarely |
| Condition | Rarely | Rarely | Rarely | Rarely | Rarely |
| Images | ✅ (multiple) | ✅ (multiple) | ✅ (multiple) | ✅ (multiple) | ✅ (multiple) |
| Description | Sometimes | Usually | Usually | ✅ | Sometimes |
| Trim | Rarely | Rarely | Rarely | ✅ (often detailed) | Rarely |
| Engine size | Rarely | Rarely | Rarely | Sometimes | Rarely |
| Drive type | Rarely | Rarely | Rarely | Sometimes | Rarely |
| Color | Sometimes | Sometimes | Sometimes | ✅ | Sometimes |
| Seats | Rarely | Rarely | Rarely | Sometimes | Rarely |
| Features (AC, etc.) | Rarely | Rarely | Rarely | Sometimes | Rarely |

**Key takeaways:**
- Autobedrijf Willemstad (Carteam CMS) is by far the richest data source — it often has trim, engine specs, and features
- Most other sources give you make, model, maybe year, maybe price, and photos — that's it
- Year and price are critical but NOT guaranteed on every source. If missing, still import the listing (with those fields as NULL) as long as make and model exist
- Description should be scraped as-is from the source (the seller's own text). If the source has no description, leave it NULL — do not generate one

---

# 5. listings Table — Field Rules for Scraped Data

### Fields that MUST be set:
- `listing_origin` = `'scraped'` (always)
- `source_id` = UUID from the `sources` table
- `status` = `'active'`
- `seller_id` = `NULL` (always NULL for scraped)
- `slug` — auto-generated, unique, URL-friendly
- `fingerprint` — generated hash for cross-source dedup
- `last_seen_at` — set to now() on insert and updated on each re-scrape

### Fields the scraper should always TRY to extract:
- `make` — car make (e.g., "Toyota"). **Required — skip the listing entirely if not found.**
- `model` — car model (e.g., "RAV4"). **Required — skip the listing entirely if not found.**
- `year` — 4-digit year. Extract if available. NULL if not found on the source.
- `price` — in XCG. Extract if available. NULL if not found. **Do not guess or fabricate.**
- `title` — auto-generate as "{year} {make} {model}" (or "{make} {model}" if year is missing)

### Fields to extract when available (NULL if not found):
- `mileage` — in km
- `transmission` — must map to `automatic` or `manual`
- `fuel_type` — must map to `gasoline`, `diesel`, `hybrid`, or `electric`
- `body_type` — must map to one of the body_type values (see Section 3)
- `condition` — must map to `like_new`, `good`, `okay`, or `needs_repair`
- `description` — the seller's own text from the source, as-is. NULL if the source has no description.

### Minimum to import a listing:
A scraped listing needs at least `make` + `model` to be imported. Everything else can be NULL. A listing with just "Toyota RAV4" and photos but no year or price is still worth importing — the AI enrichment and the photos make it useful to buyers.

---

# 6. listing_details Table — Extra Specs

This is a 1-to-1 table with `listings` (PK is `listing_id`). These fields are less common on Curaçao websites but should be extracted when available — especially from Autobedrijf Willemstad which often has rich data.

| Field | What it is | Example | Scrape? |
|-------|-----------|---------|---------| 
| `trim` | Model variant / package | "55 TFSI Quattro Proline SE", "Sport", "Limited" | Yes — extract if visible on source |
| `engine_size` | Engine displacement | "2.0L", "1.5T", "3.0 V6" | Yes — extract if available |
| `drive_type` | Drivetrain | "FWD", "RWD", "AWD", "4WD" | Yes — extract if available |
| `exterior_color` | Outside color | "White", "Zwart" (Dutch for black) | Yes — extract if available |
| `interior_color` | Inside color | "Black leather", "Grijs" | Yes — extract if available |
| `seats` | Number of seats | 5, 7 | Yes — extract if available |
| `vin` | Vehicle ID number | Rarely available | Extract if visible, don't search for it |
| `seller_notes` | Extra seller info | Free text | NULL for scraped — this is for manual listings |
| `validated_at` | AI validation timestamp | timestamptz | Set by AI Enrichment workflow only |

**Rule:** Only create a `listing_details` row if at least one of these fields has a value. Don't insert an empty row.

**Normalization for drive_type:**
- "Voorwielaandrijving" / "Front wheel" / "FWD" / "2WD" (if car) → `FWD`
- "Achterwielaandrijving" / "Rear wheel" / "RWD" → `RWD`
- "Vierwielaandrijving" / "All wheel" / "AWD" → `AWD`
- "4WD" / "4x4" / "Quattro" → `4WD`

---

# 7. listing_features Table — Feature Tags

Feature tags are grouped by category. These are multi-selectable checkboxes in the UI (e.g., "Air conditioning: yes").

| Category | Example features |
|----------|-----------------|
| `climate` | Air conditioning, Climate control, Heated seats, Heated steering wheel |
| `island_essentials` | Tinted windows, Roof rack, Bed liner (pickup), Tow hitch |
| `safety` | ABS, Airbags, Backup camera, Parking sensors, Lane assist |
| `comfort` | Power windows, Power mirrors, Keyless entry, Cruise control, Leather seats, Sunroof |
| `entertainment` | Bluetooth, Apple CarPlay, Android Auto, Navigation, USB ports |

**Scraping approach:** Most Curaçao sources don't list features in a structured way. However, Autobedrijf Willemstad sometimes has a feature/options list. If a source has structured feature data, extract it. If features are only mentioned buried in description text, **don't try to parse them** during scraping — let AI Enrichment handle that later if needed.

**Rule:** Each row is unique per `(listing_id, category, feature)`. Only insert features you can confidently extract. Don't guess.

---

# 8. listing_images — Multiple Images Per Listing

For scraped listings, extract **ALL available images** — not just one thumbnail.

- **DO NOT** upload images to Supabase Storage
- **DO NOT** use `storage_path`
- Use `external_url` only (the direct image URL from the source website)

For each image, insert a row into `listing_images`:
- `listing_id` — the listing this image belongs to
- `external_url` — the direct image URL from the source
- `storage_path` = NULL (always for scraped)
- `is_primary` = true for the first image only, false for all others
- `sort_order` = 1, 2, 3... (in the order they appear on the source)

**Constraint:** At least one of `storage_path` OR `external_url` must exist per row.

**Manual listings** use `storage_path` (uploaded to Supabase bucket `listing-images`). Scraped listings never use this.

**Frontend rendering rule:** If `storage_path` exists → build Supabase public URL. Else if `external_url` exists → use external_url directly.

---

# 9. sources Table

Represents the websites/companies being scraped. Already populated in Supabase.

Fields:
- `id` (uuid, primary key)
- `name` — display name
- `base_url` — website URL
- `seller_type` (`'dealer'` or `'private'`)
- `logo_url` — custom logo image URL
- `is_active` — whether this source is currently being scraped
- `scrape_priority` — 1 (Tier 1) or 2 (Tier 2)
- `last_scraped_at` — timestamp of last completed scrape
- `created_at`

**n8n rules:**
- Use the existing `source_id` UUID when scraping — do NOT create new source rows
- Only insert a new source if intentionally adding a new website to the pipeline
- The current scrapers do NOT update `sources.last_scraped_at` — this is tracked instead via `listings.last_seen_at` and `listing_sources.last_seen_at` per listing

---

# 10. listing_sources — Deduplication Core

This is the most important table for scraping. It maps internal listings to their external sources.

Fields:
- `id` (uuid)
- `listing_id` — FK to listings
- `source_id` — FK to sources
- `source_url` — the original listing URL on the source website
- `external_id` — unique identifier for this car on the source (URL slug, page parameter, etc.)
- `raw_payload` (jsonb, optional) — the full scraped data for debugging
- `last_seen_at` — last time this listing was confirmed to exist on the source
- `created_at`

**Unique index:** `(source_id, external_id)` WHERE `external_id IS NOT NULL`

This table enables same-source deduplication.

---

# 11. Deduplication System

Every scraper performs **same-source dedup** before inserting. There is also a fingerprint generated for potential cross-source dedup.

## Same-Source Dedup (Active)

Checks if this exact car has already been scraped from this same source.

Each scraper uses an HTTP Request node (node 11) to query the Supabase REST API:

```
GET listing_sources?source_id=eq.{this_source_id}&external_id=eq.{this_car_external_id}&select=listing_id
```

- **Found** → this car already exists from this source → UPDATE the existing listing (price, mileage, last_seen_at) and update `listing_sources.last_seen_at`
- **Not found** → this car is new → proceed to insert

## Fingerprint Generation (Stored, not actively queried)

A fingerprint is generated and stored on each listing for potential future cross-source dedup.

```
Input:
  make     = lowercase, trimmed (e.g., "toyota")
  model    = lowercase, trimmed (e.g., "rav4")
  year     = integer (e.g., 2021) — use 0 if unknown
  price    = rounded to nearest 5% bucket — use 0 if unknown
  mileage  = rounded to nearest 500 km — use 0 if unknown

Fingerprint = MD5 or SHA256 of:
  "{make}|{model}|{year}|{price_bucket}|{mileage_bucket}"

Example:
  "toyota|rav4|2021|35000|42000" → hash → "a3f8c2..."
```

Price bucket: `Math.round(price / (price * 0.05)) * (price * 0.05)` — rounds to nearest 5% of the price value.

Mileage bucket: `Math.round(mileage / 500) * 500`

**Note:** In the current implementation, fingerprints are generated and stored but cross-source dedup queries (checking if a fingerprint already exists from a different source) are not performed by the scrapers. This means if the same car appears on two different source websites, it may be imported as two separate listings. The fingerprint is available for future enhancement or manual dedup.

---

# 12. Update Strategy for Scraped Listings

On every scrape cycle:

**If listing already exists from this source (same-source dedup match):**
- Update `listings.price`, `listings.mileage` (with current values from source)
- Update `listings.last_seen_at` = now()
- Update `listing_sources.last_seen_at` = now()

**If listing is new:**
- Full insert into `listings`, `listing_sources`, `listing_images`, and optionally `listing_details`

**Expired listings:**
- Handled by the Freshness Check workflow (see Section 21)
- Listings not seen in 2+ days get status set to `expired`

---

# 13. Frontend Display Rule

Even though a listing may have multiple sources linked via `listing_sources`, the frontend only shows ONE source — the most recently seen one.

```sql
SELECT source_id, source_url
FROM listing_sources
WHERE listing_id = '{listing_id}'
ORDER BY last_seen_at DESC
LIMIT 1
```

One listing, one source badge, one source link in the UI.

---

# 14. Source Reference (Already in Supabase)

These sources already exist in the `sources` table. Use the existing `id` values.

| Source Name              | Website                                         | seller_type | Tech Notes                                                              |
|--------------------------|------------------------------------------------|-------------|-------------------------------------------------------------------------|
| CuraCars                 | curacars.com                                    | private     | Classic ASP, simple HTML, paginated (5 pages), HTTP only (no HTTPS)     |
| SeriDomi                 | seridomi.com                                    | dealer      | WordPress + Motors theme, HTTPS, paginated                              |
| Auto's Op Curaçao        | autosopcuracao.com                              | private     | WordPress, HTTPS                                                        |
| Autobedrijf Willemstad   | autobedrijfwillemstad.com/occasions             | dealer      | Carteam CMS (Dutch automotive platform), detail pages with rich data    |
| Economic Auto Center     | economic.cw                                     | dealer      | Paginated, largest used car inventory on island, uses rate-limited loop |

---

# 15. Complete Workflow List

| #  | Workflow Name                         | Trigger        | Status | Purpose                                |
|----|---------------------------------------|---------------|--------|----------------------------------------|
| 1  | `Scraper: CuraCars v1.0`            | Daily 1:00 AM  | Active | Scrape curacars.com → Supabase         |
| 2  | `Scraper: SeriDomi v1.0`            | Daily 1:00 AM  | Active | Scrape seridomi.com → Supabase         |
| 3  | `Scraper: AutosOpCuracao v1.0`      | Daily 1:00 AM  | Active | Scrape autosopcuracao.com → Supabase   |
| 4  | `Scraper: Autobedrijf Willemstad v1.0` | Daily 1:00 AM | Active | Scrape autobedrijfwillemstad.com → Supabase |
| 5  | `Scraper: Economic Auto Center v1.0` | Hourly        | Active | Scrape economic.cw → Supabase          |
| 6  | `AI: Listing Enrichment`             | Daily 2:00 AM  | Active | Normalize + enrich + validate ALL listings |
| 7  | `Listings: Freshness Check`          | Daily 2:30 AM  | Inactive | Expire stale scraped listings          |

---

# 16. Scraper Workflow Structure

Every scraper workflow follows a consistent architecture with these stages:

```
┌──────────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐   ┌──────────┐
│ Schedule  │──▶│ Fetch     │──▶│ Extract   │──▶│ Filter    │──▶│ Prepare  │
│ Trigger   │   │ Inventory │   │ Links     │   │ Car Links │   │ Detail   │
│           │   │ Page(s)   │   │ (HTML)    │   │ (Code)    │   │ URL      │
└──────────┘   └───────────┘   └───────────┘   └───────────┘   └──────┬───┘
                                                                       │
    ┌──────────────────────────────────────────────────────────────────┘
    │
    ▼
┌───────────┐   ┌───────────┐   ┌──────────┐   ┌───────────┐   ┌──────────┐
│ Fetch     │──▶│ Extract   │──▶│Normalize │──▶│ Prep      │──▶│ Dedup A  │
│ Detail    │   │ Car Data  │   │ Data     │   │Fingerprint│   │ Same-Src │
│ Page      │   │ (Code)    │   │ (Code)   │   │ + Slug    │   │ (HTTP)   │
└───────────┘   └───────────┘   └──────────┘   └───────────┘   └──────┬───┘
                                                                       │
    ┌──────────────────────────────────────────────────────────────────┘
    │
    ▼
┌───────────┐   ┌───────────┐          ┌─────────────────────────────────────┐
│ Merge +   │──▶│ IF Exists │── YES ──▶│ Update last_seen_at on listings    │
│ Extract   │   │ (Same     │          │ + listing_sources                   │
│ Dedup     │   │  Source?) │          └─────────────────────────────────────┘
│ Result    │   │           │
└───────────┘   │           │── NO ───▶┌─────────────────────────────────────┐
                └───────────┘          │ Insert listing → Insert sources     │
                                       │ → Insert images → Upsert details    │
                                       └─────────────────────────────────────┘
```

### Key nodes in detail:

**Pagination (CuraCars, SeriDomi, Economic):**
Some scrapers have pagination nodes (03b, 04b, 05) that extract page links, build URLs, and fetch additional pages. All listing URLs are collected before proceeding to detail fetching.

**Merge nodes:**
The workflow uses merge nodes at several points to carry forward the external_id and source URL alongside the extracted car data. This is critical for dedup and for inserting `listing_sources`.

**Dedup (Node 11):**
Uses an HTTP Request node to query the Supabase REST API directly (not the Supabase node) to check `listing_sources` for existing records.

**Insert path (Nodes 15–18):**
1. `15 – Insert Listing` → inserts into `listings` table
2. `15a – Rename Inserted ID` → extracts the returned listing ID
3. `15b – Merge Car + Inserted Listing` → combines car data with new listing ID
4. `16 – Insert listing_sources` → links listing to source
5. `16b – Build listing_images rows` → prepares image array
6. `16c – Insert listing_images` → inserts all images
7. `17 – Update Listing Details` / `18 – Upsert Listing Details` → inserts extra specs if available

**Update path (Nodes 14b–14c):**
1. `14b – Update last_seen_at` → updates `listings.last_seen_at`, price, mileage
2. `14c – Update listing_sources last_seen_at` → updates `listing_sources.last_seen_at`

**Economic Auto Center special handling:**
The Economic scraper includes a `Loop Over Items` (SplitInBatches) node and a `Wait` node (4 second delay) to handle rate limiting on economic.cw.

---

# 17. Parsing Make / Model / Trim from Combined Title Strings

Many Curaçao car websites don't have separate fields for make, model, year, and trim. Instead they combine everything into a single title string like:

```
"Hyundai Tucson 2021"
"Ford F-150 XLT 2019"
"Audi Q8 55 TFSI Quattro Proline SE 2023"
"Toyota Land Cruiser 2020"
"Suzuki Swift 1.2 Select 2018"
```

The scraper must split these into separate fields. This is one of the hardest extraction challenges because model names can be one word ("Tucson"), hyphenated ("CR-V", "F-150"), two words ("Land Cruiser", "Grand Cherokee"), or include sub-variants.

### Parsing Strategy: Known Makes + Model Lookup

**Step 1: Extract the year (easiest)**
- Find a 4-digit number between 1970 and the current year
- Remove it from the string
- `"Hyundai Tucson 2021"` → year=2021, remaining=`"Hyundai Tucson"`

**Step 2: Match the make against a known list**
- Check the start of the remaining string against a list of known car makes
- The makes list should cover all brands common in Curaçao (see below)
- `"Hyundai Tucson"` → make="Hyundai", remaining=`"Tucson"`

**Step 3: Match the model against known models for that make**
- Use a make→models lookup to find the longest matching model name
- Longest match is important: for "Land Cruiser Prado", you want "Land Cruiser" not just "Land"
- `"Tucson"` → model="Tucson", remaining=`""`

**Step 4: Whatever is left is likely the trim**
- `"Audi Q8 55 TFSI Quattro Proline SE 2023"` → trim="55 TFSI Quattro Proline SE"
- `"Suzuki Swift 1.2 Select 2018"` → trim="1.2 Select"
- Store in `listing_details.trim`
- If nothing is left, trim stays NULL

### Known Makes List (Common in Curaçao)

```
Toyota, Hyundai, Kia, Chevrolet, Suzuki, Honda, Ford, Nissan, Jeep,
Volkswagen (VW), BMW, Mercedes-Benz (Mercedes), Audi, Mazda, Mitsubishi,
Isuzu, Dodge, Subaru, Peugeot, Renault, Mini, Fiat, Porsche, Lexus,
Land Rover, Daihatsu, Chery, BYD, Great Wall, Haval, MG, Maxus,
Geely, GAC, Leapmotor, Bestune, Changan, Haima, SEAT, Moke
```

**Handle aliases:**
- "VW" → "Volkswagen"
- "Mercedes" or "MB" → "Mercedes-Benz"
- "Land Rover" or "LandRover" → "Land Rover" (two-word make)
- "Mini Cooper" → make="Mini", model="Cooper"

### Known Multi-Word Models (Must Match as a Unit)

These model names are two or more words and must not be split:

```
Toyota: Land Cruiser, Land Cruiser Prado, C-HR, Hilux Surf
Honda: CR-V, HR-V, BR-V, CR-Z
Ford: F-150, F-250, F-350, Grand C-Max
Jeep: Grand Cherokee, Wrangler Unlimited
Chevrolet: Captiva Sport, Equinox LT
Hyundai: Santa Fe, Grand i10
Kia: Rio X-Line, Grand Carnival
Land Rover: Range Rover, Range Rover Sport, Range Rover Evoque, Discovery Sport
Mercedes-Benz: GLE Coupe, CLA Shooting Brake, A-Class, B-Class, C-Class, E-Class, S-Class, GLA, GLB, GLC, GLE, GLS
Volkswagen: Golf Plus, ID.3, ID.4, ID.5
```

### Edge Cases

| Raw title | Parsed make | Parsed model | Parsed year | Parsed trim |
|-----------|------------|-------------|-------------|-------------|
| "Hyundai Tucson 2021" | Hyundai | Tucson | 2021 | NULL |
| "Ford F-150 XLT 2019" | Ford | F-150 | 2019 | XLT |
| "Audi Q8 55 TFSI Quattro Proline SE 2023" | Audi | Q8 | 2023 | 55 TFSI Quattro Proline SE |
| "Toyota Land Cruiser 2020" | Toyota | Land Cruiser | 2020 | NULL |
| "Suzuki Swift 1.2 Select 2018" | Suzuki | Swift | 2018 | 1.2 Select |
| "VW Golf" | Volkswagen | Golf | NULL | NULL |
| "Mercedes C300 2022" | Mercedes-Benz | C-Class | 2022 | C300 (or model=C300, trim=NULL) |
| "Jeep Wrangler Unlimited Rubicon 2021" | Jeep | Wrangler | 2021 | Unlimited Rubicon |

### Fallback: What If Parsing Fails?

If the title can't be parsed confidently:
1. Try to at least get the make (first word is usually the make)
2. Put everything after the make (minus the year) into the model field
3. Log it for manual review
4. **Never skip a listing just because the title is messy** — import it with best-effort parsing

---

# 18. Normalization Rules (Apply During Extraction)

Every scraper must normalize data before writing to Supabase. Source websites use a mix of Dutch, English, Papiamentu, and inconsistent formatting. Everything must map to Merkado's exact categories.

### Currency
- "NAf", "NAfl", "ANG" → convert to XCG at 1:1 (same USD peg)
- "USD", "$" → store price in XCG (multiply by 1.79)
- "XCG", "Cg" → store as-is
- Remove dots used as thousands separators (Dutch format): "24.000" → 24000
- Watch for CuraCars quirk: "Nafl. 44.9" likely means 44,900
- If price format is ambiguous and cannot be confidently parsed → set to NULL

### Transmission → must map to Merkado values
| Source text (any language) | Merkado value |
|---------------------------|-------------|
| "Automaat", "Automatic", "Auto", "Aut." | `automatic` |
| "Handgeschakeld", "Manual", "Schakelen", "Hand" | `manual` |
| Anything else / unclear | NULL |

### Fuel Type → must map to Merkado values
| Source text (any language) | Merkado value |
|---------------------------|-------------|
| "Benzine", "Gasoline", "Gas", "Petrol" | `gasoline` |
| "Diesel" | `diesel` |
| "Elektrisch", "Electric", "EV" | `electric` |
| "Hybride", "Hybrid", "Plug-in Hybrid", "PHEV" | `hybrid` |
| "LPG" | `gasoline` (map to closest — LPG cars are gasoline-based) |
| Anything else / unclear | NULL |

### Body Type → must map to Merkado values
| Source text (any language) | Merkado value |
|---------------------------|-------------|
| "Hatchback", "Hatch" | `Hatchback` |
| "Sedan", "Saloon", "Limousine" | `Sedan` |
| "SUV", "Crossover", "Off-road", "Terreinwagen" | `SUV & Crossover` |
| "Pickup", "Truck", "Pick-up", "Bakwagen" | `Pickup & Truck` |
| "Van", "MPV", "Minivan", "Bus", "Bestelwagen", "Multi Purpose" | `Van & MPV` |
| "Convertible", "Cabriolet", "Cabrio", "Roadster", "Spider" | `Convertible` |
| "Coupe", "Coupé" | `Sedan` (map to closest) |
| "Wagon", "Estate", "Stationwagen", "Touring" | `Hatchback` (map to closest) |
| Anything else / unclear | NULL |

### Condition → must map to Merkado values
| Source text (any language) | Merkado value |
|---------------------------|-------------|
| "Nieuw", "New", "As new", "Excellent", "Uitstekend" | `like_new` |
| "Goed", "Good", "Zeer goed", "Very good" | `good` |
| "Redelijk", "Fair", "Matig", "Okay", "Gemiddeld" | `okay` |
| "Reparatie nodig", "Needs repair", "Project", "Schade", "Damaged" | `needs_repair` |
| Anything else / unclear | NULL |

### Drive Type → stored in `listing_details.drive_type`
| Source text | Merkado value |
|-------------|-------------|
| "Voorwielaandrijving", "Front wheel", "FWD", "2WD" (if car) | `FWD` |
| "Achterwielaandrijving", "Rear wheel", "RWD" | `RWD` |
| "Vierwielaandrijving", "All wheel", "AWD" | `AWD` |
| "4WD", "4x4", "Quattro" | `4WD` |
| Anything else / unclear | NULL |

### Mileage
- Always store in km as integer
- Dutch thousands separator: "42.000 km" → 42000
- "Kilometerstand" is Dutch for "mileage"
- "km stand" is also common

### Year
- "Bouwjaar" is Dutch for "year of manufacture"
- Must be a 4-digit number between 1970 and current year
- If not found on the page, set to NULL (don't guess)

### Description
- Scrape the seller's text as-is from the source
- Do not truncate, do not summarize, do not modify
- If the source has no description text, set to NULL
- Accept any language — don't translate

### Text Patterns Common in Curaçao Listings
- "PPTP" or "pptp" → means "price negotiable" (informational only, not a data field)
- "p.o." or "P.O." → also means "price on request" / negotiable
- Phone numbers: +5999XXXXXXX or just 7 digits (Curaçao format)
- Listings mix Dutch, English, Papiamentu, and sometimes Spanish freely

### Regex Patterns for Extraction (Helpers)
```
Year:         Bouwjaar:?\s*(\d{4})
Mileage:      (?:Kilometerstand|km\s*stand):?\s*([\d.]+)\s*km
Transmission: (Automaat|Automatic|Manual|Handgeschakeld)
Price XCG:    (XCG|Cg\.?)\s*([\d.,]+)
Price legacy: (NAfl?\.?|ANG)\s*([\d.,]+)
Price USD:    USD\s*([\d.,]+)
WhatsApp:     \+?5999\d{7}  or  \d{7}
Engine:       (\d+\.?\d*)\s*(?:L|liter|cc)
```

---

# 19. Slug Generation

Every listing needs a unique, URL-friendly slug for SEO.

**Format:** `{year}-{make}-{model}-{random_4chars}` or `{make}-{model}-{random_4chars}` if year is missing.
**Example:** `2021-toyota-rav4-x8f2`

Rules:
- Lowercase everything
- Replace spaces with hyphens
- Remove special characters
- Append 4 random alphanumeric characters to ensure uniqueness
- Check for uniqueness before inserting (slugs must be unique in the `listings` table)
- If collision: regenerate with a new random suffix

---

# 20. AI Enrichment Workflow (Workflow #6)

**Workflow name:** `AI: Listing Enrichment`
**Trigger:** Daily at 2:00 AM UTC
**Model:** GPT-5-mini (via OpenAI node)

This workflow performs normalization, enrichment, and validation in a **single unified pass**. There is no separate Pass A / Pass B — all logic is handled by a single AI prompt.

### Architecture

```
┌──────────┐    ┌──────────────┐    ┌──────────────┐
│ Schedule  │───▶│ Get All      │───▶│ Wait for     │
│ Trigger   │    │ Listings     │    │ Both         │
│ (2:00 AM) │───▶│ Get Listing  │───▶│ (Merge)      │
│           │    │ Details      │    │              │
└──────────┘    └──────────────┘    └──────┬───────┘
                                           │
                                           ▼
                                    ┌──────────────┐
                                    │ Build        │
                                    │ Enrichment   │
                                    │ Candidates   │
                                    └──────┬───────┘
                                           │
                                           ▼
                                    ┌──────────────┐
                                    │ IF Has       │── NO ──▶ (end)
                                    │ Candidates   │
                                    └──────┬───────┘
                                           │ YES
                                           ▼
                                    ┌──────────────┐
                                    │ Loop Batches │◀────────────────┐
                                    │ (size: 5)    │                 │
                                    └──────┬───────┘                 │
                                           │                         │
                                           ▼                         │
                                    ┌──────────────┐                 │
                                    │ Build AI     │                 │
                                    │ Batch        │                 │
                                    └──────┬───────┘                 │
                                           │                         │
                                           ▼                         │
                                    ┌──────────────┐                 │
                                    │ OpenAI       │                 │
                                    │ GPT-5-mini   │                 │
                                    └──────┬───────┘                 │
                                           │                         │
                                           ▼                         │
                                    ┌──────────────┐                 │
                                    │ Parse AI     │─────────────────┘
                                    │ Response     │     (loop back)
                                    └──────┬───────┘
                                           │
                              ┌────────────┼────────────┐
                              ▼            ▼            ▼
                       ┌───────────┐ ┌──────────┐ ┌──────────┐
                       │ Update    │ │ Upsert   │ │ Mark     │
                       │ Listings  │ │ Details  │ │Validated │
                       │ (make,   │ │ (trim,   │ │(set      │
                       │  model,  │ │  drive,  │ │validated │
                       │  title,  │ │  engine, │ │ _at)     │
                       │  body,   │ │  seats,  │ │          │
                       │  trans,  │ │  color)  │ │          │
                       │  fuel)   │ │          │ │          │
                       └───────────┘ └──────────┘ └──────────┘
```

### Step 1: Fetch data (Nodes 01–04)

The schedule trigger fires both queries in parallel:
- `02 - Get All Listings` → fetches ALL rows from `listings` (no filter)
- `03 - Get Listing Details` → fetches ALL rows from `listing_details`

A Merge node (04) waits for both to complete.

### Step 2: Build candidates (Node 05)

The code node joins listings with their details and filters to only **unvalidated** listings (where `listing_details.validated_at` is NULL or no details row exists).

For each candidate, it extracts: id, make, model, year, title, body_type, transmission, fuel_type, trim, drive_type, engine_size, seats, interior_color.

### Step 3: Batch and send to AI (Nodes 06–08)

- Only proceeds if candidates exist (IF check)
- Processes in batches of 5 via SplitInBatches
- Each batch is packaged as JSON and sent to GPT-5-mini

### AI Prompt — What It Does

The AI prompt handles ALL of the following in one call:
- **Make normalization:** Fixes spelling/capitalization (vw → Volkswagen, mercedes → Mercedes-Benz)
- **Model normalization:** Fixes spelling/formatting (rav 4 → RAV4, crv → CR-V, Tuscon → Tucson)
- **Title formatting:** Standardizes to "Make Model YEAR" format (no trim, no extras)
- **Trim cleanup:** Validates trim is a real manufacturer trim, clears garbage values
- **Body type assignment:** Uses UI label format (SUV & Crossover, Sedan, etc.)
- **Transmission/fuel/drive type enrichment:** Only when deterministic for the make/model/year
- **Seats enrichment:** When universally known for the body type
- **Engine size:** Only when a single known configuration exists

**Critical rules in the AI prompt:**
- Never changes year, price, or mileage
- If a field already has a valid value, returns it unchanged
- Returns null for anything uncertain
- Never guesses between multiple possible configurations

### Step 4: Parse and write (Nodes 09–13)

- `09 - Parse AI Response` → extracts JSON from AI output, creates one item per listing
- `11 - Update Listings` → writes make, model, title, body_type, transmission, fuel_type to `listings`
- `12 - Upsert Listing Details` → writes trim, drive_type, engine_size, seats, interior_color to `listing_details`
- `13 - Mark Validated` → sets `listing_details.validated_at = now()`

**Important:** The Update Listings node writes ALL fields from the AI response (not just NULLs). The safety comes from the AI prompt itself, which is instructed to return existing valid values unchanged. This means the AI acts as both normalizer and enricher — it may fix bad values (like misspelled makes) while also filling NULLs.

### What the AI NEVER fills:
- `price` — never guesses a price
- `mileage` — specific to the individual car
- `year` — must come from source data
- `description` — seller's text
- `condition` — too subjective
- `exterior_color` — specific to individual car (unless clearly mentioned)

---

# 21. Freshness Check Workflow (Workflow #7)

**Workflow name:** `Listings: Freshness Check`
**Trigger:** Daily at 2:30 AM UTC
**Status:** Inactive (ready to enable)

**Purpose:** Expire scraped listings that haven't been seen by any scraper in 2+ days.

### How it works:

```
┌──────────┐   ┌───────────────┐   ┌────────────┐   ┌─────────┐   ┌──────────┐
│ Schedule  │──▶│ Get All       │──▶│ Find Stale │──▶│ Safety  │──▶│ Mark     │
│ Trigger   │   │ Scraped       │   │ (>2 days)  │   │ Check   │   │ Expired  │
│ (2:30 AM) │   │ Listings      │   │ (Code)     │   │ (≤40)   │   │          │
└──────────┘   └───────────────┘   └────────────┘   └─────────┘   └──────────┘
```

### Step 1: Get all scraped listings (Node 02)

Queries the `listings` table for all rows where `listing_origin = 'scraped'` (limit 1000).

### Step 2: Find stale listings (Node 03)

A code node checks each listing:
- Skips listings already `expired` or `removed`
- Skips listings with no `last_seen_at`
- Flags listings where `last_seen_at` is more than **2 days** ago

### Step 3: Safety check (Node 04)

An IF node checks that the number of listings to expire is **≤ 40**. This prevents mass expiration in case of a scraper outage (where all listings would suddenly look "stale").

If more than 40 would be expired → the workflow stops (does not expire anything). This is a signal that something went wrong with the scrapers and needs investigation.

### Step 4: Mark expired (Node 04)

Updates each stale listing: `status = 'expired'`, `updated_at = now()`.

### Key differences from original design:
- **No HEAD requests** — the workflow does NOT check source URLs. It relies entirely on `last_seen_at` timestamps set by the scrapers.
- **2-day threshold** — not 14 days. If a scraper hasn't seen a listing for 2 days, it's expired.
- **Safety cap of 40** — prevents mass expiration from scraper failures.
- **Checks `listings.last_seen_at`** — not `listing_sources.last_seen_at`. The scrapers update `last_seen_at` directly on the listings table.

---

# 22. Safety Rules (Must ALWAYS Be Followed)

These rules apply to every n8n workflow without exception:

1. **Never set `seller_id`** for scraped listings. It must be NULL.
2. **Always set `listing_origin = 'scraped'`** for scraped listings.
3. **Always set `source_id`** for scraped listings. Use the existing UUID from the `sources` table.
4. **Never upload scraped images** to Supabase Storage. Use `external_url` only.
5. **Never modify manual/native listings** from scraper workflows. Scrapers only touch scraped listings.
6. **AI Enrichment** may normalize and enrich fields on any listing (scraped or manual), but the AI prompt is instructed to preserve existing valid values.
7. **Always maintain `listing_sources`** for every scraped listing — this is how dedup works.
8. **Prefer `status = 'expired'`** over deleting scraped listings. Keep data for historical reference.
9. **Use the service role key** for all n8n Supabase operations (n8n bypasses RLS).
10. **Skip listings that don't have at least make + model.** Everything else can be NULL.
11. **Never fabricate data.** If a field isn't on the source page, set it to NULL.
12. **All values must map to Merkado's exact categories** (see Section 3). If a source value can't be mapped, set to NULL.

---

# 23. Error Handling

Each scraper workflow should handle errors gracefully:

| Error | What to do |
|-------|------------|
| Source website is down (5xx) | Log error, skip this cycle, try again next run |
| HTML structure changed (selectors fail) | Log error with details, alert for manual fix |
| Supabase insert fails | Log the failing record, continue with next car |
| Duplicate slug | Regenerate with new random suffix |
| Missing make or model | Skip this listing entirely, log it |
| Price can't be parsed | Set price to NULL, still import the listing |
| Image URL is broken | Skip that image, import others |

**Core principle:** Don't let one broken listing crash the entire workflow. Process what you can, skip what you can't, log everything.

---

# 24. Mental Model Summary

```
listings           = cars (one row per unique vehicle)
listing_details    = extra specs (trim, engine, colors, seats, drive type, validated_at)
listing_features   = feature tags (AC, bluetooth, etc.)
listing_images     = ALL photos (multiple per listing, external_url for scraped)
sources            = websites being scraped (pre-populated, not updated by scrapers)
listing_sources    = proof of origin (links a listing to its source URL)
profiles           = real users (never touched by n8n scraper workflows)
fingerprint        = cross-source dedup hash (stored but not actively queried)
last_seen_at       = exists on BOTH listings and listing_sources (scrapers update both)
```

**Manual listings belong to users. Scraped listings belong to sources.**

**AI Enrichment is a single unified pass — normalizes, enriches, and validates in one AI call. Uses GPT-5-mini. Processes all unvalidated listings. Sets validated_at when done.**

**Freshness Check relies on last_seen_at timestamps, not HEAD requests. 2-day threshold. Safety cap of 40.**

**All data must map to Merkado's exact UI categories. If it can't be mapped, it stays NULL.**

---

END OF DOCUMENT
