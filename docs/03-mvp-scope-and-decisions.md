# 03 - MVP Scope, Decisions & Open Questions

**Purpose:** Single source of truth for the current MVP scope, resolved decisions, accuracy constraints, and remaining partner questions.

## 1. MVP goal

Replace the retired CHH pipeline with direct, source-specific property ingestion for five approved Curaçao sources. Prioritize data accuracy, price provenance, listing lifecycle history, and a simple off-chain Passport.

The future What Fits Me? and Merkado Agent journey is an approved product direction.
Labs dashboard demos of Search Request / What Fits Me / Agent / Match Reports are
prototypes only — not live on merkado.cw and not activation-complete.

Remaining activation gates: Sotheby's access route **BLOCKED** (2026-07-20 recon;
not Ready — official affiliate feed/export or Anywhere partner API with written
approval required). KW, RE/MAX, Moret, and Monumentenzorg catalogs have complete
Terra-v3 coverage and remain manual/unscheduled.
Scheduled runs off until QA; AI proposals reviewed under the exception-based v3
policy (high-confidence evidenced fields auto-apply; manual attention only for
conflicts, weak evidence, or new-attribute taxonomy); public RLS verified.

## 2. MVP deliverables

| Priority | Deliverable | Completion test |
|---|---|---|
| P0 | Remove CHH | No CHH workflow, runtime code, config, UI dependency, active tests, source registration, or Labs records remain. |
| P0 | Source-neutral foundation | Shared adapter, snapshot, run-health, currency, and lifecycle contracts exist without CHH naming. |
| P0 | Additive Labs migration | Currency provenance, source-run health, lifecycle states, and immutable events can be stored safely. |
| P1 | RE/MAX adapter | Existing proof becomes a complete direct listing adapter with fixtures, dry run, price handling, and lifecycle support. |
| P1 | Four remaining adapters | Keller Williams, Sotheby's, Moret, and Monumentenzorg each produce reviewed normalized snapshots. |
| P1 | Public eligibility | Public queries return only active, priced, attributable listings. |
| P1 | Currency normalization | Original value remains intact and XCG benchmark provenance is stored. |
| P1 | Lifecycle engine | First seen, source listed, price changes, sold, missing, removed, and relisted events are represented safely. |
| P2 | Dashboard updates | Source health, currency, eligibility, lifecycle, and exclusions can be inspected. |
| P2 | Passport/read model | Safe listing history and provenance are available to the app. |
| Planned after activation | What Fits Me? | Guided intake can create a reviewable Property Search Request. |
| Planned after activation | Merkado Agent | Paid monthly agent matches requests to listings and sends explainable email reports. |
| Deferred | Broader reports, alerts, AVM | Start only after the data-history activation gate is met. |

## 3. Resolved decisions

| Topic | Decision |
|---|---|
| Data sources | Five approved direct sources, one adapter each |
| CHH | Remove completely from active architecture and Labs data |
| App structure | Refactor the existing Labs app, no second app or repository |
| Git | Feature branch recommended only for rollback, not for parallel architecture |
| Public eligibility | Active listings with a valid positive price only |
| Benchmark currency | XCG |
| USD conversion | Fixed `1 USD = 1.79 XCG` |
| EUR conversion | ECB daily USD-per-EUR × 1.79 (`ecb_eur_usd_xcg_peg`), cached once per run |
| Original price | Never overwritten by converted values |
| Listing dates | Source date and Merkado first-seen date remain separate |
| Sold | Requires explicit source signal |
| Removed | Requires consecutive successful complete snapshots with absence |
| Passport | Off-chain listing/property activity log |
| AI review model | Exception-based (`enrichment_policy_v3`): high-confidence evidenced fields auto-apply; only conflicts/weak/ambiguous exceptions need manual attention; unsupported or noisy proposals are rejected outright, never queued |
| Guided discovery | Users may create a Property Search Request directly or through What Fits Me? |
| Merkado Agent | Future paid monthly subscription; email delivery first |
| Match Reports | Personalized and evidence-backed; must show reasons, trade-offs, confidence, and limitations |
| Professional help | Future referral CTA from a match; provider types and commercial model still open |
| Intelligence | Deferred until enough reliable history exists |
| Cross-source matching | Reviewed later, never automatic in MVP |

## 4. Reality check

