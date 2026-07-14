# 03 — Buildathon Scope & Discovery

**Purpose:** the working doc for the phase we are in right now. We are in discovery/scoping: aligning on what the 21-day build actually is before locking architecture. This file carries the deliverables, the priority order, what reuses v1 vs what is new, and the MVP thinking. Update it as answers come in.

**Tag legend:** `[WIP]` being scoped · `[OPEN]` waiting on Luuk · `[RISK]` concern.

---

## 1. Where we are (scope mostly landed)

**Status:** first call done, plus a follow-up that made the demo concrete. Transaction model, pipeline direction, and the actual demo are now defined. Still open: Kadaster access, and a couple of scoping clarifications (see `05` and `06`).

**Payment model (resolved) — three layers:**
- **Marketplace layer:** Sentoo checkout for advanced/boost features only (push a car to top, get featured). Fiat, for perks, not for assets.
- **Intelligence layer:** no payments.
- **Asset layer:** stablecoin stakes in assets (cars, real estate). User sends stablecoin manually or connects an EOA (self-custody wallet, "same as super account"). This signals Luuk is leaning **non-custodial** — confirm, but it likely answers the open wallet question.

**Why this matters:** we are NOT building asset checkout or escrow. Fiat payment is a small, scoped boost-payment flow. Asset "investment" is a stablecoin transfer to/from a wallet, not a payment processor. Both are far smaller than the original pitch implied.

## 2. Event context

- Event: Future Caribbean Innovathon / Buildathon (futurecaribbean.com)
- Track: 09 — AI for Real Estate & Development
- Duration: 21 days
- Framing: "deployable systems, not demos"
- Fully remote, global. Teams get H200 GPU compute (Highrise). Open-source agentic AI ethos (verify submission rules on open-sourcing).
- Applicant: Luuk Weber / EcoLabs.

## 3. The actual day-21 demo (Luuk's definition)

This replaces the vague "four deliverables." Luuk described the real demo, feature by feature:

1. **Add real estate to Merkado:** buy, rent, and lots (land) listings, alongside the existing cars.
2. **Intelligence layer — basic signals:** read simple market signals per listing, e.g. average guilder (XCG) rent per m² in the neighbourhood.
3. **Tokenize one real contract:** the pilot asset is a real rental contract between Luuk and his mother (informal, voluntary, low-stakes — exactly the kind of pilot he wanted).
4. **Market-fit formula:** a formula that scores the contract above or below market, based on the intelligence-layer signals.
5. **Stablecoin payout:** the tokenized contract pays out in stablecoins.

That is the whole demo. It is tight, honest, and buildable, and it still tells the full AutoTech → PropTech → WealthTech story in one thread: a real property listing → intelligence values it → one contract gets tokenized → pays out onchain.

## 4. What each demo piece actually requires (build breakdown)

| Demo piece | What it needs | Reuse vs new | Difficulty (solo) |
|---|---|---|---|
| 1. Real estate listings (buy/rent/lots) | property tables + CHH scraper + property detail/listing UI | mostly reuse of car engine | Low-Med |
| 2. Intelligence signals (rent per m²) | aggregate listings by neighbourhood, compute averages; no AI strictly needed for a first version | new, but simple | Low-Med |
| 3. Tokenize one contract | define what the token represents; Luis builds the smart contract, you + Luuk scope it | new, but Luis owns the contract code | Med (scoping) |
| 4. Above/below-market formula | a scoring function comparing the contract's terms to the neighbourhood signal from piece 2 | new, straightforward logic | Low-Med |
| 5. Stablecoin payout | wallet/EOA + stablecoin transfer; user sends manually or connects EOA | new, Luis helps on contract side | Med |

**Notably NOT in this demo (dropped from the original pitch):** Kadaster title reconciliation, a KYC/AML wall, a "flywheel" reservation flow, a full Passport with confidence scoring, and any SPV/notary work. Those are still part of the longer-term vision (`02-v2-vision.md`) but are out of the 21-day scope. If you want, keep a light "Passport-style" record on the listing, but the headline is the 5 pieces above.

**Priority within the demo:** pieces 1 and 2 are the foundation (listings + intelligence) and should ship first. Pieces 3, 4, 5 (tokenize → score → payout) are the WealthTech proof and depend on Luis for the contract. Build 1-2 fully, then thread 3-5 through the single Luuk-and-mother contract.

## 5. MVP definition (updated to the real demo)

**Ships (the 5 demo pieces):**
- Real estate listings on merkado.cw: buy, rent, lots. Reuses the car marketplace engine.
- Intelligence signals per listing/area, e.g. average XCG rent per m² by neighbourhood.
- One tokenized contract (Luuk + his mother), informal and voluntary, using real tokens.
- An above/below-market scoring formula driven by the intelligence signals.
- A stablecoin payout on that contract.

**Explicitly out of scope for 21 days (say so plainly):**
- Asset checkout / escrow (any asset). Only fiat flow is Sentoo boost payments.
- Kadaster title reconciliation (Luuk still chasing access; not needed for this demo).
- KYC/AML gating wall.
- A full Passport with confidence scoring (a light listing record is fine).
- SPV / notary / any binding legal transaction. The pilot is informal.
- A production custodial wallet system (asset layer uses EOA / manual stablecoin send).

**Demo narrative:** cars are live today → add real estate (buy/rent/lots) → intelligence reads the market (rent per m²) → one real contract gets tokenized → a formula scores it vs market → it pays out in stablecoins. One clean thread, honestly scoped, tells the whole AutoTech → PropTech → WealthTech story.

## 6. Real estate scraping (feasibility)

Same pattern as cars, so this is well-trodden:
1. n8n scrapes property listing pages (start with CaribbeanHouseHunt only, per Luuk).
2. Raw listing text goes to GPT-5-mini to extract structured fields.
3. Store in Supabase (new property tables mirroring `listings`).

Cost: Curaçao property inventory is small, so per-listing AI cost stays in the cents range. Not expensive.

For the intelligence layer (rent per m² by neighbourhood), no AI is strictly needed for a first version. It is aggregation: group listings by area, compute average rent ÷ average m². AI can be added later for smarter comparables, but a simple average ships the demo.

Entity resolution (same house across sites) is barely a concern now, since we start with a single source (CHH). It becomes relevant only when a second source is added. `[WIP]`

## 7. Things to watch (application accuracy)

Before submitting, the deck/application must match the live product. Full list in `04-reality-check.md`. The big ones: drop "rent cars" and on-platform "buy" from live claims, soften inspection/escrow/title-transfer language, present the pipeline as n8n (not LangGraph/CrewAI), and make sure the tokenization/Passport language matches this smaller, honest demo rather than the original grand pitch.

## 8. Open scope items

Tracked in `05-open-questions-luuk.md`. Still open after the latest context:
- Kadaster access (Luuk chasing; not blocking the demo).
- Custodial vs non-custodial wallet — latest context ("connect EOA, same as super account") leans non-custodial; confirm.
- What Luuk means by "Obsidian or comparable" for complex relationships.
- Exactly what the token represents in the Luuk-and-mother contract (rent stream? ownership share?) — needs a quick definition with Luis before contract work.
