# 05 — Open Questions for Luuk

**Purpose:** questions blocking architecture and scope decisions. Update the status column as answers come in.

**Status:** first round answered on call. Some items resolved, some now open in a new way — read "New follow-ups" at the bottom for the real next actions.

---

## Scope

| # | Question | Status | Answer |
|---|---|---|---|
| 1 | Are on-platform payments/transactions in scope for the 21 days, or is the deliverable discovery + Passport + lead generation? | **Answered** | No payment for purchase/rent of assets. In-platform payment (Sentoo/CXPay or similar) IS in scope, but only for "boosts" (listing perks), not for transacting the underlying asset. |
| 2 | Exact demo feature list for day 21 (so scope can be built backward from it)? | **Deferred to live discussion** | Luuk says this needs a conversation, not something he can write out alone. Schedule this. |
| 3 | Tokenization pilot: does the demo need a real transaction, or can it be simulated/testnet? | **Answered** | Partly simulated, but using **actual tokens** (not fully mocked). |

## Transactions + revenue

| # | Question | Status | Answer |
|---|---|---|---|
| 4 | For real estate (notary-mandatory transfer), what does "buying through Merkado" mean? Discovery/lead only, or more? | **Answered (phase 1 defined)** | Initially: connecting buyer/seller. First real product step: a paid support service — template documents, tips, pricing recommendation, and direct contact with the team, in exchange for an XCG fee. |
| 5 | If we don't process payments, where do escrow/transaction fees come from? Is there a partner? | **Partially answered** | No real escrow yet. For cars specifically, Luuk wants to digitize the deed-transfer + payment execution flow as something we can **mock/demo** now and build for real later. |
| 6 | AutoTech: keep WhatsApp flow + add Passport, or also build payments/checkout? | **Answered** | WhatsApp for now. Payment/transfer flow is an "initial step" to explore, not a hard requirement for the sprint. |

## Real estate data

| # | Question | Status | Answer |
|---|---|---|---|
| 7 | Which property sites/feeds do we have confirmed access to (named)? | **Answered** | Start with **CaribbeanHouseHunt only** — either scrape it directly or use whatever pages/feed they provide. |
| 8 | Is the CaribbeanHouseHunt data relationship real and citable? | **Open** | Not explicitly confirmed as a data partnership — sounds like it may just be scraping their listings rather than a formal relationship. Worth clarifying before calling it a "relationship" in any deck. |
| 9 | Set on LangGraph/CrewAI + pgvector, or is extending the current n8n + AI pipeline acceptable? | **Answered — direction defined** | Use n8n + GPT-5-mini + Supabase. The intelligence layer must harvest source-traceable data and create a lightweight relational knowledge graph. No separate graph/vector database is required for the MVP. A visualization tool and more advanced valuation can be considered later. See `06-technical-decisions.md` and `07-intelligence-layer.md`. |

## Blockchain

| # | Question | Status | Answer |
|---|---|---|---|
| 10 | Who owns the smart contract / SPV / tokenization work? | **Answered** | Luis builds the smart contracts when needed. You + Luuk scope features and define smart contract requirements together. Luuk also wants you learning some Web3 basics ("Web3 vibe coding"). |
| 11 | Does Kolektivo provide a wallet layer, or do we build that? | **Open — needs a joint decision** | Team has prior experience here, but custodial vs non-custodial is still an open decision to make together, not yet answered. |
| 12 | Can the tokenization pilot be simulated/testnet first, with real legal execution after? | **Answered** | Yes — pilot should be informal and voluntary. |

## Kadaster

| # | Question | Status | Answer |
|---|---|---|---|
| 13 | What Kadaster access do we have? | **Open — action with Luuk** | Not resolved. Luuk will reach out based on what's stated in the application. No access confirmed yet — plan around the sample-extract fallback until this lands. |

## Accuracy + team

| # | Question | Status | Answer |
|---|---|---|---|
| 14 | Agree that the final deck/docs only describe features that are live today? | **Answered — agreed** | Yes. Luuk explicitly asked for the reality-check doc to keep being iterated on with comments/updates. |
| 15 | Solo build, or is there other engineering support? | **Answered** | You are lead dev. Luis (smart contracts) and an additional fintech developer are add-on support, brought in as needed — not full-time on the build. |

---

## New follow-ups (came out of these answers, not yet asked)

1. Schedule the "what exactly gets demoed on day 21" conversation — Luuk wants this live, not async.
2. Clarify custodial vs non-custodial wallet approach together — open decision, no default yet.
3. Confirm whether CaribbeanHouseHunt is a real data relationship or just a scrape target — matters for what can be claimed publicly.
4. Ask whether Luuk wants a specific visual interface for exploring the knowledge graph. The MVP storage model itself is no longer blocked: use Supabase relationships. Separately clarify how far valuation should go beyond the first transparent neighbourhood signal.
5. Scope the "digitized deed-transfer + payment" mock flow for cars — new deliverable, not in the original four.
6. Scope the paid real-estate support service (templates, pricing rec, XCG fee) — this may become the actual Tier 1 PropTech revenue model, worth formalizing.
7. Follow up on Kadaster access once Luuk has reached out.
