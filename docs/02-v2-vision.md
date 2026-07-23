# 02 - Merkado V2 Vision

**Purpose:** Long-term product direction, separate from current live-product claims.

## 1. Core direction

Merkado grows from a Curaçao vehicle marketplace into a trusted hard-asset discovery platform. The near-term PropTech advantage is accurate, source-traceable property data with structured search, transparent price provenance, and durable activity history.

The property MVP is not blockchain-first. It is data-quality first.

The longer-term product should help a user move from an unclear housing need to a structured Property Search Request, then continuously match that request against new and changed listings through a paid Merkado Agent.

## 2. Product layers

### Public marketplace

Cars are live on `merkado.cw`. Property browse / Search Request / What Fits Me /
Agent / Match Reports in Labs are **prototypes**, not production-live.

The property marketplace will aggregate selected direct realtor sources, normalize searchable fields, show transparent price information, and direct users to the original realtor or approved contact flow.

### Guided discovery

Users who already know what they want can create a Property Search Request directly.

Users who are not yet sure can use **What Fits Me**, which turns a written
request into an editable Property Search and explainable matches. In Labs this
is already a working deterministic flow against public listings; production Auth
and continuous alerts remain future work.

Possible optional inputs include:

- available funds or approximate down-payment range;
- approximate income or comfortable monthly housing budget;
- household and family needs;
- preferred locations and property types;
- bedrooms, outdoor space, accessibility, parking, and other needs;
- purchase timeline;
- willingness and capacity to renovate or perform maintenance;
- must-haves, preferences, and dealbreakers.

The output is a recommended search range and property profile, not mortgage approval, financial advice, or a guarantee of affordability.

### Property Search matching (future paid alerts)

Labs user-facing names are **What Fits Me**, **Property Search**, **Your
matches**, and **Match details**. “Merkado Agent” is not the current product
label. A future paid monthly matching / alert subscription (main repository)
may add continuous monitoring and email. Each match includes:

- the matching listing;
- why it matches the user's request;
- important trade-offs for that specific user;
- a dedicated Match Report with evidence-backed context;
- actions to view the original listing or request professional help through an approved referral.

The Agent does not purchase, negotiate, contact realtors, or make decisions on the user's behalf.

### Intelligence layer

The system preserves enough history to explain:

- when a listing appeared;
- when the source says it was originally listed;
- how the asking price changed;
- which currency was original;
- which conversion rate was used;
- when the source marked it sold;
- when it disappeared or was removed;
- which source and observation support each fact.

This history can later support personalized Match Reports, such as whether an asking price appears high or low relative to comparable evidence, whether similar listings tend to move quickly, and which renovation or age-related trade-offs may matter for the user's profile.

Intelligence products begin only after sufficient reliable history exists.

### Future asset products

Tokenized contracts, investment products, stablecoin payouts, or other WealthTech experiments remain separate from the Property Passport. They may reference Passport evidence later, but they do not define the Passport.

## 3. Property Passport vision

The Passport is an off-chain, source-backed record of listing and property activity.

MVP content:

- current listing facts;
- source and realtor attribution;
- original and benchmark currency information;
- source listing date when available;
- first/last detected dates;
- price and status history;
- sold, missing, removed, and relisted events;
- conversion provenance and disclaimers.

Later evidence layers may include reviewed cross-source matches, inspections, title records, transaction evidence, legal records, or market signals. These must never be implied before they exist.

The Passport provides evidence for future Match Reports, but the personalized report and the Passport are separate products:

- the Passport explains the listing's evidence and history;
- the Match Report explains how that listing may fit one user's Property Search Request.

## 4. Future user journey

```text
Visit Merkado
  -> already knows what they want?
      -> Yes: create Property Search Request
      -> No: complete What Fits Me? guided intake
  -> review and confirm Property Search Request
  -> activate monthly Merkado Agent
  -> receive matching listings by email
  -> open personalized Match Report
  -> view original listing OR request professional help
  -> refine, pause, or cancel the Agent at any time
```

## 5. Data-source strategy

MVP sources:

- Keller Williams Curaçao
- Sotheby's International Realty
- RE/MAX
- Moret Real Estate
- Monumentenzorg Curaçao

Each source remains independently attributable. The system must not silently merge source listings into a single property identity.

## 6. Long-term moat

Merkado's durable advantage is a trustworthy longitudinal dataset combined with structured user intent:

- direct source observations;
- listing lifecycle history;
- price and currency provenance;
- source-run quality;
- geospatial normalization;
- reviewed relationships between listings and real-world properties;
- explainable market signals linked back to evidence;
- structured Property Search Requests;
- explainable personalized matching;
- user feedback on which matches were useful.

The moat is not a generic chatbot. It is trusted Curaçao property data plus a transparent matching and advisory layer.
