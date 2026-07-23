# Independent review prompt

Use this in ChatGPT or Claude when the latest branch or pull request is available
through GitHub.

```text
Independently review this branch or pull request.

Read:

- AGENTS.md
- docs/README.md
- Relevant approved requirements (especially docs/03-mvp-scope-and-decisions.md)
- docs/01-live-product-state.md
- The active task under docs/tasks/active/ and acceptance criteria
- docs/testing-and-uat.md
- The actual diff and connected implementation

Review for:

- Missing or partially implemented requirements
- Product and UX regressions
- Loading, empty, success, error, permission, and responsive states
- Security, authorization, RLS, validation, privacy, and data integrity
- Architecture and maintainability
- Duplicate or unnecessary code
- Tests and verification gaps
- Documentation drift
- Production and rollback risk
- Accidental use of production Supabase or production deploy paths

Do not assume the implementation works because the author summary says so.
Do not treat docs/08 as the current roadmap.

Return:

- READY, READY WITH MANUAL CHECKS, or NOT READY
- Blocking findings
- Important non-blocking findings
- Evidence with file references
- Recommended fixes
- Beginner-friendly Product Lead UAT checklist
```
