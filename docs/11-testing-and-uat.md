# Testing and Product Lead UAT

**Purpose:** Real verification commands for this repository, plus a
beginner-friendly Product Lead acceptance checklist.

**Current product state:** `docs/09-current-state.md`
**Dashboard ops:** `docs/12-deployment-runbook.md` + `apps/labs-dashboard/README.md`
**Safety before any write/deploy:** `docs/08-security-and-privacy.md`

## Automated checks

### Python (repository root)

Activate the virtual environment first on Windows:

```powershell
.\.venv\Scripts\Activate.ps1
```

| Check | Command |
|---|---|
| Install (dev) | `python -m pip install -e ".[dev]"` |
| Optional geospatial | `python -m pip install -e ".[geo]"` |
| Compile | `python -m compileall src tests` |
| Lint | `python -m ruff check .` |
| Unit / integration tests | `python -m pytest` |

### Labs dashboard (`apps/labs-dashboard`)

From the repository root:

```powershell
npm --prefix apps/labs-dashboard install
```

| Check | Command |
|---|---|
| Lint | `npm --prefix apps/labs-dashboard run lint` |
| Type check | `npm --prefix apps/labs-dashboard run typecheck` |
| Unit tests | `npm --prefix apps/labs-dashboard run test:unit` |
| Contract tests | `npm --prefix apps/labs-dashboard run test:contracts` |
| Production build | `npm --prefix apps/labs-dashboard run build` |
| Browser / e2e | `npm --prefix apps/labs-dashboard run test:e2e` |
| Local UI | `npm --prefix apps/labs-dashboard run dev` |

Browser e2e uses installed Microsoft Edge across desktop and mobile profiles.

### What CI runs today

GitHub Actions workflow `property-pipeline-labs.yml` runs the Labs property
pipeline on a schedule. It does **not** currently run Python lint/tests or
dashboard lint/typecheck/e2e. Local and PR verification still matter.

## Critical Labs flows (manual)

Use these when the change touches the matching area. Exact routes and env
setup: `docs/12-deployment-runbook.md` and `apps/labs-dashboard/README.md`.

1. **Public Browse** — `/browse` and `/browse/{id}`: listing cards, XCG-primary
   price, English presentation, optional Dutch About, filtered Passport history.
2. **What Fits Me** — `/what-fits-me`: natural language → editable criteria →
   live matches → optional save to Property Search.
3. **Native listing (admin)** — `/listings/new` and listing lifecycle under
   Labs admin cookie (draft / publish / unpublish / sold / rented / republish).
4. **Data Operations** — `/data-operations` and `/settings`: pipeline health;
   do not dispatch or change schedules without approval.
5. **Enrichment review** — `/enrichment`: review UX only; dashboard AI
   execution is disabled.

## Product Lead UAT format

Copy this block into the task or PR. Replace placeholders with exact UI text
and expected results.

```text
Product Lead UAT

Prep:
1. Start the Labs dashboard: npm --prefix apps/labs-dashboard run dev
2. Open http://localhost:3000
3. Sign in with the Labs admin secret only if the flow needs admin pages

Checks:
1. Go to [exact page or menu path]
   Expected: [what you should see]
2. Do [exact action]
   Expected: [what should happen]
3. On phone-width or resized window, confirm [layout / tap target]
   Expected: [readable, usable, no cut-off controls]

Stop and ask for help if:
- The page errors or stays blank
- You are asked for production credentials
- Anything would write to merkado.cw or production Supabase
```

## Roles

| Role | What they verify |
|---|---|
| Agent / engineer | Automated checks + connected implementation |
| Product Lead | UAT checklist above on real screens |
| Security / data auditor (User Subagent) | Auth, RLS, secrets, migrations when relevant |
| Product experience reviewer (User Subagent) | UX, responsive, accessibility after UI work |
| Implementation verifier (User Subagent) | Independent “is it actually done?” check |

## Approval

Do not treat automated green checks alone as Product Lead acceptance. For
user-facing work, the Product Lead completes the UAT steps (or explicitly
defers them) before merge or deploy.
