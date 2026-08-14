# ADR-0004 — Labs becomes the Rent Advance demo

**Status:** Accepted  
**Date:** 2026-08-14

## Context

Listing scrapers, enrichment, and public browse now live on merkado-cw. The Product Lead instructed a full cleanup of merkado-labs so this repo can host the Merkado Rent Advance / Merkado Direct demo for real-world use and the Future Caribbean buildathon.

## Decision

- Remove pipeline/scraper/browse product from this repository.
- Keep the Labs dashboard shell, shadcn design system, and Labs Supabase project.
- Rebuild the app around MRA-001 as a no-crypto, working demo.
- Update canonical docs `00`–`12` to match.

## Consequences

- Labs is no longer a property-intelligence kitchen.
- Historical listing data in Labs was dropped by Product Lead instruction.
- merkado-cw remains the only production marketplace.
- merkado-cw docs must not describe Labs as the listings kitchen or as
  Property Match research. Labs is the Rent Advance / Direct demo. That
  demo is not live on merkado.cw.
