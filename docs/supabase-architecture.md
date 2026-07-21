# Merkado V1 — Supabase Architecture Reference

> **HISTORICAL / PRODUCTION V1 CARS ONLY.** This document describes the live
> merkado.cw **vehicle** marketplace schema. It is **not** the Merkado Labs
> property model (`property_listings`, `public_property_listings`, pipeline /
> AI enrichment tables). Production project ref `jkrfyvukhhsapoivntms` is
> forbidden from Labs work. For Labs property schema use
> `docs/05-data-model-and-listing-lifecycle.md` and
> `docs/07-labs-architecture-and-geospatial.md`.

**Version:** V2 (updated to match deployed workflows)
**Purpose:** Historical complete database overview for production V1 cars.

---

# 1. High-Level Architecture

Merkado is a car marketplace with:

- Manual listings (real users)
- Scraped listings (external websites)
- Public browsing
- Favorites
- Reporting
- Contact click tracking
- Source tracking
- Image handling (manual + external)

Core Rule:

Manual listings belong to users.
Scraped listings belong to sources.

---

# 2. Core Tables

## listings (main entity)

One row = one car.

Important fields:

- id (uuid, primary key)
- listing_origin ('manual' or 'scraped')
- seller_id (only for manual listings)
- source_id (only for scraped listings)
- make
- model
- year
- price
- currency
- mileage
- transmission
- fuel_type
- body_type
- condition
- title
- description
- slug (unique)
- status ('active','sold','expired','removed')
- favorites_count (auto maintained)
- fingerprint (cross-source dedupe hash)
- last_seen_at (timestamptz — updated by scrapers, used by Freshness Check)
- location
- external_id
- source_name
- source_url
- created_at
- updated_at
- published_at

### Value Formats

**body_type** uses UI label format:
- `Hatchback`
- `Sedan`
- `SUV & Crossover`
- `Pickup & Truck`
- `Van & MPV`
- `Convertible`

**fuel_type:** `gasoline`, `diesel`, `hybrid`, `electric`

**transmission:** `automatic`, `manual`

**condition:** `like_new`, `good`, `okay`, `needs_repair`

Rules:

- Only status='active' is public
- Manual must have seller_id
- Scraped must have source_id
- last_seen_at is set to now() on insert and updated on each re-scrape

---

## listing_images

Many images per listing.

Fields:

- id
- listing_id
- storage_path (manual uploads)
- external_url (scraped images)
- is_primary
- sort_order
- phash
- created_at

Constraint:

At least one of storage_path OR external_url must exist.

Unique Index:

(listing_id, external_url)

Ensures:
- Same image URL cannot be inserted twice for a listing.
- Prevents duplicate images during re-scrapes.
- Protects against scraper retry duplication.

Manual flow:

Upload to storage bucket 'listing-images' and store storage_path.

Scraped flow:

Store image URL in external_url. No downloading.

---

## listing_details (1-to-1)

Extra structured specs.

Primary key: listing_id

Fields:

- trim
- accident_history
- drive_type
- exterior_color
- interior_color
- engine_size
- seats
- service_history
- seller_notes
- validated_at (timestamptz)
- created_at
- updated_at

### Value Formats

**drive_type** uses uppercase format:
- `FWD`
- `RWD`
- `AWD`
- `4WD`

Purpose of validated_at:

- Used by AI Enrichment workflow
- Indicates that a listing has been processed by the AI for normalization and enrichment
- Prevents repeated re-processing
- Set for both scraped and manual listings after AI processing

Public read allowed only if listing active.

---

## listing_features (many-to-1)

Feature tags grouped by category.

- id
- listing_id
- category
- feature
- created_at

Unique per (listing_id, category, feature)

---

## listing_favorites

User favorites mapping.

- user_id
- listing_id
- created_at

Primary key: (user_id, listing_id)

Triggers:

- increment_favorites_count()
- decrement_favorites_count()

ON DELETE CASCADE from listings.

---

## listing_reports

User reports for moderation.

