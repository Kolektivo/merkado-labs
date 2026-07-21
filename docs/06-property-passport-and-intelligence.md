# 06 - Property Passport & Intelligence Layer

**Purpose:** Define the off-chain Passport and the data-first intelligence roadmap, including the future What Fits Me? and Merkado Agent journey, without expanding current MVP scope.

## 1. Passport definition

A Property Passport is an off-chain, source-traceable activity log for one source listing and, later, a reviewed canonical property. Labs Passport-style detail pages are prototypes, not production merkado.cw surfaces.

It is not:

- a blockchain token;
- proof of ownership;
- a title record;
- a confirmed valuation;
- a confirmed transaction record;
- a legal guarantee.

## 2. MVP identity model

Start with one Passport per source listing.

Do not automatically merge listings from different websites. A later reviewed workflow may link multiple source listings to one `property_asset`, while preserving each source history independently.

## 3. MVP Passport sections

### Labs public Passport preview (`/browse/[id]`)

Uses the same public-effective read model as Browse:

- **Property overview** — title, image, XCG primary price, original price,
  buy/rent, one effective neighbourhood, property type, beds/baths/areas.
- **Property features** — allowlisted auto-applied attributes only, grouped
  as Comfort / Outdoor / Parking and access / Security and utilities /
  Views and location (empty groups hidden).
- **About this property** — source description always; optional concise
  listing summary only when auto-applied and clearly labeled (never replaces
  source text). v4 exposes auto-applied, same-language display blocks
  (overview, layout, location, highlights, practical details) and image
  galleries on Labs Browse/Passport. Labs public-effective preview tables and
  galleries **exist and are applied**; production merkado.cw property projection
  remains **[PLANNED]** / paused.
- **Property activity** — first seen, last seen, source listing date.
- **Source** — attribution + original listing link.

Do not present AI as a consumer-facing feature. Neighbourhood provenance on
Passport may read: From source / Matched from map / Extracted from listing text.

### Current listing

- title and property type;
- location/neighbourhood;
- bedrooms, bathrooms, areas, and amenities where evidenced;
- realtor/source attribution;
- original URL;
- current source status.

### Price

- original amount and currency;
- XCG benchmark;
- conversion method, provider, rate, and timestamp;
- explicit/inferred currency indicator;
- disclaimer.

### Activity timeline

- source listing date, if known;
- first detected by Merkado;
- price and currency changes;
- status changes;
- source marked sold;
- missing and removed events;
- relisted events;
- last detected date.

### Provenance labels

Every fact should be distinguishable as:

- `Source fact`
- `Merkado calculated`
- `Merkado inferred`
- `Verified record` (future only when real external verification exists)

## 4. Required public copy

Sold:

`Last known listing price. The actual sale price may differ.`

Removed:

`This listing is no longer available from the original source. This does not confirm that the property was sold.`

Converted price:

`Indicative equivalent based on known information.`

Agent guidance:

`Merkado provides information and matching guidance, not financial, legal, mortgage, inspection, or valuation advice.`

## 5. Intelligence foundation in MVP

Build now:

- immutable source observations;
- original and normalized currency data;
- source and detection dates;
- current status plus activity events;
- source-run health;
- geospatial/neighbourhood assignment where evidence allows;
- source-neutral entities and relationships;
- evidence links for future calculations.

The intelligence layer begins with reliable history, not AI features.

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

### Step 1B: What Fits Me?

A user who is not yet sure can complete a short guided quiz or conversational intake.

The experience should:

1. ask simple questions about the user's situation;
2. explain why each question matters;
3. accept approximate ranges instead of demanding exact financial data;
4. translate answers into a draft Property Search Request;
5. show the recommended price range, property profile, and trade-offs;
6. require the user to review and confirm the request.

Possible inputs include approximate income, available funds, family situation, personal needs, purchase timing, and willingness to perform maintenance or renovation.

The output is guidance only. It must not be presented as mortgage eligibility, financial advice, or guaranteed affordability.

### Step 2: Activate Merkado Agent

After confirming a Property Search Request, the user may activate a monthly paid Merkado Agent.

Initial delivery channel: email.

The Agent:

- continuously compares new and materially changed listings against the request;
- ranks relevant matches;
- avoids sending clearly unsuitable listings;
- explains why each listing matched;
- sends a dedicated Match Report;
- allows the user to refine, pause, resume, or cancel the Agent.

The Agent does not contact realtors, negotiate, reserve, or purchase autonomously.

## 7. Personalized Match Report

Each recommended listing should have a dedicated report with two layers.

### A. Listing evidence

Grounded in the Property Passport and source data:

- original listing facts and source;
- asking price and currency provenance;
- listing age and activity history;
- price changes;
- source status;
- neighbourhood and property-type context;
- data-quality warnings and missing information.

