# 03 - User Flows

**Purpose:** Documented end-to-end Labs user journeys and UX states. Factual
only. Gaps labeled `[OPEN]`.
**Last updated:** July 23, 2026

**Verified against local App Router routes** under
`apps/labs-dashboard/src/app` (read-only; no database access).

Related: `02-scope-and-decisions.md`, `04-design-system.md`,
`09-current-state.md`, `11-testing-and-uat.md`,
`apps/labs-dashboard/README.md`.

## 1. Audience and access model

| Surface | Who | Access |
|---|---|---|
| Internal ops (Overview, Listings, Sources, Enrichment, Quality, Data Operations, Settings) | Labs admin | Signed httpOnly cookie from `/login` (`LABS_ADMIN_SECRET`) |
| Public preview Browse / Passport | Anyone with Labs dashboard URL | No admin cookie; reads `public_property_listings` only |
| Prototypes (What Fits Me, Property Search, Match reports) | Labs admin session | Cookie-gated prototypes — **not** production Auth |

Production merkado.cw property journeys are **not built**. Cars marketplace on
merkado.cw is out of scope for these Labs flows.

## 2. Labs admin session

```text
Open Labs dashboard
  -> if no session: redirect to /login
  -> enter LABS_ADMIN_SECRET
  -> server sets labs_admin_session cookie (12h, httpOnly)
  -> land on internal pages
  -> Settings: sign out (clears cookie)
```

Public `/browse` and `/browse/[id]` skip this gate.

## 3. Internal operations journeys

### 3.1 Overview → investigate

1. Open `/` (Overview) for inventory / health glance.
2. Drill into Listings, Sources, Quality, Enrichment, or Data Operations as needed.

### 3.2 Listings inventory and map

1. Open `/listings` — search/filter inventory.
2. Optional `?view=map` when coordinates exist (also legacy `/map` redirect).
3. Open `/listings/[id]` for source facts, enrichment context, private evidence
   metadata, and Passport-style activity timeline.
4. Sidebar label is **Listings**; page title uses **Properties**
   (`[OPEN]` naming consistency — product decision not required for this docs pass).

### 3.3 Add / edit native listing (Labs admin prototype)

```text
/listings/new
  -> draft property details
  -> features
  -> photos (max 12; reorder / primary; Storage bucket listing-images)
  -> review Browse-card + Passport preview
  -> publish (or keep draft)
Edit: /listings/[id]/edit when editable
Lifecycle: publish / unpublish / sold / rented / republish via valid transitions only
```

Origin is `listing_origin=manual` (**User provided** provenance). Not production
seller Auth. Manual rows do not auto-run AI enrichment or source-absence removal.

### 3.4 Sources and Data Operations

1. `/sources` — maturity/health; `/sources/[sourceKey]` for run history.
2. `/data-operations` — enqueue/dispatch Labs property pipeline for Ready sources
   when admin session + server credentials exist.
3. Automatic refresh On (`AUTOMATIC_REFRESH_ENABLED = true`); cron
   `0 4 * * *` UTC on default branch; manual `workflow_dispatch` still available.

### 3.5 Enrichment review

1. `/enrichment` — cost/usage audit and exception-based proposal review (v5).
2. Dashboard AI **execution** is disabled; pipeline AI may run under budgets when
   the worker executes.
3. Proposals never overwrite protected source facts or raw title/description.

### 3.6 Quality

1. `/quality` — prioritized Critical / Important / Informational issues.
2. Legacy redirects: `/data-quality`, `/eligibility` → `/quality`;
   `/lifecycle` → `/quality?tab=lifecycle`; `/neighbourhoods` →
   `/quality?tab=location`.

**Doc/code mismatch:** quality page does not currently honor `?tab=` query
params (verified locally). Redirects still land on `/quality`. Recorded for
Product Lead; current-state describes actual behavior (single quality view).

## 4. Public Browse and Property Passport preview

### 4.1 Browse

```text
/browse
  -> public-safe filters and cards (XCG-primary)
  -> open /browse/{uuid}
```

English is the default public UI language. Stable URLs are `/browse/{uuid}`.
SEO/JSON-LD use English presentation + XCG when available.

### 4.2 Passport detail (`/browse/[id]`)

Sections (product framing from former Passport doc + verified route):

- **Property overview** — title, image, XCG primary price, buy/rent,
  neighbourhood, type, beds/baths/areas
- **Property features** — allowlisted auto-applied attributes (empty groups hidden)
- **About this property** — English structured description by default; optional
  Dutch toggle when `display_description_nl` present
