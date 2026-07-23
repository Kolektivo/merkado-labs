# Meeting notes integration prompt

Use this in Cursor after a meeting when raw notes exist or were just pasted.

Save raw notes first as `docs/private/meetings/YYYY-MM-DD-topic.md` when they
are not already filed. Meeting notes are local-only and must never be committed.

```text
Process these meeting notes into the Merkado Labs documentation system.

Read:

- AGENTS.md (Documentation Synchronization Protocol and Meeting Notes Workflow)
- docs/00-docs-index.md
- docs/09-current-state.md
- docs/02-scope-and-decisions.md
- The meeting note file under docs/private/meetings/
- Every canonical document the meeting may affect

Extract and clearly separate:

1. Confirmed decisions (only when explicitly approved in the meeting or by the Product Lead)
2. Proposed ideas (not yet approved)
3. Open questions
4. Action items (owner + due date when known)
5. Affected features and canonical docs

Rules:

- Do not treat brainstorming, examples, or unclear discussion as confirmed.
- Ask before promoting anything ambiguous to approved scope.
- Update the correct canonical docs (docs/00–12 and ADRs) with confirmed, non-sensitive decisions only.
- Keep proposals and open questions labeled as such in the private meeting note and in any scope doc sections meant for open items.
- Leave unclear or confidential detail in docs/private/meetings/.
- Never create or restore tracked docs/meetings/, docs/research/, or docs/tasks/ folders.
- Do not update docs/09-current-state.md unless something was already implemented and verified.
- Do not put unapproved ideas into docs/10-execution-roadmap.md.
- Add a "Processed into" section on the meeting note linking to every updated file.
- Report what you changed and what still needs Product Lead confirmation.

Wait for Product Lead approval before applying high-risk, production, database,
billing, privacy, or security changes.
```
