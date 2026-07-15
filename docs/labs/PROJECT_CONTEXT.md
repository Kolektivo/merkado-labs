# Merkado Labs Project Context

Merkado production is a live Curaçao vehicle marketplace. It aggregates car listings from
multiple sources, lets users browse and search, and directs buyer contact to sellers through
WhatsApp. Its current production pipeline uses n8n, AI-assisted enrichment, and Supabase.

Merkado Labs is a completely separate experimental workspace. It exists to test ideas safely
without assuming that production architecture, data, or credentials should be reused.

## Current Labs focus

Active work is on **property / PropTech** experiments for Curaçao:

- CaribbeanHouseHunt (CHH) public listing harvest into immutable snapshots;
- Labs Supabase property foundation (listings, observations, signals, contracts);
- geospatial neighbourhood boundaries and assignment;
- a read-only Next.js Labs dashboard for partner and internal review.

Other domains (cars, short-term rentals, land) remain in scope later. Raw source data must be
preserved before normalization so extraction results remain auditable and transformations can
be reproduced. Samples must not contain private production data.

Experiments must never modify production automatically. Any Supabase, Vercel, or other
external integration must target a clearly identified experimental resource and be approved
before writing, deploying, or promoting changes.

## What is built in this repository `[LABS]`

| Piece | Location |
|---|---|
| Property schema + RLS migrations | `supabase/migrations/` |
| CHH snapshot + import scripts | `experiments/caribbeanhousehunt_sample/` |
| Daily CHH harvest workflow | `.github/workflows/chh-daily-harvest.yml` |
| Geospatial import/assignment scripts | `scripts/geo/` |
| Read-only Labs dashboard | `apps/labs-dashboard/` |
| Local Streamlit inspector | `experiments/caribbeanhousehunt_sample/app.py` |

Detailed notes: `docs/08-labs-property-foundation.md`, `docs/09-labs-geospatial-layer.md`.

## Labs Supabase project

- Project name: `merkado-labs`
- Project reference: `csaefdkpwukshtouyixg`
- Region: `eu-west-3`
- Type: standalone project, separate from production
- Current state: property foundation, geospatial columns/functions, market signals, and
  pilot contract assessment tables are present; CHH listings are imported from full
  snapshots (1,449 records per snapshot contract)

Production Supabase must never be accessed from this workspace.
