# Merkado Labs · Direct + Pay

Working **[LABS]** demo of **Merkado Direct** (rent paid forward) and
**Merkado Pay** (USDC rent deposits on Optimism Mainnet). The
book stores USD cents. The UI shows **XCG** at **1.79** to the dollar.
Pay still settles in USDC. Not live on merkado.cw.

The Optimism Mainnet flow (ADR-0008 and ADR-0010) uses one non-upgradeable
ERC-721 (`MerkadoRentOfferV1`): the backend (server-held mint key) mints one
offer NFT per approved listing, the NFT is transferable (current owner = holder), a buyer pays the
exact purchase price directly to the locked landlord payout address, rent is
deposited via `depositRent` (exact monthly amount; the app schedules the
six-month term), and
the current owner claims with `claimRent`. The flow is **implemented locally
behind configuration — deployed but NOT activated or merged**. The mock
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

Labs Supabase only: `ewoxmzznkavapcxdporm`. Production is forbidden.
The current deployed contract is
`0x97439e4352b9428F56651be7DE95224B1c83b711` on Optimism Mainnet. Do not
fund, mint, migrate, activate, or deploy hosted flows without explicit approval.

Crypto architecture: `docs/07-integrations.md` (ADR-0008 and ADR-0010).
Access to give Luis: `docs/12-deployment-runbook.md`.
