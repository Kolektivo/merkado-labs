# ADR-0003: Marketplace / Listings / Property terminology

Status: Superseded in this repo (2026-08-14)
Date: 2026-07-24
Owner: Product Lead

**Labs note:** This ADR is history. Merkado Labs no longer holds listing
schema, scrapers, or a listings UI. `property_listings` and related tables
were dropped in the 2026-08-14 Rent Advance rebuild. Marketplace / Listings /
Cars / Property vocabulary for the live storefront lives on **merkado-cw**.
Keep this file so the rename decision is still readable.

## Context

Tracked Labs docs previously defined **Properties** as the umbrella for all
Merkado listed assets (cars + real estate). That conflicts with ordinary
language: “property” means real estate. Product Lead approved clearer
marketplace vocabulary for both Labs and production (merkado.cw).

## Decision

| Term | Use for |
| --- | --- |
| **Marketplace** | Overall Merkado product area spanning categories |
| **Listings** | Cars and real-estate listings together |
| **Cars** | Vehicle category |
| **Real Estate** | Housing / land category |
| **Property** / **Properties** | Real estate only |

### Actions

| Action | Copy |
| --- | --- |
| Shared | **Create a listing** |
| Cars | **List your car** |
| Real estate | **List a property** |
| Footer create column | **List** |

Production routes (merkado.cw): `/list`, `/list/cars`, `/list/real-estate`
(legacy `/sell/*` redirects).

### Keep as real-estate-specific

Property Passport; Property Search / Property Search Request; Labs schema names
(`property_type`, `public_property_listings`, pipeline “property” modules);
seller “My Properties” on production when referring to RE inventory.

### Schema note

Labs `property_listings.property_type` / `effective_property_type` remain the
**real-estate subtype / source label** for scraped rows. Map explicitly into
production `real_estate_type`. Do not reinterpret as a cars-vs-RE umbrella
discriminator without an explicit mapping layer.

## Consequences

- Live marketplace vocabulary is owned by merkado-cw ADR-003.
- Labs no longer has a listings UI, so the old “Properties vs Listings”
  inconsistency in this repo is gone.
- Parallel production ADR: merkado-cw `docs/decisions/ADR-003-marketplace-listings-terminology.md`