### B. User-specific perspective

Grounded in the confirmed Property Search Request:

- why the property matches;
- which needs it satisfies;
- which preferences it misses;
- important trade-offs;
- possible maintenance or renovation implications when evidenced;
- how the property compares with the user's preferred age, size, location, and budget;
- whether the user may need professional review before proceeding.

### C. Future evidence-backed signals

Only when the required data and confidence exist:

- `Below typical asking range`, `Within typical asking range`, or `Above typical asking range`;
- likelihood that comparable listings attract attention or disappear quickly;
- supply scarcity for the user's requested segment;
- relevant neighbourhood or property-type trends;
- confidence level and reason for the assessment.

Example style:

> This property fits your preferred Salinja area and is within your target range. Similar listings in this segment tend to move relatively quickly. The building appears older than your preferred profile, so maintenance or renovation should be reviewed before making a decision.

This example is a writing pattern, not permission to state unsupported facts.

### D. Actions

- `View original listing`
- `Save or dismiss`
- `Adjust my Property Search Request`
- `Get professional help`

Professional-help referrals may later include approved buyer agents, mortgage advisors, property inspectors, contractors, notaries, or other specialists. The provider model and commercial terms require a separate decision.

## 8. Matching and evidence rules

A match should distinguish:

- **Hard filters:** requirements that normally exclude a listing;
- **Soft preferences:** desirable but negotiable criteria;
- **Trade-offs:** meaningful differences the user should understand;
- **Evidence strength:** how much reliable data supports the statement.

Every calculated signal or Match Report must state or retain:

- source set;
- observation window;
- included/excluded statuses;
- conversion method;
- comparison segment;
- sample count;
- calculation timestamp;
- confidence level;
- known limitations.

AI may summarize evidence and personalize wording. It must not create missing facts.

Do not claim:

- exact market value without an approved valuation method;
- confirmed selling speed from one missing listing;
- confirmed condition from listing age or photos alone;
- renovation cost without professional evidence;
- legal/title status without verified records;
- affordability or mortgage eligibility;
- guaranteed investment returns.

## 9. User data and privacy principles

The guided flow may involve personal and financial context. Build it with data minimization.

- Ask only for information needed to improve the search.
- Prefer approximate ranges over exact salary, savings, or debt values.
- Clearly mark optional questions.
- Explain how answers affect recommendations.
- Do not infer sensitive personal attributes.
- Do not use family, income, or financial inputs for unrelated advertising.
- Allow users to edit and delete their search profile.
- Separate user-provided facts from Merkado-derived recommendations.
- Define retention, consent, cancellation, and email preference rules before launch.

## 10. Suggested future product entities

Do not add these tables during the current scraper MVP unless explicitly instructed. They describe the likely future model:

- `property_search_requests`
- `property_search_request_preferences`
- `merkado_agent_subscriptions`
- `listing_matches`
- `match_report_snapshots`
- `match_delivery_events`
- `match_feedback`
- `professional_referral_requests`

A match/report snapshot should preserve the search-request version, listing observation, scoring version, evidence, and generated explanation used at that time.

## 11. Activation gate for What Fits Me? and Merkado Agent

Do not activate until:

- direct-source ingestion is stable;
- sufficient listing and price history exists;
- source-run failure protection is proven;
- useful comparison segments have adequate sample sizes;
- user profile/privacy rules are approved;
- matching logic is explainable and testable;
- subscription, cancellation, and email rules are defined;
- referral disclosures and provider quality controls are defined;
- unsupported claims are blocked by product and content safeguards.

## 12. Recommended delivery order after activation

1. Property Search Request without AI.
2. What Fits Me? structured guided form producing a draft request.
3. Rule-based matching and email delivery.
4. Explainable Match Report using Passport and market evidence.
5. User feedback and preference refinement.
6. Professional-help referrals.
7. More conversational intake and report summaries where useful.
8. Broader weekly market reports and trend products.
9. Carefully tested sold-probability or valuation signals, if ever approved.

Start deterministic and explainable. A chatbot interface may come later, but the underlying request and matching model must remain structured.

## 13. Other deferred intelligence products

- automated weekly market reports;
- sold-probability estimates for removed listings;
- automated valuation or ROI claims;
- AI-selected comparables without a reviewed method;
- automatic cross-source entity resolution.

## 14. Future evolution

Possible later layers:

- reviewed multi-source property linking;
- confirmed transaction evidence;
- Kadaster or notary evidence;
- inspection/condition records;
- comparables and market signals;
- user-submitted corrections with review;
- legal or zoning records.

Blockchain may support separate future contract or investment products. The Passport remains the off-chain evidence and activity record.
