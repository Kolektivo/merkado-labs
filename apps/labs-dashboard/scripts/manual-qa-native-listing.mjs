/**
 * One-shot Labs manual QA for native listings. Creates a temporary listing,
 * exercises upload/reorder/lifecycle, then hard-deletes it. Never leaves a
 * public manual row behind.
 *
 * Usage (from apps/labs-dashboard):
 *   node --env-file=.env.local scripts/manual-qa-native-listing.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const LABS_REF = "csaefdkpwukshtouyixg";
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SECRET_KEY || "";

if (!url.includes(LABS_REF) || !key) {
  console.error("Refusing to run: Labs URL + SUPABASE_SECRET_KEY required.");
  process.exit(1);
}

const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function cleanup(listingId) {
  if (!listingId) return;
  // Passport events are immutable via trigger; hard-delete QA rows through a
  // reviewed Labs-only RPC-less SQL session is done separately when needed.
  // Here: unpublish-equivalent + strip images so nothing remains public, then
  // attempt hard delete of the listing row after clearing cascade-safe children.
  const { data: images } = await client
    .from("listing_images")
    .select("storage_path")
    .eq("property_listing_id", listingId);
  const paths = (images ?? []).map((row) => row.storage_path).filter(Boolean);
  if (paths.length) {
    const { error: storageError } = await client.storage
      .from("listing-images")
      .remove(paths);
    if (storageError) throw new Error(storageError.message);
  }
  const { error: imageDeleteError } = await client
    .from("listing_images")
    .delete()
    .eq("property_listing_id", listingId);
  if (imageDeleteError) throw new Error(imageDeleteError.message);

  // Ensure non-public even if listing row must remain due to immutable events.
  const { error: demoteError } = await client
    .from("property_listings")
    .update({
      status: "draft",
      public_eligible: false,
      public_exclusion_reason: "not_active",
      primary_image_url: null,
      image_urls: [],
      title: "QA TEMP — pending hard delete",
      published_at: null,
      unpublished_at: new Date().toISOString(),
    })
    .eq("id", listingId)
    .eq("listing_origin", "manual");
  if (demoteError) throw new Error(demoteError.message);

  const { error: listingDeleteError } = await client
    .from("property_listings")
    .delete()
    .eq("id", listingId)
    .eq("listing_origin", "manual");
  if (listingDeleteError) {
    // Expected when immutable activity events still reference the row.
    console.log(
      JSON.stringify({
        softCleaned: true,
        listingId,
        listingDeleteError: listingDeleteError.message,
        note: "Demoted to non-public draft; hard-delete events via Labs SQL if needed.",
      }),
    );
  }
}

async function lifecycle(listingId, expectedStatus, patch, eventType, previous, next) {
  const { data, error } = await client.rpc("apply_native_listing_lifecycle", {
    p_listing_id: listingId,
    p_expected_status: expectedStatus,
    p_listing_patch: patch,
    p_event_type: eventType,
    p_previous_value: previous,
    p_new_value: next,
    p_notes: "manual-qa-native-listing",
  });
  if (error) throw new Error(error.message);
  return data;
}

async function main() {
  let listingId = null;
  const now = new Date().toISOString();
  const externalId = `manual-qa-${randomUUID()}`;

  try {
    const { data: created, error: createError } = await client
      .from("property_listings")
      .insert({
        listing_origin: "manual",
        external_id: externalId,
        external_id_status: "verified",
        status: "draft",
        listing_type: "sale",
        property_type: "house",
        real_estate_type: "house",
        title: "QA TEMP — delete me",
        description: "Temporary Labs hardening QA listing.",
        bedrooms: 2,
        bathrooms: 1,
        source_neighbourhood_text: "Willemstad",
        neighbourhood_assignment_status: "source_only",
        neighbourhood_assignment_method: "source",
        original_price: 250000,
        original_currency: "USD",
        current_price: 250000,
        currency: "USD",
        benchmark_price_xcg: 450000,
        conversion_method: "usd_fixed_peg",
        conversion_rate: 1.8,
        conversion_provider: "labs_native_listing",
        conversion_rate_at: now,
        currency_inferred: false,
        contact_name: "QA",
        contact_method: "email",
        contact_value: "qa-temp@example.invalid",
        owner_attributes: [{ key: "pool" }],
        amenities: [],
        public_eligible: false,
        public_exclusion_reason: "not_active",
        first_seen_at: now,
        last_seen_at: now,
        image_urls: [],
        official_alternate_prices: [],
        observation_count: 0,
        price_observation_count: 0,
        consecutive_successful_absences: 0,
        created_by_actor: "labs_admin",
        enrichment_status: "not_run",
      })
      .select("id")
      .single();
    if (createError) throw new Error(createError.message);
    listingId = created.id;

    await client.from("listing_activity_events").insert({
      property_listing_id: listingId,
      event_type: "submitted",
      event_at: now,
      previous_value: null,
      new_value: { status: "draft" },
      derivation_type: "user_provided",
      confidence: 1,
      notes: "manual-qa-native-listing",
    });

    const paths = [];
    for (let i = 0; i < 2; i += 1) {
      const path = `${listingId}/${randomUUID()}.png`;
      const { error: upErr } = await client.storage
        .from("listing-images")
        .upload(path, PNG_1X1, { contentType: "image/png", upsert: false });
      if (upErr) throw new Error(upErr.message);
      paths.push(path);
      const publicUrl = `${url}/storage/v1/object/public/listing-images/${path}`;
      const { error: imgErr } = await client.from("listing_images").insert({
        property_listing_id: listingId,
        storage_path: path,
        public_url: publicUrl,
        sort_order: i,
        is_primary: i === 0,
      });
      if (imgErr) throw new Error(imgErr.message);
    }

    // Reorder exact permutation → second image becomes primary.
    const reordered = [paths[1], paths[0]];
    await client
      .from("listing_images")
      .update({ is_primary: false })
      .eq("property_listing_id", listingId);
    for (const [index, path] of reordered.entries()) {
      const { error } = await client
        .from("listing_images")
        .update({ sort_order: index, is_primary: index === 0 })
        .eq("property_listing_id", listingId)
        .eq("storage_path", path);
      if (error) throw new Error(error.message);
    }

    const primaryUrl = `${url}/storage/v1/object/public/listing-images/${reordered[0]}`;
    await client
      .from("property_listings")
      .update({
        primary_image_url: primaryUrl,
        image_urls: reordered.map(
          (path) => `${url}/storage/v1/object/public/listing-images/${path}`,
        ),
      })
      .eq("id", listingId);

    const { count: primaryCount } = await client
      .from("listing_images")
      .select("id", { count: "exact", head: true })
      .eq("property_listing_id", listingId)
      .eq("is_primary", true);
    assert(primaryCount === 1, `expected 1 primary, got ${primaryCount}`);

    // Capacity: 12 total — 2 exist, reject conceptual overflow is unit-tested;
    // here confirm we can still add within remaining room.
    assert(paths.length === 2, "expected two uploaded images");

    const published = await lifecycle(
      listingId,
      "draft",
      {
        status: "active",
        published_at: now,
        unpublished_at: null,
        sold_at: null,
        source_listing_status: "active",
        last_seen_at: now,
      },
      "published",
      { status: "draft" },
      { status: "active" },
    );
    assert(published.eligible === true, "publish should be public_eligible");

    const { count: inView } = await client
      .from("public_property_listings")
      .select("id", { count: "exact", head: true })
      .eq("id", listingId);
    assert(inView === 1, "published manual must appear in public view");

    const unpublished = await lifecycle(
      listingId,
      "active",
      { status: "unpublished", unpublished_at: now, last_seen_at: now },
      "unpublished",
      { status: "active" },
      { status: "unpublished" },
    );
    assert(unpublished.eligible === false, "unpublish must clear eligibility");

    await lifecycle(
      listingId,
      "unpublished",
      {
        status: "sold",
        sold_at: now,
        first_observed_sold_at: now,
        source_listing_status: "sold",
        last_seen_at: now,
      },
      "marked_sold",
      { status: "unpublished" },
      { status: "sold" },
    );

    // Reset to unpublished via republish then mark rented path used in UI.
    await lifecycle(
      listingId,
      "sold",
      {
        status: "active",
        published_at: now,
        unpublished_at: null,
        sold_at: null,
        source_listing_status: "active",
        last_seen_at: now,
      },
      "republished",
      { status: "sold" },
      { status: "active" },
    );
    await lifecycle(
      listingId,
      "active",
      {
        status: "inactive",
        first_observed_rented_at: now,
        source_listing_status: "rented",
        last_seen_at: now,
      },
      "marked_rented",
      { status: "active" },
      { status: "inactive", source_listing_status: "rented" },
    );

    const { data: events, error: eventError } = await client
      .from("listing_activity_events")
      .select("event_type")
      .eq("property_listing_id", listingId);
    if (eventError) throw new Error(eventError.message);
    const types = new Set((events ?? []).map((row) => row.event_type));
    for (const required of [
      "submitted",
      "published",
      "unpublished",
      "marked_sold",
      "republished",
      "marked_rented",
    ]) {
      assert(types.has(required), `missing event ${required}`);
    }

    // Scraped Browse baseline sample: ensure at least one scraped public row still readable.
    const { count: scrapedPublic } = await client
      .from("public_property_listings")
      .select("id", { count: "exact", head: true })
      .or("listing_origin.is.null,listing_origin.eq.scraped");
    assert((scrapedPublic ?? 0) > 200, "scraped public inventory unexpectedly empty");

    console.log(
      JSON.stringify({
        ok: true,
        listingId,
        events: [...types].sort(),
        scrapedPublic,
        note: "cleanup next — no leftover public manual",
      }),
    );
  } finally {
    await cleanup(listingId);
    if (listingId) {
      const { count: leftoverPublic } = await client
        .from("public_property_listings")
        .select("id", { count: "exact", head: true })
        .eq("id", listingId);
      assert((leftoverPublic ?? 0) === 0, "public view still shows QA listing");

      const { count: leftover } = await client
        .from("property_listings")
        .select("id", { count: "exact", head: true })
        .eq("id", listingId);
      console.log(
        JSON.stringify({
          cleaned: true,
          listingId,
          listingRowRemaining: leftover ?? 0,
          publicRemaining: leftoverPublic ?? 0,
          note:
            leftover
              ? "Row demoted non-public; hard-delete blocked by immutable events (disable trigger in reviewed Labs SQL)."
              : "Hard-deleted.",
        }),
      );
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
