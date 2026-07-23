# 10 - Execution Roadmap

**Purpose:** Approved remaining work only, categorized for delivery planning.
**Last updated:** July 23, 2026

**Not a dump of every unimplemented idea.** Deferred, rejected, speculative, and
unapproved items stay in `02-scope-and-decisions.md`, `docs/research/`, or
`docs/decisions/` — not here.

Historical CHH→direct-source kickoff plan:
`docs/research/historical-chh-direct-source-execution-plan-2026.md` (not this
roadmap).

Related: `02-scope-and-decisions.md`, `09-current-state.md`, `tasks/active/`.

## Now

Approved work that is active or immediately next for Labs:

| Item | Notes |
|---|---|
| Operate Ready pipeline (KW, RE/MAX, Moret, Monumentenzorg) | Cron On + dispatch; monitor budgets, anomalies, source health |
| Maintain Labs Browse / Passport / native listing prototypes | Quality, pricing presentation, admin wizard |
| Maintain Labs What Fits Me matching prototype | `rules_v1`; no paywall/email |
| Keep docs/current-state accurate after verified changes | Update `09` only after verification |

## Next

Approved follow-ons that wait on capacity or a clear Labs gate (not speculative):

| Item | Notes |
|---|---|
| Sotheby's adapter path unblocking | Access route **BLOCKED** (2026-07-20); needs official feed/partner API + written approval — also listed under **Blocked** |
| Production merkado.cw property surface planning | Labs English Browse preview exists; production migration paused — requires explicit Product Lead go-ahead before build |
| Authenticated user listing on merkado.cw | Planned deliverable in scope (`List a property` / My properties) — main-repo / production Auth |

## Later

Approved direction, intentionally after activation gates / main-repository work:

| Item | Notes |
|---|---|
| Paid matching / alerts (subscriptions, email) | Formerly “Merkado Agent” framing; not Labs user-facing name |
| Production What Fits Me / Property Search accounts | Consent, ownership, Auth/RLS |
| Professional-help referral CTA | Provider model still has open commercial questions in `02` |
| Intelligence products (weekly reports, AVM, sold-probability) | After intelligence activation gate in `02` |
| Reviewed cross-source property linking | Never automatic in MVP |
| Post-activation delivery order from Passport framing | Search Request → What Fits Me form → rule-based matching/email → Match Report → feedback → referrals → conversational UI → broader reports → any valuation only if approved |

## Blocked

| Item | Blocker |
|---|---|
| Sotheby's Ready adapter / pipeline inclusion | Access-route BLOCKED: affiliate TLS broken; WAF; office shell has no catalog. Official Anywhere/partner feed or API required. Excluded from Ready pipelines. |

## Explicitly not on this roadmap

Do **not** treat these as roadmap commitments unless Product Lead re-approves:

- Every bullet under “Not built yet” in `09` that is descriptive inventory rather
  than an approved deliverable
- Open questions in `02` §8 (e.g. free-user three-match paywall `[OPEN]`)
- Speculative production entities listed in former Passport §10 beyond Labs
  preview tables already present
- Historical Phase 1–5 CHH migration checklist

When priority between **Next** items is unclear, stop and ask the Product Lead
before expanding scope.
