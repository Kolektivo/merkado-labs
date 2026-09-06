# 01 - Product Vision

**Purpose:** Why Merkado Labs exists now, who it is for, and what success looks like.
**Last updated:** September 5, 2026 (authenticated Labs accounts, shared demo state, linked wallet, password as deployment gate)

## 1. One-sentence vision

Merkado Labs is the working Buildathon demo of **Merkado Direct** (umbrella
app for rent paid forward) and **Merkado Pay** (a simple renter payment-link):
a Curaçao landlord can get future rent paid upfront, the renter pays the same
rent, and a holder sees collections — not a loan, not a public offering, and
not live on merkado.cw.

## 2. Problem

Private landlords on Curaçao often need a lump sum while a tenant is already
in place. Conventional credit is slow, poorly matched to a performing lease,
and easy to mis-label. The first reference transaction, **MRA-001**, is a true
sale of six months of rent receivables — not a mortgage, not a loan, and not
a public investment product.

The Buildathon also needs one coherent walkthrough: landlord quote and offer
book, renter USDC rent deposit, shared account history, and holder claim of
listing rent through a transferable offer NFT — while legal, deployment, and
production architecture decisions remain open. Pay uses **Optimism Mainnet**
now. The flow is implemented locally behind configuration; the Optimism
Mainnet contract is deployed, but the hosted flow is **not activated or merged**.

The walkthrough now runs under **authenticated Labs demo accounts**
(Supabase Auth: email magic link). All authenticated users share one demo book;
the authenticated account determines the landlord workflow, while linked
wallets authorize renter and holder actions. The shared host password is only a
**deployment gate** (the hosted app fails closed at `/enter` until a sign-in
completes); it is not identity and not a Merkado account.

## 3. Who it is for

| Audience | Product name they see | What they need |
|---|---|---|
| Landlord / operations | Merkado Direct | A clear Simulator quote, My Offers, and one upfront purchase amount |
| Purchaser / holder | Merkado Direct | Anonymised offer facts, Portfolio IDs, and honest collection risk |
| Payer / tenant | Merkado Pay | A payment link, same rent and lease, USDC rent deposit, no economics |
| Buildathon / partners | Labs demo hub | A signed-in demo account (email link), Direct, Pay, and Reset demo |

Do not prominently brand a separate “Merkado Rent Advance” product on
customer screens. Internal series and legal wording may still say Rent
Advance where needed.

**Listing Score** is the raw 0–100 quality input. **Property Score** is a
derived presentation figure (Listing Score × rent-to-market). Neither is the
merkado.cw Property Passport (listing history on a real-estate page).

## 4. What this Labs repo is

This repository is **not** the live merkado.cw marketplace. Cars, listings,
scrapers, and public browse now live in **merkado-cw**. Labs is the sandbox
for the Direct / Pay demo.

The selected network is **Optimism Mainnet**, with Circle native USDC. Merkado
Labs implements a real Optimism Mainnet flow with one non-upgradeable ERC-721
contract, **`MerkadoRentOfferV1`**. The contract holds pooled USDC rent,
accounted per `tokenId`. The verified backend mint key
(`0x27D9333E178BEeaA92EE0e5C80DE75C133eA19E5`) mints one offer NFT per
approved listing after independent Admin approval. The NFT is **transferable**: the current token owner is
the holder, and only the holder can claim that token's accrued rent. A buyer
pays the exact purchase price directly to the locked landlord payout address
and receives the NFT atomically. The renter deposits rent through
`depositRent(tokenId, opaquePaymentId, amount)` (exact monthly amount;
the app schedules the six-month term). The current owner claims with `claimRent(tokenId)` in
Portfolio. All mock payment and wallet behaviour is removed — the flow is
enabled by configuration on Optimism Mainnet. See ADR-0008 and ADR-0010.

The landlord selects a payout destination before requesting an offer. After
approval, Merkado mints the offer NFT from the server-held mint key. A buyer
purchases the complete offer by sending the purchase price to the landlord's
payout address; there is no landlord claim step and no listing expiry. Later
rent is not paid to the landlord a second time. It stays in the pooled
contract until the current NFT owner claims it.

## 5. Success for this phase

- A visitor signs in with an email magic link and walks Simulator →
  choose payout and request an offer → Admin
  approval → whole-offer Marketplace purchase (NFT Safe → buyer, buyer pays
  the landlord payout address) → renter USDC rent deposit on Optimism Mainnet →
  holder `claimRent`, using one shared demo book.
- Multiple authenticated demo users see the same product state while their
  accounts provide landlord ownership and linked wallets provide renter and
  holder authorization.
- Pricing reproduces the locked pack ($10,206 purchase price, 5.50% fee,
  ~21.6% effective annualised) and **blocks** anything over 24%.
- Property Score never changes quote pricing.
- The payer app never shows economics. The holder app never shows tenant
  identity.
- Stage 0 legal questions stay unresolved. They are not shown on
  customer Home.
- The Optimism Mainnet flow is implemented locally behind configuration. It is
  activated only after funding, migration, and hosted activation gates in
  `docs/10-execution-roadmap.md` and `docs/12-deployment-runbook.md` are approved.

## 6. What we refuse to claim

- That third-party holders may subscribe today
- That distributions are guaranteed
- That this is a loan, yield product, fund, token market, or listed instrument
- That a testnet USDC deposit is mainnet settlement
- That the displayed payment reference is encoded in a plain USDC transfer
- That the demo is live on merkado.cw, or that the Optimism Mainnet contract is
  activated (it is not yet)
