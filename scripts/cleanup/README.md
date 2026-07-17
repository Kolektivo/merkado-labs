# CHH Labs cleanup tooling

Historical tooling used for the reviewed CaribbeanHouseHunt Labs data cleanup.

**Status (2026-07-16):** CHH-derived Labs rows were deleted from project
`csaefdkpwukshtouyixg`. The verified rollback export remains local and gitignored.

## Commands (historical / verification)

```powershell
# Counts only (non-destructive) — now returns zeros for CHH scope
python scripts/cleanup/chh_labs_data_cleanup.py

# Re-verify existing export checksums without overwriting
python -c "from pathlib import Path; import importlib.util; p=Path('scripts/cleanup/chh_labs_data_cleanup.py'); s=importlib.util.spec_from_file_location('c', p); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(m.verify_existing_export(m.VERIFIED_EXPORT_DIR))"
```

Verified export:

`data/processed/chh_cleanup_export/payloads_20260716T165840Z/`

Manifest SHA-256:

`63913ece20570a016d8d212f756c3a89ea5186848d8c1aafe77ec7a3cd65a792`

Do not overwrite that directory. Do not re-run `--execute` unless a new CHH
source row is accidentally reintroduced.
