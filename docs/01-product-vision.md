# 01 - Product Vision

**Purpose:** Why Merkado Labs exists now, who it is for, and what success looks like.
**Last updated:** August 19, 2026

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
book, renter USDC payment, shared account history, and automatic holder
distribution — while legal, Safe execution, allocation, and production
architecture decisions remain open. The demo default network is OP Sepolia.

## 3. Who it is for

| Audience | Product name they see | What they need |
|---|---|---|
| Landlord / operations | Merkado Direct | A clear Get Now quote, My Offers, and one upfront purchase amount |
| Purchaser / holder | Merkado Direct | Anonymised offer facts, Portfolio IDs, and honest collection risk |
| Payer / tenant | Merkado Pay | A payment link, same rent and lease, mocked USDC, no economics |
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

Wallet, Safe, transaction, account, and payment behaviour in this demo is
**mocked**. No real signature, RPC, token transfer, or blockchain write.
The selected demo networks are **OP Sepolia** (default) and **Base
Sepolia**, with Circle native USDC. OP Mainnet and Base Mainnet stay available
for later. Luis and Luuk own the real wallet adapter, Safe address, and
allocation design.

The landlord receives one upfront purchase amount. Later rent collections
are not paid to the landlord a second time. They move into the holder
distribution flow, presented as automatic in this demo.

## 5. Success for this phase

- A visitor can walk MRA-001 from Get Now → Use this quote → My Offers →
  mocked Pay → My Payments → Portfolio, with one shared demo state.
- Pricing reproduces the locked pack ($10,206 purchase price, 5.50% fee,
  ~21.6% effective annualised) and **blocks** anything over 24%.
- Property Score never changes quote pricing.
- The payer app never shows economics. The holder app never shows tenant
  identity.
- Stage 0 legal questions stay visible and unresolved.
- Luis can replace the mock crypto layer from a typed provider boundary.

## 6. What we refuse to claim

- That third-party holders may subscribe today
- That distributions are guaranteed
- That this is a loan, yield product, fund, token, or listed instrument
- That a mocked payment is a verified on-chain receipt
- That the displayed payment reference is encoded in a plain USDC transfer
- That the demo is live on merkado.cw
