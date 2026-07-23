import "server-only";

import { randomUUID } from "node:crypto";

import { createLabsAdminClient } from "@/lib/supabase/admin";
import { LABS_URL } from "@/lib/supabase/config";
import { convertOriginalToBenchmark } from "@/lib/native-listings/currency";
import {
  buildOwnerAttributes,
  evaluateManualPublicEligibility,
  normalizeFeatureKeys,
  type NativeListingInput,
  validateNativeDraft,
  validateNativePublish,
} from "@/lib/native-listings/validation";
import { NATIVE_LISTING_ORIGIN } from "@/lib/native-listings/constants";

const ACTOR = "labs_admin";

type Action =
  | "publish"
  | "unpublish"
  | "mark_sold"
  | "mark_rented"
  | "republish";

function publicImageUrl(storagePath: string): string {
  return `${LABS_URL}/storage/v1/object/public/listing-images/${storagePath}`;
}

async function appendEvent(
  client: ReturnType<typeof createLabsAdminClient>,
  listingId: string,
  eventType: string,
  previousValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null,
  notes?: string,
) {
  const { error } = await client.from("listing_activity_events").insert({
    property_listing_id: listingId,
    event_type: eventType,
    event_at: new Date().toISOString(),
    previous_value: previousValue,
    new_value: newValue,
    derivation_type: "user_provided",
    confidence: 1,
    notes: notes ?? null,
  });
  if (error) throw new Error(error.message);
}

function materialFields(row: Record<string, unknown>) {
  return {
    title: row.title ?? null,
    listing_type: row.listing_type ?? null,
    real_estate_type: row.real_estate_type ?? null,
    neighbourhood: row.source_neighbourhood_text ?? null,
    bedrooms: row.bedrooms ?? null,
    bathrooms: row.bathrooms ?? null,
    floor_area_m2: row.floor_area_m2 ?? null,
    lot_area_value: row.lot_area_value ?? null,
    lot_area_unit: row.lot_area_unit ?? null,
    description: row.description ?? null,
    contact_method: row.contact_method ?? null,
    contact_value: row.contact_value ?? null,
    features: row.owner_attributes ?? [],
  };
}

function draftToRow(input: NativeListingInput, existing?: Record<string, unknown>) {
  const validation = validateNativeDraft(input);
  if (!validation.ok) {
    throw new Error(validation.errors.join(" "));
  }

  const features = normalizeFeatureKeys(input.features);
  const ownerAttributes = buildOwnerAttributes(features);
  const originalPrice = Number(input.originalPrice);
  const originalCurrency = String(input.originalCurrency).trim().toUpperCase();
  const conversion = convertOriginalToBenchmark(originalPrice, originalCurrency);
  const realEstateType = String(input.realEstateType).trim();
  const now = new Date().toISOString();

  return {
    listing_origin: NATIVE_LISTING_ORIGIN,
    property_source_id: null,
    source_url: null,
    original_realtor_url: null,
    original_realtor_name: null,
    original_realtor_domain: null,
    listing_type: String(input.listingType).trim(),
    // Explicit map: Labs property_type keeps subtype meaning for filters;
    // real_estate_type is the documented production-boundary field.
    property_type: realEstateType,
    real_estate_type: realEstateType,
    title: String(input.title).trim(),
    description: input.description?.trim() || null,
    bedrooms: input.bedrooms ?? null,
    bathrooms: input.bathrooms ?? null,
    floor_area_m2: input.floorAreaM2 ?? null,
    lot_area_value: input.lotAreaValue ?? null,
    lot_area_unit: input.lotAreaUnit?.trim() || null,
    source_neighbourhood_text: String(input.neighbourhood).trim(),
    neighbourhood_assignment_status: "source_only",
    neighbourhood_assignment_method: "source",
    original_price: originalPrice,
    original_currency: originalCurrency,
    current_price: originalPrice,
    currency: originalCurrency,
    benchmark_price_xcg: conversion.benchmarkPriceXcg,
    conversion_method: conversion.conversionMethod,
    conversion_rate: conversion.conversionRate,
    conversion_provider: conversion.conversionProvider,
    conversion_rate_at: conversion.conversionRateAt,
    currency_inferred: false,
    contact_name: input.contactName?.trim() || null,
    contact_method: input.contactMethod?.trim() || null,
    contact_value: input.contactValue?.trim() || null,
    owner_attributes: ownerAttributes,
    amenities: features.map((key, index) => ({
      code: index + 1,
      label: key,
      labelStatus: "mapped",
    })),
    field_provenance: {
      ...(typeof existing?.field_provenance === "object" &&
      existing.field_provenance &&
      !Array.isArray(existing.field_provenance)
        ? existing.field_provenance
        : {}),
      origin: "manual",
      facts: "user_provided",
      updated_at: now,
    },
    enrichment_status: "not_run",
    created_by_actor: ACTOR,
    last_seen_at: now,
  };
}

