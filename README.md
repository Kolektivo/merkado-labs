# Merkado Labs · Rent Advance

Working demo of **Merkado Rent Advance** (landlord) and **Merkado Direct**
(holder). A sale of rent receivables, not a loan. Not live on merkado.cw.

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000

Verify:

```powershell
npm run typecheck
npm run lint
npm run test:unit
```

Labs Supabase only: `csaefdkpwukshtouyixg`. Production is forbidden.
Do not deploy unless the Product Lead asks.
