"""Export Labs neighbourhood names for offline KW alias matching (read-only)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.config import get_settings  # noqa: E402
from merkado_labs.geo import verify_labs_project  # noqa: E402

OUT = ROOT / "data/reference/neighbourhood_lexicon.json"


def main() -> int:
    settings = get_settings()
    url = verify_labs_project(settings)
    key = settings.supabase_publishable_key or settings.supabase_secret_key
    if key is None:
        raise SystemExit("Need SUPABASE publishable or secret key")
    from supabase import create_client

    client = create_client(url, key.get_secret_value())
    rows: list[dict[str, str]] = []
    start = 0
    page = 1000
    while True:
        chunk = (
            client.table("neighbourhoods")
            .select("name,normalized_name,slug")
            .eq("is_gap_zone", False)
            .range(start, start + page - 1)
            .execute()
            .data
            or []
        )
        rows.extend(chunk)
        if len(chunk) < page:
            break
        start += page
    # Longest first helps matching.
    rows.sort(key=lambda row: len(row.get("name") or ""), reverse=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": "labs.public.neighbourhoods",
        "project_ref": settings.supabase_project_ref,
        "count": len(rows),
        "entries": rows,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(rows)} entries to {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
