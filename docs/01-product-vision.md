# 01 - Product Vision

**Purpose:** Why Merkado Labs exists now, who it is for, and what success looks like.
**Last updated:** August 21, 2026 (Base Sepolia transferable NFT rent offer)

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
production architecture decisions remain open. Pay uses **Base Sepolia** now
(the Base testnet) and **Base Mainnet** later. The flow is implemented
locally behind configuration; it is **not deployed, not activated, and not
merged**.

## 3. Who it is for

| Audience | Product name they see | What they need |
|---|---|---|
| Landlord / operations | Merkado Direct | A clear Simulator quote, My Offers, and one upfront purchase amount |
| Purchaser / holder | Merkado Direct | Anonymised offer facts, Portfolio IDs, and honest collection risk |
| Payer / tenant | Merkado Pay | A payment link, same rent and lease, USDC rent deposit, no economics |
| Buildathon / partners | Labs demo hub | Direct, Pay, and a fictional Merkado account, plus Reset demo |

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

The selected network is **Base Sepolia**, with Circle native USDC. Merkado
Labs implements a real Base Sepolia flow with one non-upgradeable ERC-721
contract, **`MerkadoRentOfferV1`**. The contract holds pooled USDC rent,
accounted per `tokenId`. The verified company Safe
(`0xfC6ec9718d89d4935594E7DB78399913071FcDc4`) mints one offer NFT per
approved listing. The NFT is **transferable**: the current token owner is
the holder, and only the holder can claim that token's accrued rent. A buyer
pays the exact purchase price directly to the locked landlord payout address
and receives the NFT atomically. The renter deposits rent through
`depositRent(tokenId, opaquePaymentId, amount)` (exact monthly amount,
max 6 installments). The current owner claims with `claimRent(tokenId)` in
Portfolio. **Base Mainnet** stays later. All mock payment and wallet
behaviour is removed — the flow is the live flow on Base Sepolia, enabled by
configuration. See ADR-0008.

The landlord selects a payout destination before requesting an offer. After
approval, Merkado mints the offer NFT from the company Safe. A buyer
purchases the complete offer by sending the purchase price to the landlord's
payout address; there is no landlord claim step and no listing expiry. Later
rent is not paid to the landlord a second time. It stays in the pooled
contract until the current NFT owner claims it.

## 5. Success for this phase

- A visitor can walk Simulator → choose payout and request an offer → Admin
  approval → whole-offer Marketplace purchase (NFT Safe → buyer, buyer pays
  the landlord payout address) → renter USDC rent deposit on Base Sepolia →
  holder `claimRent`, with one shared demo state.
- Pricing reproduces the locked pack ($10,206 purchase price, 5.50% fee,
  ~21.6% effective annualised) and **blocks** anything over 24%.
- Property Score never changes quote pricing.
- The payer app never shows economics. The holder app never shows tenant
  identity.
- Stage 0 legal questions stay unresolved. They are not shown on
  customer Home.
- The Base Sepolia flow is implemented locally behind configuration. It is
  activated only after the deployment, migration, test-USDC, and Safe
  gates in `docs/10-execution-roadmap.md` and `docs/12-deployment-runbook.md`
  are approved.

## 6. What we refuse to claim

- That third-party holders may subscribe today
- That distributions are guaranteed
- That this is a loan, yield product, fund, token market, or listed instrument
- That a testnet USDC deposit is mainnet settlement
- That the displayed payment reference is encoded in a plain USDC transfer
- That the demo is live on merkado.cw, or that the Base Sepolia contract is
  deployed and activated (it is not yet)
