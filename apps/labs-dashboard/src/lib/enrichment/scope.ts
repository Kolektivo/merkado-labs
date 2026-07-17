import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type EnrichmentScope =
  | "listing"
  | "listings"
  | "source"
  | "new_or_changed"
  | "failed"
  | "manual_selection";

export type EnrichmentJobRequest = {
  listingIds?: string[];
  sourceKey?: string;
  scope: EnrichmentScope;
  maxCount?: number;
  force?: boolean;
};

export type EnrichmentPreview = {
  scope: EnrichmentScope;
  totalMatched: number;
  wouldCallOpenAi: number;
  wouldSkipUnchanged: number;
  listingIdsSample: string[];
  force: boolean;
};

const PROMPT_VERSION = "listing_enrichment_v1";
const SCHEMA_VERSION = "listing_enrichment_schema_v1";

export function enrichmentModel(): string {
  const model = process.env.OPENAI_ENRICHMENT_MODEL?.trim();
  if (!model) {
    throw new Error(
      "OPENAI_ENRICHMENT_MODEL is required; no silent model default is allowed.",
    );
  }
  return model;
}

export function enrichmentMeta() {
  return {
    model: enrichmentModel(),
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
  };
}

async function resolveSourceId(
  client: SupabaseClient,
  sourceKey: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("property_sources")
    .select("id")
    .eq("source_key", sourceKey)
    .maybeSingle();
  if (error) throw new Error(`Unable to resolve source: ${error.message}`);
  return data?.id ? String(data.id) : null;
}

/**
 * Resolve listing IDs for an enrichment job scope.
 * Uses service-role client when available (writes / broad filters).
 */
export async function resolveEnrichmentListingIds(
  client: SupabaseClient,
  request: EnrichmentJobRequest,
): Promise<{ listingIds: string[]; propertySourceId: string | null }> {
  const maxCount =
    typeof request.maxCount === "number" && request.maxCount > 0
      ? Math.min(Math.floor(request.maxCount), 500)
      : 100;

  if (request.scope === "listing" || request.scope === "manual_selection") {
    const ids = (request.listingIds ?? [])
      .map((id) => id.trim())
      .filter(Boolean);
    if (!ids.length) {
      throw new Error("listingIds required for listing / manual_selection scope.");
    }
    return {
      listingIds: ids.slice(0, maxCount),
      propertySourceId: null,
    };
  }

  if (request.scope === "listings") {
    const ids = (request.listingIds ?? [])
      .map((id) => id.trim())
      .filter(Boolean);
    if (!ids.length) {
      throw new Error("listingIds required for listings scope.");
    }
    return {
      listingIds: ids.slice(0, maxCount),
      propertySourceId: null,
    };
  }

  let propertySourceId: string | null = null;
  const sourceKey = request.sourceKey?.trim() || "remax_curacao";

  if (request.scope === "source" || request.scope === "new_or_changed") {
    propertySourceId = await resolveSourceId(client, sourceKey);
    if (!propertySourceId) {
      throw new Error(`Unknown source_key: ${sourceKey}`);
    }
  }

  let query = client
    .from("property_listings")
    .select("id,enrichment_status,enrichment_last_input_checksum")
    .order("last_seen_at", { ascending: false })
    .limit(maxCount);

  if (propertySourceId) {
    query = query.eq("property_source_id", propertySourceId);
  }

  if (request.scope === "failed") {
    query = query.eq("enrichment_status", "failed");
  } else if (request.scope === "new_or_changed") {
    query = query.or(
      "enrichment_status.is.null,enrichment_status.eq.not_run,enrichment_status.eq.failed,enrichment_status.eq.queued",
    );
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Unable to resolve listings: ${error.message}`);
  }

  return {
    listingIds: (data ?? []).map((row) => String(row.id)),
    propertySourceId,
  };
}

/**
 * Preview counts without calling OpenAI.
 * Unchanged ≈ prior success statuses when force is false.
 */
export async function previewEnrichmentScope(
  client: SupabaseClient,
  request: EnrichmentJobRequest,
): Promise<EnrichmentPreview> {
  const { listingIds } = await resolveEnrichmentListingIds(client, request);
  if (!listingIds.length) {
    return {
      scope: request.scope,
      totalMatched: 0,
      wouldCallOpenAi: 0,
      wouldSkipUnchanged: 0,
      listingIdsSample: [],
      force: Boolean(request.force),
    };
  }

  const { data, error } = await client
    .from("property_listings")
    .select("id,enrichment_status")
    .in("id", listingIds);

  if (error) {
    throw new Error(`Unable to preview enrichment: ${error.message}`);
  }

  const force = Boolean(request.force);
  let wouldSkipUnchanged = 0;
  let wouldCallOpenAi = 0;

  for (const row of data ?? []) {
    const status = row.enrichment_status
      ? String(row.enrichment_status)
      : "not_run";
    const priorSuccess = [
      "succeeded",
      "skipped_unchanged",
      "needs_review",
    ].includes(status);
    if (!force && priorSuccess) {
      wouldSkipUnchanged += 1;
    } else {
      wouldCallOpenAi += 1;
    }
  }

  return {
    scope: request.scope,
    totalMatched: listingIds.length,
    wouldCallOpenAi,
    wouldSkipUnchanged,
    listingIdsSample: listingIds.slice(0, 10),
    force,
  };
}