- id
- listing_id
- reporter_user_id (optional)
- reason
- details
- status
- created_at
- resolved_at

Anonymous insert allowed.

---

## contact_events

Tracks contact clicks.

- id
- listing_id
- actor_user_id (optional)
- event_type ('whatsapp_click')
- created_at

Used only for analytics.

---

# 3. User System

## auth.users

Managed by Supabase Auth.

## profiles (private)

1-to-1 with auth.users.

- id (FK to auth.users)
- full_name
- avatar_url
- whatsapp
- phone
- email
- seller_type ('private','dealer')
- role (used by app for admin access)
- created_at
- updated_at

Owner-only write.

## public_profiles (view)

Safe public projection of profiles.

Used in listing detail page for seller card.

No RLS. Safe fields only.

---

# 4. Scraping System

## sources

Websites or companies.

- id
- name
- base_url
- seller_type ('dealer','private')
- logo_url
- is_active
- scrape_priority
- last_scraped_at
- created_at

Write restricted to service role.

Note: The current n8n scrapers do NOT update `last_scraped_at`. Scrape recency is tracked via `listings.last_seen_at` and `listing_sources.last_seen_at` per listing.

## listing_sources

Tracks origin per listing.

- id
- listing_id
- source_id
- source_url
- external_id
- raw_payload
- last_seen_at
- created_at

Unique Index:

(source_id, external_id)

Ensures:
- Same source cannot insert the same listing twice.
- Protects against duplicate rows during scraper retries.
- Core layer for same-source deduplication.

Used for:

- Same-source deduplication
- Updating listings
- Tracking freshness (via last_seen_at)

---

# 5. Storage

Bucket: listing-images

Manual uploads only. Public read allowed. Owner write restricted via RLS.

Important:

Deleting listing does NOT delete storage files automatically. App layer must remove them first.
The current app also performs partial cleanup of non-primary manual images when an owner marks a listing sold or expired.

---

# 6. RLS Model (Simplified)

Public:

- Can read active listings and related data.

Authenticated:

- Can insert/update/delete own manual listings.
- Can favorite.
- Can report.

Service Role:

- Can insert/update scraped listings.
- Can write sources.
- Used by n8n scraping and AI workflows.

---

# 7. AI Integration Model

The AI workflow operates as follows:

1. Scrapers insert/update scraped listings with `last_seen_at`.
2. AI Enrichment (daily) processes all unvalidated listings in a single pass:
   - Normalizes make/model/title formatting
   - Fills missing fields (body_type, fuel_type, transmission, etc.)
   - Validates and cleans trim values
   - Sets `listing_details.validated_at` when complete
3. Works on both scraped and manual listings.
4. Uses GPT-5-mini via OpenAI.

---

# 8. Image Rendering Rule (Frontend)

If storage_path exists:

Use Supabase public URL.

Else if external_url exists:

Use the normalized external_url only if it passes frontend URL validation.

---

# 9. Deletion Rules

Deleting listing:

- Cascades to details, features, favorites, reports.
- Does NOT delete storage files.

Scraped listings:

Prefer marking status='expired' instead of delete.

---

# 10. Freshness Model

The Freshness Check workflow (daily at 2:30 AM) expires scraped listings based on `listings.last_seen_at`:

- If `last_seen_at` is more than 2 days ago → set `status = 'expired'`
- Safety cap: maximum 40 listings expired per run
- If more than 40 would be expired, the workflow halts (likely scraper outage)

Both scrapers and the freshness check use `listings.last_seen_at` as the primary freshness indicator.

---

# 11. Mental Model Summary

listings = cars
profiles = real users
sources = websites
listing_sources = proof of origin
listing_images = photos
listing_favorites = saved cars
listing_reports = moderation
contact_events = analytics
listing_details = structured specs + validation state

Manual listings belong to users.
Scraped listings belong to sources.

AI validation state lives in listing_details.validated_at.

Freshness state lives in listings.last_seen_at.

---

END OF DOCUMENT
