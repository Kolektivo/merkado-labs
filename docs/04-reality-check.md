# 04 — Reality Check (Claim vs Actual)

**Purpose:** the single biggest risk in the pitch is credibility. Several claims in the deck and application describe Merkado as more built than it is, and judges will visit merkado.cw. Fix these before submitting or presenting.

**Rule to adopt:** nothing goes in the final application/deck describing a feature as live/built unless it is true today on merkado.cw.

---

## Claim vs actual

| Claim in doc/deck | Actual state | Fix |
|---|---|---|
| "AutoTech LIVE: buy, sell, **rent** cars" (slide 5) | No rentals. No on-platform buy/sell (WhatsApp handoff only). | Drop "rent"; say "browse + contact," not "buy." |
| Live "verified vehicles, structural checks, title transfer, local logistics" (Q25, slide 6) | Inspection = "needs build"; escrow/transfer/logistics = don't exist. | Soften to "verified listings, with inspection and transfer services rolling out." |
| "LangGraph/CrewAI + pgvector/Pinecone + Python pipeline" (Q35, diagram) | Production = n8n + GPT-5-mini + Supabase, hash-based dedup. No vector DB, no Python pipeline. | Present n8n as proven v1 agentic pipeline; LangGraph/pgvector as the Passport's next step. |
| 5-agent architecture (diagram) shown as current | Only crawl + simplified enrichment exist, for cars. Reconcile/Valuation/Risk are new. | Add a LIVE vs BUILD legend to the agents in the diagram. |
| "Vehicle Passport" as an existing product | Not a product, but the dedup + enrichment + validate pipeline is a proto-Passport running for cars. | Reframe as "already runs for cars in simplified form; the sprint generalizes it to property." Strongest honest proof point. |
| "Revenue: listing, lead, **escrow** fees" (Tier 1) | No payment processing exists. Escrow is a separate regulated business. | Remove escrow unless a licensed partner is lined up. |
| Currency "ƒ 25.000" / "ƒ 650.000" (deck mockups) | Curaçao uses XCG ("Cg") since 2025; ƒ is the old ANG symbol. | Update deck mockups to Cg + USD, matching the live site. |
| Fractional min shown as "$50" / "USD 50-200" / "ƒ100" | Three different numbers across slides and app. | Pick one and use everywhere. |
| "Working data relationship with CaribbeanHouseHunt" | v1 docs describe CHH as a comparable, not a partner. CHH is also the closest PropTech competitor. | Confirm it's real and citable; add a differentiation line (CHH aggregates; the Passport verifies, values, and makes investable). |
| "Real users, real data, today" | Data yes (5 scrapers + enrichment since March 2026). User traction unverified. | Put a real number in (listings count, WAU, WhatsApp clicks). A modest real number beats an unverifiable claim. |
| Q31 "Open to being matched: No" | Contradicts team note "Seeking complementary builders." | Change to Yes if we want help finding builders. |
| Q33 "Comfortable across time zones: No" | Event is fully remote and global. | Change to Yes unless a hard constraint exists. |
| Q42 Loom script | Section is cut off, contains only "Al". | Write the 2-5 min script before submission. |

## Suggested Loom script structure (missing from application)

Slide-aligned, ~3 minutes:
- Live product proof (cars) — 30s
- The problem (opacity + exclusion, missing data) — 45s
- The Passport innovation — 60s
- What we ship in 21 days — 45s
- The ask / vision — 30s

## Outstanding [CONFIRM] fields in the application

X/Twitter, GitHub, preferred portfolio URL, team members + roles, hours/week (suggest 15-25), funding-raised answer.
