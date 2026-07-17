import "server-only";

import { cache } from "react";

import type { ListingObservationEvidence } from "@/lib/domain/types";
import { createLabsAdminClient } from "@/lib/supabase/admin";

export const getListingEvidence = cache(
  async (listingId: string): Promise<ListingObservationEvidence[]> => {
    const { data, error } = await createLabsAdminClient()
      .from("listing_observations")
      .select(
        "id,property_listing_id,observed_at,source_snapshot_id,source_sha256,http_status,content_type,adapter_version,evidence_storage_bucket,evidence_storage_path,source_description_checksum,fetch_warnings",
      )
      .eq("property_listing_id", listingId)
      .order("observed_at", { ascending: false })
      .limit(25);

    if (error) {
      throw new Error(`Unable to load listing evidence: ${error.message}`);
    }

    return (data ?? []).map((row) => ({
      id: String(row.id),
      propertyListingId: String(row.property_listing_id),
      observedAt: String(row.observed_at),
      sourceSnapshotId: String(row.source_snapshot_id),
      sourceSha256: String(row.source_sha256),
      httpStatus:
        row.http_status === null || row.http_status === undefined
          ? null
          : Number(row.http_status),
      contentType: row.content_type ? String(row.content_type) : null,
      adapterVersion: row.adapter_version ? String(row.adapter_version) : null,
      evidenceStorageBucket: row.evidence_storage_bucket
        ? String(row.evidence_storage_bucket)
        : null,
      evidenceStoragePath: row.evidence_storage_path
        ? String(row.evidence_storage_path)
        : null,
      sourceDescriptionChecksum: row.source_description_checksum
        ? String(row.source_description_checksum)
        : null,
      fetchWarnings: row.fetch_warnings,
    }));
  },
);
