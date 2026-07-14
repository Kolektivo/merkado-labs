# Merkado Labs Safety Rules

The live Merkado system must remain completely untouched.

The only allowed Supabase target is the standalone Labs project:

- name: `merkado-labs`;
- project reference: `csaefdkpwukshtouyixg`.

The production project `merkado-curaçao`, reference `jkrfyvukhhsapoivntms`, is forbidden.

Never:

- access the production Supabase project from this workspace;
- modify the production Supabase project;
- run SQL against production;
- reset any database;
- copy production users, schemas, credentials, secrets, or private data;
- modify the live Vercel project;
- deploy to the live domain;
- write test data to production;
- use production service-role credentials;
- push changes to GitHub without explicit approval;
- automatically promote experiments to production.

Before every Supabase write operation:

1. Verify the exact Supabase project name and project reference.
2. Confirm that both identify a clearly experimental project, such as `Merkado Labs`,
   `Merkado Test`, or `Merkado Development`.
3. Stop without writing if the connected project cannot be confirmed as experimental.

Supabase inspection must begin read-only. Do not create tables, run migrations, change RLS,
insert or delete data, or copy the production schema without explicit approval and a verified
experimental target.

All approved database changes must be represented by reviewed migration files. Enable RLS on
every table created in an exposed schema. Never run destructive SQL without explicit approval.

Service-role credentials may be used only by local backend scripts. Never commit, print, log,
or expose them to browser code.

Preserve scraped source data in raw form before normalization.

Vercel is deferred until a frontend or API prototype is needed. Do not create or link a
project, change environment variables, deploy, or modify the production Merkado project
without explicit approval.

Never commit real secrets. Keep local credentials in ignored environment files, preserve
`.env.example` as placeholders only, and never expose a service-role key to browser code,
logs, reports, or source control.

Do not commit, push, deploy, or promote experiments automatically.

Do not introduce a frontend, browser automation, AI frameworks, vector databases, or
knowledge-graph technology without an explicit task. Keep work focused on Curaçao marketplace
experiments.
