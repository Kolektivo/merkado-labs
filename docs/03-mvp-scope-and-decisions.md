# 03 - MVP Scope, Decisions & Open Questions

**Purpose:** Single source of truth for the current MVP scope, resolved decisions, accuracy constraints, and remaining partner questions.

## 1. MVP goal

Replace the retired CHH pipeline with direct, source-specific property ingestion for five approved Curaçao sources. Prioritize data accuracy, price provenance, listing lifecycle history, and a simple off-chain Passport.

The future What Fits Me? and Merkado Agent journey is an approved product direction.
Labs dashboard demos of Search Request / What Fits Me / Agent / Match Reports are
prototypes only — not live on merkado.cw and not activation-complete.

Remaining activation gates: Sotheby's access route **BLOCKED** (2026-07-20 recon;
not Ready — official affiliate feed/export or Anywhere partner API with written
approval required; excluded from Ready pipelines). Four Ready adapters (KW,
RE/MAX, Moret, Monumentenzorg) share the Labs property pipeline; **daily cron is
armed On** (`AUTOMATIC_REFRESH_ENABLED = true`) after 2026-07-21 supervised +
idempotent gates; GHA schedule `0 4 * * *` UTC = 00:00 America/Curacao
(06:00 Amsterdam during CEST / 05:00 Amsterdam during CET); first normal daily
cron on the default branch observed 2026-07-22 (run `29984863341`);
manual/`workflow_dispatch` and dashboard Data Operations dispatch remain
available. Labs admin native listing prototype is implemented separately from
the scraper pipeline; production Auth seller listing remains planned. AI proposals use
exception-based **v5** policy (`enrichment_policy_v5`; high-confidence evidenced
fields auto-apply; manual attention only for conflicts, weak evidence, or
new-attribute taxonomy). Labs prototypes (Search Request / What Fits Me / Agent /
Match Reports) exist in the dashboard; production activation on merkado.cw
remains out of scope.

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
| P2 | Labs admin native listing | Admin can draft/publish a manual-origin property with images, preview, and Passport events (not production Auth). |
| [LABS] Working | What Fits Me | Natural-language intake → editable Property Search criteria → live `rules_v1` matches from public-eligible listings → optional save. Production Auth/alerts remain planned. |
| Planned (production) | Authenticated user listing | merkado.cw seller Auth/RLS flow (`List a property` / My properties). |
| Future (main repo) | Paid matching / alerts | Formerly framed as “Merkado Agent”; paywall, subscriptions, email, and production Auth remain unbuilt. Labs uses Property Search + Your matches. |
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
| AI review model | Exception-based (`enrichment_policy_v5`): high-confidence evidenced gap-filling fields auto-apply; English public presentation + optional Dutch About-this-property; Dutch/English synonym normalization is deterministic; source/map duplicates are `redundant` (not rejected); confidence-alone and subjective marketing reject quietly; only genuine unresolved conflicts show **Needs review**; unsupported/protected/noisy proposals reject; production migration remains paused. Historical v4 / v4.1 / v4.2 retained for audit. |
| Guided discovery | Labs What Fits Me parses EN/NL text into editable criteria, matches live public listings, then optionally saves a Property Search. Production user accounts remain planned. |
| Paid matching / alerts | Future main-repository work (not Labs user-facing “Merkado Agent”) |
| Match Reports | Personalized and evidence-backed; must show reasons, trade-offs, confidence, and limitations |
| Professional help | Future referral CTA from a match; provider types and commercial model still open |
| Intelligence | Deferred until enough reliable history exists |
| Cross-source matching | Reviewed later, never automatic in MVP |

## 4. Reality check

| Avoided claim | Correct description |
|---|---|
| Property marketplace is live | Property is Labs/WIP; cars are live |
| Five direct scrapers are running | Four Ready adapters (KW, RE/MAX, Moret, Monumentenzorg): pipeline ready / cron On (default-branch schedule observed) / dispatch available; Sotheby's remains BLOCKED |
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
- Production What Fits Me customer journey (Labs matching flow works; production Auth does not)
- Production Property Search account ownership/consent flow (Labs admin session exists)
- monthly paid matching subscription and billing
- personalized email matching / alerts
- production Match Report delivery (Labs live matching + 15 retained fixtures exist)
- professional-help referral marketplace
- weekly reports
- sold-probability models

These are not rejected ideas. Labs What Fits Me matching works against real
public listings; paywall, alerts, email, billing, and production Auth remain
future main-repository work after the data activation gate.

### Labs What Fits Me readiness (updated 2026-07-23)

| Demonstration step | Labs status | Production boundary |
|---|---|---|
| 1. Describe what you want | Ready: natural-language EN/NL intake | No customer profile or financial-advice workflow |
| 2. Review Property Search criteria | Ready: editable hard requirements vs soft preferences | No production account ownership |
| 3. See live matches | Ready: deterministic `rules_v1` against `public_property_listings` | No paywall or locked result limit |
| 4. Save Property Search / Your matches | Ready: confirm persists request + match reports; reopen preserves results | No billing, email alerts, or continuous monitor |

The fixture request `4ec62242-3921-4aa5-be9c-97e557f32585`, entitlement
`3c6f97f7-9e30-4738-ac36-1f3a1af45067`, and its 15 reports are retained Labs
demonstration data. They are not customer records.

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
16. **[OPEN]** Should free users see only three matches and pay to unlock more,
    or should the initial product use another trial/value boundary? Labs does
    not implement either behavior.
