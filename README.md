# Merkado Labs · Direct + Pay

Working **[LABS]** demo of **Merkado Direct** (rent paid forward) and
**Merkado Pay** (mocked USDC rent payments on Base Sepolia by default). The
book stores USD cents. The UI shows **XCG** at **1.79** to the dollar.
Pay still settles in USDC. Not live on merkado.cw.

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
Wallet, Safe, and USDC behaviour is mocked. Do not deploy unless the
Product Lead asks.

Web3 developer handoff: `docs/07-integrations.md`.
Access to give Luis: `docs/12-deployment-runbook.md`.
