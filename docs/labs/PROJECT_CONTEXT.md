# Merkado Labs Project Context

Merkado production is a live Curaçao vehicle marketplace. It aggregates car listings from
multiple sources, lets users browse and search, and directs buyer contact to sellers through
WhatsApp. Its current production pipeline uses n8n, AI-assisted enrichment, and Supabase.

Merkado Labs is a completely separate experimental workspace. It exists to test ideas safely
without assuming that production architecture, data, or credentials should be reused.

Initial development will focus on local Python scrapers built directly in Cursor. Potential
data domains include:

- cars;
- properties for sale;
- long- and short-term rentals;
- land and lots.

Experiments may later cover cleaning and normalization, duplicate and entity matching,
market-intelligence signals, and knowledge-graph approaches. A frontend may be explored only
after the data workflow warrants one.

Raw source data must be preserved before normalization so extraction results remain auditable
and transformations can be reproduced. Samples must not contain private production data.

Experiments must never modify production automatically. Any future Supabase, Vercel, or other
external integration must target a clearly identified experimental resource and be approved
before writing, deploying, or promoting changes.

## Labs Supabase project

- Project name: `merkado-labs`
- Project reference: `csaefdkpwukshtouyixg`
- Region: `eu-west-3`
- Type: standalone project, separate from production
- Current state: no custom tables or project data

Production Supabase must never be accessed from this workspace.
