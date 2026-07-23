# Context integration prompt

Use this in Cursor after ChatGPT or Claude produces research, meeting notes, or
new project documentation.

```text
Perform a read-only context integration review.

Read:

- AGENTS.md
- docs/00-docs-index.md
- docs/09-current-state.md
- The newly added source document
- Every canonical document it may affect
- Relevant code or schemas when the source makes implementation claims

Classify every new statement as:

- Confirmed fact
- Approved decision
- Proposal
- Assumption
- Open question
- Conflict
- Superseded information

Do not treat meeting notes, research, or AI output as approved requirements by
default.

Remember:

- Detailed meeting notes, research, and task ledgers are local-only under docs/private/ and are not the live roadmap
- Current state is docs/09-current-state.md
- Approved remaining work is docs/10-execution-roadmap.md (Now/Next/Later/Blocked)
- Approved non-sensitive outcomes must be summarized into docs/00–12; leave confidential detail in docs/private/
- Labs-only Supabase csaefdkpwukshtouyixg; production jkrfyvukhhsapoivntms is forbidden

Return:

1. Reliable new context
2. Conflicts or unsupported claims
3. Canonical documents that should be updated
4. Exact proposed updates
5. Product decisions requiring approval
6. Whether docs/09-current-state.md needs updating
7. Any implementation impact

Wait for Product Lead approval before updating canonical documentation or code.
```