async function syncImageColumns(
  client: ReturnType<typeof createLabsAdminClient>,
  listingId: string,
) {
  const { data, error } = await client
    .from("listing_images")
    .select("public_url, sort_order, is_primary")
    .eq("property_listing_id", listingId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  const urls = (data ?? []).map((row) => row.public_url as string);
  const primary =
    (data ?? []).find((row) => row.is_primary)?.public_url ?? urls[0] ?? null;
  const { error: updateError } = await client
    .from("property_listings")
    .update({
      primary_image_url: primary,
      image_urls: urls,
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", listingId)
    .eq("listing_origin", NATIVE_LISTING_ORIGIN);
  if (updateError) throw new Error(updateError.message);
  return { urls, primary };
}

async function recomputeEligibility(
  client: ReturnType<typeof createLabsAdminClient>,
  listingId: string,
) {
  const { data, error } = await client
    .from("property_listings")
    .select(
      "status, original_price, title, real_estate_type, listing_type, primary_image_url, contact_method, contact_value",
    )
    .eq("id", listingId)
    .eq("listing_origin", NATIVE_LISTING_ORIGIN)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Native listing not found.");
  const result = evaluateManualPublicEligibility({
    status: data.status,
    originalPrice:
      data.original_price == null ? null : Number(data.original_price),
    title: data.title,
    realEstateType: data.real_estate_type,
    listingType: data.listing_type,
    primaryImageUrl: data.primary_image_url,
    contactMethod: data.contact_method,
    contactValue: data.contact_value,
  });
  const { error: updateError } = await client
    .from("property_listings")
    .update({
      public_eligible: result.eligible,
      public_exclusion_reason: result.reason,
    })
    .eq("id", listingId)
    .eq("listing_origin", NATIVE_LISTING_ORIGIN);
  if (updateError) throw new Error(updateError.message);
  return result;
}

export async function createNativeDraft(input: NativeListingInput) {
  const client = createLabsAdminClient();
  const now = new Date().toISOString();
  const externalId = `manual-${randomUUID()}`;
  const row = {
    ...draftToRow(input),
    external_id: externalId,
    external_id_status: "verified",
    status: "draft",
    public_eligible: false,
    public_exclusion_reason: "not_active",
    first_seen_at: now,
    last_seen_at: now,
    image_urls: [],
    official_alternate_prices: [],
    observation_count: 0,
    price_observation_count: 0,
    consecutive_successful_absences: 0,
  };

  const { data, error } = await client
    .from("property_listings")
    .insert(row)
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await appendEvent(
    client,
    data.id,
    "submitted",
    null,
    { status: "draft", origin: NATIVE_LISTING_ORIGIN },
    "Labs admin native listing submitted as draft.",
  );
  return { id: data.id as string };
}

export async function updateNativeListing(
  listingId: string,
  input: NativeListingInput,
) {
  const client = createLabsAdminClient();
  const { data: existing, error } = await client
    .from("property_listings")
    .select("*")
    .eq("id", listingId)
    .eq("listing_origin", NATIVE_LISTING_ORIGIN)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!existing) throw new Error("Native listing not found.");
  if (["sold", "removed"].includes(existing.status)) {
    throw new Error("Sold or removed listings cannot be edited.");
  }

  const next = draftToRow(input, existing as Record<string, unknown>);
  const prevPrice = existing.original_price == null ? null : Number(existing.original_price);
  const nextPrice = Number(next.original_price);
  const prevCurrency = existing.original_currency;
  const materialBefore = materialFields(existing as Record<string, unknown>);
  const materialAfter = materialFields({ ...existing, ...next });

  const { error: updateError } = await client
    .from("property_listings")
    .update(next)
    .eq("id", listingId)
    .eq("listing_origin", NATIVE_LISTING_ORIGIN);
  if (updateError) throw new Error(updateError.message);

  if (
    prevPrice !== nextPrice ||
    String(prevCurrency ?? "") !== String(next.original_currency ?? "")
  ) {
    await appendEvent(
      client,
      listingId,
      "price_changed",
      { amount: prevPrice, currency: prevCurrency },
      { amount: nextPrice, currency: next.original_currency },
    );
  }

  if (JSON.stringify(materialBefore) !== JSON.stringify(materialAfter)) {
    await appendEvent(
      client,
      listingId,
      "material_field_changed",
      materialBefore,
      materialAfter,
    );
  }

  await recomputeEligibility(client, listingId);
  return { id: listingId };
}

export async function runNativeListingAction(listingId: string, action: Action) {
  const client = createLabsAdminClient();
  const { data: existing, error } = await client
    .from("property_listings")
    .select("*")
    .eq("id", listingId)
    .eq("listing_origin", NATIVE_LISTING_ORIGIN)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!existing) throw new Error("Native listing not found.");

  const now = new Date().toISOString();
  const previousStatus = existing.status;

  if (action === "publish" || action === "republish") {
    const { count, error: imageError } = await client
      .from("listing_images")
      .select("id", { count: "exact", head: true })
      .eq("property_listing_id", listingId);
    if (imageError) throw new Error(imageError.message);

    const publishCheck = validateNativePublish({
      draft: {
        listingType: existing.listing_type,
        title: existing.title,
        realEstateType: existing.real_estate_type,
        neighbourhood: existing.source_neighbourhood_text,
        originalPrice:
          existing.original_price == null ? null : Number(existing.original_price),
        originalCurrency: existing.original_currency,
        bedrooms: existing.bedrooms == null ? null : Number(existing.bedrooms),
        bathrooms: existing.bathrooms == null ? null : Number(existing.bathrooms),
        floorAreaM2:
          existing.floor_area_m2 == null ? null : Number(existing.floor_area_m2),
        lotAreaValue:
          existing.lot_area_value == null ? null : Number(existing.lot_area_value),
        lotAreaUnit: existing.lot_area_unit,
        description: existing.description,
        contactName: existing.contact_name,
        contactMethod: existing.contact_method,
        contactValue: existing.contact_value,
        features: Array.isArray(existing.owner_attributes)
          ? existing.owner_attributes
              .map((item: { key?: string }) => item?.key)
              .filter((key: unknown): key is string => typeof key === "string")
          : [],
      },
      imageCount: count ?? 0,
    });
    if (!publishCheck.ok) {
      throw new Error(publishCheck.errors.join(" "));
    }

    if (action === "publish" && !["draft", "unpublished"].includes(previousStatus)) {
      throw new Error("Only draft or unpublished listings can be published.");
    }
    if (
      action === "republish" &&
      !["unpublished", "sold", "inactive"].includes(previousStatus)
    ) {
      throw new Error("Listing cannot be republished from the current status.");
    }

    const { error: updateError } = await client
      .from("property_listings")
      .update({
        status: "active",
        published_at: existing.published_at ?? now,
        unpublished_at: null,
        sold_at: null,
        source_listing_status: "active",
        last_seen_at: now,
      })
      .eq("id", listingId)
      .eq("listing_origin", NATIVE_LISTING_ORIGIN);
    if (updateError) throw new Error(updateError.message);

    await appendEvent(
      client,
      listingId,
      action === "republish" ? "republished" : "published",
      { status: previousStatus },
      { status: "active" },
    );
  } else if (action === "unpublish") {
    if (previousStatus !== "active") {
      throw new Error("Only active listings can be unpublished.");
    }
    const { error: updateError } = await client
      .from("property_listings")
      .update({
        status: "unpublished",
        unpublished_at: now,
        last_seen_at: now,
      })
      .eq("id", listingId)
      .eq("listing_origin", NATIVE_LISTING_ORIGIN);
    if (updateError) throw new Error(updateError.message);
    await appendEvent(
      client,
      listingId,
      "unpublished",
      { status: previousStatus },
      { status: "unpublished" },
    );
  } else if (action === "mark_sold") {
    if (!["active", "unpublished"].includes(previousStatus)) {
      throw new Error("Only active or unpublished listings can be marked sold.");
    }
    const { error: updateError } = await client
      .from("property_listings")
      .update({
        status: "sold",
        sold_at: now,
        first_observed_sold_at: existing.first_observed_sold_at ?? now,
        source_listing_status: "sold",
        last_seen_at: now,
      })
      .eq("id", listingId)
      .eq("listing_origin", NATIVE_LISTING_ORIGIN);
    if (updateError) throw new Error(updateError.message);
    await appendEvent(
      client,
      listingId,
      "marked_sold",
      { status: previousStatus },
      { status: "sold" },
    );
  } else if (action === "mark_rented") {
    if (!["active", "unpublished"].includes(previousStatus)) {
      throw new Error("Only active or unpublished listings can be marked rented.");
    }
    const { error: updateError } = await client
      .from("property_listings")
      .update({
        status: "inactive",
        first_observed_rented_at: existing.first_observed_rented_at ?? now,
        source_listing_status: "rented",
        last_seen_at: now,
      })
      .eq("id", listingId)
      .eq("listing_origin", NATIVE_LISTING_ORIGIN);
    if (updateError) throw new Error(updateError.message);
    await appendEvent(
      client,
      listingId,
      "marked_rented",
      { status: previousStatus },
      { status: "inactive", source_listing_status: "rented" },
    );
  } else {
    throw new Error("Unsupported action.");
  }

  const eligibility = await recomputeEligibility(client, listingId);
  return { id: listingId, action, eligibility };
}

export async function uploadNativeImages(
  listingId: string,
  files: Array<{ name: string; type: string; bytes: ArrayBuffer }>,
) {
  const client = createLabsAdminClient();
  const { data: listing, error } = await client
    .from("property_listings")
    .select("id")
    .eq("id", listingId)
    .eq("listing_origin", NATIVE_LISTING_ORIGIN)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!listing) throw new Error("Native listing not found.");

  const { data: existingImages, error: existingError } = await client
    .from("listing_images")
    .select("sort_order")
    .eq("property_listing_id", listingId)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (existingError) throw new Error(existingError.message);

  let sortOrder =
    existingImages && existingImages.length > 0
      ? Number(existingImages[0].sort_order) + 1
      : 0;

  const uploaded: Array<{ path: string; url: string; sortOrder: number }> = [];

  for (const file of files) {
    const ext =
      file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${listingId}/${randomUUID()}.${ext}`;
    const { error: uploadError } = await client.storage
      .from("listing-images")
      .upload(path, file.bytes, {
        contentType: file.type,
        upsert: false,
      });
    if (uploadError) throw new Error(uploadError.message);

    const url = publicImageUrl(path);
    const { error: insertError } = await client.from("listing_images").insert({
      property_listing_id: listingId,
      storage_path: path,
      public_url: url,
      sort_order: sortOrder,
      is_primary: sortOrder === 0,
    });
    if (insertError) {
      await client.storage.from("listing-images").remove([path]);
      throw new Error(insertError.message);
    }
    uploaded.push({ path, url, sortOrder });
    sortOrder += 1;
  }

  await syncImageColumns(client, listingId);
  await recomputeEligibility(client, listingId);
  await appendEvent(
    client,
    listingId,
    "material_field_changed",
    null,
    { images_added: uploaded.length },
    "Native listing images updated.",
  );
  return { uploaded };
}

export async function reorderNativeImages(
  listingId: string,
  orderedPaths: string[],
) {
  const client = createLabsAdminClient();
  const { data: listing, error } = await client
    .from("property_listings")
    .select("id")
    .eq("id", listingId)
    .eq("listing_origin", NATIVE_LISTING_ORIGIN)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!listing) throw new Error("Native listing not found.");

  for (const [index, path] of orderedPaths.entries()) {
    const { error: updateError } = await client
      .from("listing_images")
      .update({ sort_order: index, is_primary: index === 0 })
      .eq("property_listing_id", listingId)
      .eq("storage_path", path);
    if (updateError) throw new Error(updateError.message);
  }

  await syncImageColumns(client, listingId);
  await recomputeEligibility(client, listingId);
  return { ok: true };
}

export async function getNativeListing(listingId: string) {
  const client = createLabsAdminClient();
  const { data, error } = await client
    .from("property_listings")
    .select("*")
    .eq("id", listingId)
    .eq("listing_origin", NATIVE_LISTING_ORIGIN)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const { data: images, error: imageError } = await client
    .from("listing_images")
    .select("id, storage_path, public_url, sort_order, is_primary")
    .eq("property_listing_id", listingId)
    .order("sort_order", { ascending: true });
  if (imageError) throw new Error(imageError.message);

  return { listing: data, images: images ?? [] };
}