| Avoided claim | Correct description |
|---|---|
| Property marketplace is live | Property is Labs/WIP; cars are live |
| Five direct scrapers are running | Five adapters are approved and under development |
| Passport is verified/on-chain | Passport is an off-chain provenance and activity record |
| Sold price is known | Last known asking price may be known; sale price is not confirmed |
| Removed means sold | Removed means absent from the source after confirmation |
| Property identity is resolved | Source listings remain separate unless reviewed |
| AI valuation exists | Any current signal is experimental and limited |
| What Fits Me? determines affordability | It proposes a search range from user-provided inputs; it is not financial advice or mortgage approval |
| Merkado Agent guarantees a good purchase | It provides explainable matches and context; users and professionals make the final decision |
| Likely to sell fast is a fact | It is an evidence-backed estimate with confidence and limitations |

## 5. Out of scope for the current direct-source MVP

- CHH fallback or active archive workflow
- confirmed sale-price claims
- public 5% sale-price estimates
- automated valuation model
- automatic cross-source property merging
- Kadaster/title verification
- KYC/AML, escrow, checkout, or asset payments
- blockchain Passport
- What Fits Me? quiz/chatbot implementation
- Property Search Request account flow
- monthly Merkado Agent subscription and billing
- personalized email matching
- dedicated Match Reports
- professional-help referral marketplace
- weekly reports
- sold-probability models

These are not rejected ideas. The guided-search and Agent flow is planned after the data activation gate and a separate product/monetization specification.

## 6. Intelligence activation gate `[DEFERRED]`

Suggested gate, to confirm with the partner:

- 8–12 weeks of stable history;
- all five sources operating reliably;
- above 95% successful runs;
- stable external identifiers;
- reviewed currency accuracy;
- enough priced observations per useful segment;
- false-removal behavior understood;
- evidence-backed price-positioning method tested;
- privacy and consent model approved for user financial/profile inputs;
- subscription, cancellation, email, and referral rules specified.

## 7. Future What Fits Me? and Agent boundaries

### What Fits Me?

- Inputs must be user-provided and optional where possible.
- Collect ranges instead of unnecessary exact financial data.
- The user must review and confirm the resulting Property Search Request.
- The result must clearly state that it is guidance, not lending or financial advice.

### Merkado Agent

- Monthly subscription.
- Email is the first delivery channel.
- User can edit, pause, or cancel the Agent.
- Matching must be based on the confirmed Property Search Request.
- Each match must explain why it was selected.
- The Agent does not contact, negotiate, reserve, or buy property autonomously.

### Match Report

May include, when supported by evidence:

- price position relative to suitable comparison evidence;
- whether similar listings tend to move quickly;
- notable price changes or listing history;
- likely renovation or maintenance considerations;
- strengths, weaknesses, and trade-offs for the user's profile;
- confidence level, sample size, evidence window, and limitations.

It must never fabricate sale prices, condition, renovation costs, legal status, or affordability.

## 8. Remaining open questions

1. What exact domains and listing sections are approved for each source?
2. Should scheduled automation begin only after repeated manual validation? Current recommendation: yes.
3. Should the default removal threshold be two consecutive successful runs for all sources, or configurable per source? Current recommendation: configurable, default two.
4. Should sold listings remain accessible only on detail/Passport pages, or also in a separate sold archive?
5. Which EUR exchange-rate provider is approved and how often should it refresh? **Resolved:** ECB daily USD-per-EUR × 1.79, cached once per source run (`ecb_eur_usd_xcg_peg`).
6. Is the `000`/`500` ending heuristic approved only as a low-confidence currency hint? Current recommendation: yes, never override explicit source currency.
7. What exact listing types are expected from Monumentenzorg?
8. Which source follows RE/MAX in implementation order after reconnaissance?
9. What monthly price and trial model should the Merkado Agent use?
10. What fields are required versus optional in What Fits Me?
11. Should users enter approximate income, comfortable monthly budget, available cash, or a combination?
12. How often should Agent emails be sent: immediate, daily digest, or user-selected?
13. Which professional-help categories launch first: buyer agent, mortgage advisor, inspector, contractor, notary, or another provider?
14. Is professional-help monetization a referral fee, lead fee, partnership, or initially free?
15. What confidence threshold is required before saying a listing is high/low priced or likely to move quickly?
