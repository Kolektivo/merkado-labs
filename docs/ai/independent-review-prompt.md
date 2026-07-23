# Independent review prompt

Use this for a second-opinion review of a PR or branch before merge.

```text
Perform an independent review of this branch or PR.

Read:

- AGENTS.md
- docs/00-docs-index.md
- Relevant approved requirements (especially docs/02-scope-and-decisions.md)
- docs/09-current-state.md
- docs/10-execution-roadmap.md when scope of remaining work is relevant
- docs/11-testing-and-uat.md
- The diff and related tests

Review for:

1. Scope creep vs approved intent
2. Incorrect “live” claims vs docs/09
3. Safety / Labs-only boundary issues
4. Missing verification
5. Documentation Synchronization Protocol gaps
6. UX / a11y / responsive risks when UI changed
7. Security / RLS / secrets risks when data changed
8. Accidental commit of docs/private/ or restoration of tracked docs/meetings/, docs/research/, or docs/tasks/

Do not treat local-only private research or detailed task ledgers as the current roadmap.

Return:

1. Blocking issues
2. Non-blocking issues
3. Questions for Product Lead
4. Whether merge is advisable
```
