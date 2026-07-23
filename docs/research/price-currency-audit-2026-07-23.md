> **HISTORICAL EVIDENCE — not current product state.**
> Do not treat dated metrics, retired workflows, or legacy architecture in this file as live Merkado Labs or merkado.cw reality. Current state: `docs/09-current-state.md`.

# Labs Price & Currency Audit — 2026-07-23

Scope: all 405 listings in Labs project `csaefdkpwukshtouyixg`, read against
current listing values and immutable price history. No production system was
accessed.

## Verdict

- 385 priced listings have a positive original amount, positive XCG benchmark,
  and reviewed conversion provenance.
- 283 public-effective listings are XCG-primary and can be compared,
  filtered, and sorted on the benchmark.
- 20 listings have no numeric source asking price. Every one is
  public-ineligible; no amount was invented.
- Current listing conversion providers contain 0 `fixed_test`/manual-test
  values.
- 51 historical test-rate price observations remain immutable and are excluded
  from Passport rows and charts.
- No current benchmark correction was justified.

Current method mix: 205 source-official conversions; 160 XCG identity; 11 ECB
EUR→USD→XCG; 7 fixed USD peg; 2 legacy ANG/NAf 1:1; 20 no-price.

## Reviewed false positive: 50 USD rows

A naive `original USD × 1.79` comparison flagged 50 Keller Williams rows by
XCG 0.02–0.50. All 50 use `source_official_conversion` with provider
`source:official_alternate` and rate 1. Their authoritative source XCG amount
is stored as the benchmark; the USD amount is a rounded secondary alternate.
The small reverse-conversion difference is expected rounding, not a stale
benchmark. Replacing source-official XCG with a derived peg would reduce
provenance quality, so these rows were retained unchanged.

## Listing-level no-price anomalies

These are source-data gaps, not synthetic cleanup candidates:

- KW `ID-002` — East Hill Bottelier – 16 semi-detached homes for sale in
  Bottelier — removed — `782bdd94-5d90-4acd-9632-ae8100cccfe9`
- KW `RL-15` — Popo Estate 12 — inactive —
  `9e665a2e-f483-468a-841e-90f1f975d6d2`
- KW `RL-2` — Kaya Notylia — inactive —
  `f89305e6-16c2-49e0-851f-9dd07a353341`
- KW `RL-20` — Nijmegenstraat 75 — Walking distance from the beach! —
  inactive — `6fa54bc4-851c-438e-87a4-cbf60b323525`
- KW `RL-25` — 4 Kaya David — inactive —
  `6ced58f1-9646-45e2-a629-4d8ad0e73cf1`
- KW `RL-37` — Kaya Libertadora — inactive —
  `567fcbf7-ba64-4c0c-a24e-a2c4768a46d7`
- KW `RL-43` — Amazing home with large private pool! — inactive —
  `04408e94-54fe-455b-8965-b311d10c50a0`
- KW `RL-6` — Kaya Viktoria 59 — inactive —
  `5b9637a0-1c32-45f7-94c1-d5da83a5cf0c`
- KW `RLOO-016` — Kaya Seru Waterloo — active but public-excluded —
  `9967403b-8dc7-4187-8176-c4b3a7501f23`
- KW `SB-006` — Furnished Sea View Home in Royal Palm — sold —
  `755ba4d9-b945-41c3-8e26-4623fa190c05`
- KW `SL-4` — Kaya Jeremiah 8 — sold —
  `73ded6ee-67a6-4f52-b724-3ff547fd4bfb`
- KW `SL-7` — Hofi Abou Lot — sold —
  `a3c23ab5-2f26-4706-860b-f05e2b3e4cd1`
- KW `SL-9` — Kaya Sery Cabaye 20 — sold —
  `e4540ce5-be15-45d3-bea8-9d88d82c1a39`
- KW `ZK2611` — Boutique Hotel For Sale — active but public-excluded —
  `943e7632-c1c3-4293-9a28-91c4334e7c0c`
- Monumentenzorg `property-19596` — Sold Under Reservation – Aura Winkel —
  sold — `b5446b3e-f3a3-40fe-87a5-555c4958d533`
- Monumentenzorg `property-20933` — Fort Waakzaamheid — active but
  public-excluded — `466c9a68-cd05-4141-887e-ae1b9aae279a`
- Monumentenzorg `property-31` — Villa Washington — active but
  public-excluded — `31946d36-0698-469e-82c9-3aa538a09855`
- RE/MAX `hr1667` — Blue Bay - Family villa with gorgeous views and private
  pool — inactive — `29acb558-22e6-4db9-a9e2-2547725dc98b`
- RE/MAX `hs2951` — Blue Bay Ocean - Sea view apartment with good rental
  potential — sold — `0ce8c908-94ef-4727-b9d7-9cab28b03153`
- RE/MAX `hs3022` — The Quarry – Exclusive Villa Apartment with Ocean View —
  sold — `7ef66929-8915-4c36-90fb-6504c285a0e8`

## Presentation and provenance handling

- XCG/ANG/NAf originals use identity/1:1 display without an indicative FX tip.
- USD fixed-peg and ECB EUR benchmarks retain provider/rate/timestamp.
- Source-official XCG wins over Merkado-derived FX when present.
- Historical test rates, unchanged repeated asks, and rate-only benchmark moves
  stay stored but do not create current Passport price points.
- Asking prices are never presented as confirmed transaction prices.
