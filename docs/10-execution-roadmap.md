# 10 - Execution Roadmap

**Purpose:** Approved remaining work only, categorized for delivery planning.
**Last updated:** July 27, 2026

**Not a dump of every unimplemented idea.** Deferred, rejected, speculative, and
unapproved items stay in `02-scope-and-decisions.md`, `docs/decisions/`, or
local-only `docs/private/` notes — not here.

Detailed historical kickoff / audit notes (if present) live only under
`docs/private/research/` and are not part of this roadmap.

Related: `02-scope-and-decisions.md`, `09-current-state.md`. Detailed task
ledgers stay in local `docs/private/tasks/` only.

## Now

| Item | Notes |
|---|---|
| **Labs fully on hold** | No Labs cron, no Labs OpenAI spend, no paid pipeline enqueue. Keep repo as sandbox archive. |
| Continue product work on **merkado-cw** | Live Ready RE inventory + storefront ownership already transferred (ADR-004). |

## Next

Approved follow-ons wait for Product Lead direction on merkado-cw (not Labs):

| Item | Notes |
|---|---|
| Homepage Real Estate discovery (merkado-cw) | Product Lead Figma |
| What Fits Me save/alerts/paywall (merkado-cw) | Later product slices |
| Resume Labs sandbox (only if needed) | Requires restoring OpenAI secret, `LABS_OPERATIONS_ENABLED=true`, re-enable workflow + schedule |

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
