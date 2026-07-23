import "server-only";

import { cache } from "react";

import { getPublicListingById } from "@/lib/data/public-listings";
import type { ListingActivityEvent } from "@/lib/domain/types";
import { createLabsAdminClient } from "@/lib/supabase/admin";

/**
 * Server-side public Passport read. The raw table remains admin-only. The page
 * renders only filtered labels, dates, and asking-price deltas.
 */
export const getPublicListingActivityEvents = cache(
  async (listingId: string): Promise<ListingActivityEvent[]> => {
    if (!(await getPublicListingById(listingId))) return [];
    const client = createLabsAdminClient();
    const { data, error } = await client
      .from("listing_activity_events")
      .select(
        "id,property_listing_id,event_type,event_at,previous_value,new_value,derivation_type,notes,presentation_class,suppressed_reason,presentation_metadata",
      )
      .eq("property_listing_id", listingId)
      .order("event_at", { ascending: false })
      .limit(100);
    if (error) {
      throw new Error(`Public Passport activity query failed: ${error.message}`);
    }
    return (data ?? []).map((row) => ({
      id: String(row.id),
      propertyListingId: String(row.property_listing_id),
      eventType: String(row.event_type),
      eventAt: String(row.event_at),
      previousValue: row.previous_value,
      newValue: row.new_value,
      derivationType: String(row.derivation_type),
      notes: row.notes ? String(row.notes) : null,
      presentationClass: row.presentation_class
        ? String(row.presentation_class)
        : null,
      suppressedReason: row.suppressed_reason
        ? String(row.suppressed_reason)
        : null,
      presentationMetadata:
        row.presentation_metadata &&
        typeof row.presentation_metadata === "object" &&
        !Array.isArray(row.presentation_metadata)
          ? (row.presentation_metadata as Record<string, unknown>)
          : null,
    }));
  },
);
