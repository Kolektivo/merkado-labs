# Meeting notes integration prompt

Use this in Cursor after a meeting when raw notes exist or were just pasted.

Save raw notes first as `docs/meetings/YYYY-MM-DD-topic.md` when they are not
already filed.

```text
Process these meeting notes into the Merkado Labs documentation system.

Read:

- AGENTS.md (Documentation Synchronization Protocol and Meeting Notes Workflow)
- docs/README.md
- docs/01-live-product-state.md
- docs/03-mvp-scope-and-decisions.md
- The meeting note file under docs/meetings/
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
- Update the correct canonical docs with confirmed decisions only.
- Keep proposals and open questions labeled as such in the meeting note and in any scope doc sections meant for open items.
- Do not update docs/01-live-product-state.md unless something was already implemented and verified.
- Add a "Processed into" section on the meeting note linking to every updated file.
- Report what you changed and what still needs Product Lead confirmation.

Wait for Product Lead approval before applying high-risk, production, database,
billing, privacy, or security changes.
```
