# Merkado Labs · Direct + Pay

Working **[LABS]** demo of **Merkado Direct** (rent paid forward) and
**Merkado Pay** (USDC rent deposits on Base Sepolia by default). The
book stores USD cents. The UI shows **XCG** at **1.79** to the dollar.
Pay still settles in USDC. Not live on merkado.cw.

The Base Sepolia flow (ADR-0008) uses one non-upgradeable ERC-721
(`MerkadoRentOfferV1`): the company Safe mints one offer NFT per approved
listing, the NFT is transferable (current owner = holder), a buyer pays the
exact purchase price directly to the locked landlord payout address, rent is
deposited via `depositRent` (exact monthly amount, max 6 installments), and
the current owner claims with `claimRent`. The flow is **implemented locally
behind configuration — NOT deployed, NOT activated, NOT merged**. The mock
payment/wallet layer is removed.

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000

Home opens Merkado Direct. Use **Admin → Reset the book** to restore the
seed. Local stays open. After deploy, the hosted Vercel URL asks for a
shared host password first.

Verify:

```powershell
npm run typecheck
npm run lint
npm run test:unit
```

Labs Supabase only: `csaefdkpwukshtouyixg`. Production is forbidden.
`NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS` stays empty until the contract is
deployed. Do not deploy unless the Product Lead asks.

Crypto architecture: `docs/07-integrations.md` (ADR-0008).
Access to give Luis: `docs/12-deployment-runbook.md`.