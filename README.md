# Merkado Labs · Direct + Pay

Working **[LABS]** demo of **Merkado Direct** (rent paid forward) and
**Merkado Pay** (mocked USDC rent payments). A sale of rent receivables,
not a loan. Not live on merkado.cw.

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000

The hub opens Direct, Pay, and a fictional Merkado account. Use
**Reset demo** to restore the seed.

Verify:

```powershell
npm run typecheck
npm run lint
npm run test:unit
```

Labs Supabase only: `csaefdkpwukshtouyixg`. Production is forbidden.
Wallet, Safe, and USDC behaviour is mocked. Do not deploy unless the
Product Lead asks.