- **Property activity** — filtered timeline (First seen, genuine XCG asking
  deltas, lifecycle / native events). Noise retained but hidden.
- **Source / Provenance** — scraped attribution + original link, or
  **User provided** for manuals

Not a blockchain record, ownership proof, title, valuation, or legal guarantee.

### 4.3 Required public copy

| Situation | Copy |
|---|---|
| Sold | `Last known listing price. The actual sale price may differ.` |
| Removed | `This listing is no longer available from the original source. This does not confirm that the property was sold.` |
| Converted price tip | `Indicative equivalent based on known information.` |
| Guidance | `Merkado provides information and matching guidance, not financial, legal, mortgage, inspection, or valuation advice.` |

## 5. Guided discovery prototypes (Labs)

### 5.1 What Fits Me

Route: `/what-fits-me` (also linked from `/prototypes`).

```text
Natural-language intake (EN/NL)
  -> editable Property Search criteria (hard vs soft)
  -> live deterministic rules_v1 matches from public_property_listings
  -> optional confirm to save Property Search
  -> reopen Your matches
```

Matching labels: Strong / Good / Possible. XCG is the only primary matched price.
No paywall, billing, email, or continuous monitoring in Labs.

### 5.2 Property Search and Match reports

- `/search-requests` — saved requests; points users to What Fits Me
- `/match-reports/[requestId]` — explainable match report (“Your matches”)

“Merkado Agent” is **not** the current user-facing product name. `/agent` still
exists as an internal entitlements test page and is **not** in primary nav
(verified locally).

### 5.3 Future production journey (approved direction — not Labs Auth)

From product vision (not implemented on merkado.cw):

```text
Visit Merkado
  -> know what you want? Yes: Property Search Request / No: What Fits Me
  -> confirm request
  -> future paid matching / alerts (main repository)
  -> Match Report → original listing or professional help
```

## 6. Settings

`/settings` — session, configuration health, automatic refresh status, environment
boundaries. Legacy `/how-it-works` redirects here.

## 7. UX states coverage

| Flow | Loading | Empty | Error | Permission | Notes |
|---|---|---|---|---|---|
| Internal pages | App loading patterns | Empty inventory/filter states | DataError categories | Redirect to `/login` | |
| Browse public | | Empty filter results | Config/network/query errors | Public read model only | |
| Native listing wizard | Step transitions | Validation on required fields | | Admin cookie | See UAT in `11` |
| What Fits Me | Parse/match wait | No matches | | Admin cookie | |

`[OPEN]` Formal per-step wireframe/state matrix for every screen is not yet a
dedicated design artifact — capture critical acceptance in `11-testing-and-uat.md`.

## Preserved guided-search journey detail

From former Passport doc §6 (Labs status reflected in §5 above).

## 6. Future guided-search journey `[PLANNED AFTER ACTIVATION]`

### Step 1A: Direct Property Search Request

A user who already knows what they want can create a Property Search Request directly.

The request may include:

- price or comfortable monthly range;
- available funds or approximate down payment;
- property type;
- preferred and excluded locations;
- minimum bedrooms/bathrooms;
- desired size and outdoor space;
- parking, accessibility, pet, work-from-home, or family needs;
- purchase timeline;
- willingness to renovate or perform maintenance;
- must-haves, preferences, and dealbreakers.

### Step 1B: What Fits Me

**Labs (working now):** the user writes what they want (English or Dutch). A
deterministic parser builds editable Property Search criteria. The user reviews
hard requirements vs soft preferences, then sees live matches from current
`public_property_listings` with reasons, trade-offs, missing information, XCG
price, source, and a Passport link. They may confirm to save a Property Search
and reopen **Your matches**. Matching uses explainable `rules_v1` labels
(Strong / Good / Possible). No paywall or locked result limit in Labs.

**Future production:** may add authenticated accounts, richer guided intake,
and continuous alerts. The output remains guidance only — not mortgage
eligibility, financial advice, or guaranteed affordability.

### Step 2: Future paid matching / alerts

After confirming a Property Search, a future paid product (main repository —
not Labs user-facing “Merkado Agent”) may:

- continuously compare new and materially changed listings against the request;
- rank relevant matches;
- avoid sending clearly unsuitable listings;
- explain why each listing matched;
- deliver Match details by email or in-product alerts;
- allow the user to refine, pause, resume, or cancel.

It does not contact realtors, negotiate, reserve, or purchase autonomously.
Paywall, billing, email delivery, and production Auth remain future work.
