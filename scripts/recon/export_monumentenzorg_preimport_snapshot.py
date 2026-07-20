"""Export Monumentenzorg Labs rows for rollback evidence (read-only)."""

from __future__ import annotations

import hashlib
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.scrapers.import_pipeline import (  # noqa: E402
    create_labs_client,
    resolve_property_source,
)
from merkado_labs.scrapers.monumentenzorg_import_preview import (  # noqa: E402
    SOURCE_KEY,
    assert_labs_project_ref,
    load_existing_monumentenzorg_rows,
)

OUT = ROOT / "data/processed/monumentenzorg_preimport_labs_snapshot.json"


def main() -> int:
    ref = assert_labs_project_ref()
    client = create_labs_client()
    source = resolve_property_source(client, SOURCE_KEY)
    listings = load_existing_monumentenzorg_rows(client)
    runs = (
        client.table("property_source_runs")
        .select("id,adapter_version,outcome,metadata,started_at,completed_at,snapshot_checksum")
        .eq("source_key", SOURCE_KEY)
        .order("started_at", desc=True)
        .limit(50)
        .execute()
        .data
        or []
    )
    blob = json.dumps(
        {"listings": listings, "runs": runs},
        sort_keys=True,
        default=str,
        separators=(",", ":"),
    )
    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": ref,
        "source_key": SOURCE_KEY,
        "property_source_id": str(source["id"]),
        "listing_count": len(listings),
        "run_count": len(runs),
        "listings": listings,
        "runs": runs,
        "checksum_sha256": hashlib.sha256(blob.encode("utf-8")).hexdigest(),
        "note": "Read-only rollback evidence before first complete import.",
    }
    OUT.write_text(json.dumps(payload, indent=2, default=str) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "path": str(OUT).replace("\\", "/"),
                "listing_count": len(listings),
                "checksum_sha256": payload["checksum_sha256"],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
