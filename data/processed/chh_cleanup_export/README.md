# CHH cleanup export directory

Payload exports under `payloads_*/` are gitignored.

Committed intentionally:
- this README (schema/manifest notes only)

Each export run creates `payloads_<UTC>/` with:
- one `.jsonl` file per table (complete row payloads)
- `manifest.json` (project ref, timestamp, counts, per-file SHA-256)
- `manifest.sha256` and `files.sha256`

Do not commit payload JSONL files.
