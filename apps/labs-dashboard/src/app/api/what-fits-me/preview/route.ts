import { NextResponse } from "next/server";

import { AdminAuthError, assertLabsAdminSession } from "@/lib/admin/auth";
import { criteriaFromBody } from "@/lib/matching/criteria-from-body";
import { parsePropertySearchText } from "@/lib/matching/parse-property-search";
import { runPublicMatchPreview } from "@/lib/matching/run-public-match";
import { formatXcgPrimary } from "@/lib/domain/price-display";

export const runtime = "nodejs";

function serializeMatch(
  match: Awaited<ReturnType<typeof runPublicMatchPreview>>["matches"][number],
) {
  const price =
    match.listing.benchmarkPriceXcg !== null
      ? formatXcgPrimary(match.listing.benchmarkPriceXcg)
      : "XCG unavailable";
  const foreign =
    match.listing.originalPrice !== null &&
    match.listing.originalCurrency &&
    !["XCG", "ANG", "NAF"].includes(
      match.listing.originalCurrency.toUpperCase(),
    )
      ? `${match.listing.originalCurrency} ${Math.round(match.listing.originalPrice).toLocaleString("en")}`
      : null;

  return {
    listingId: match.listingId,
    externalId: match.listing.externalId,
    title: match.listing.title,
    matchLabel: match.matchLabel,
    matchScore: match.matchScore,
    matchReasons: match.matchReasons,
    tradeOffs: match.tradeOffs,
    missingInformation: match.missingInformation,
    neighbourhood: match.listing.neighbourhoodText,
    bedrooms: match.listing.bedrooms,
    bathrooms: match.listing.bathrooms,
    propertyType: match.listing.propertyType,
    listingType: match.listing.listingType,
    priceXcgLabel: price,
    foreignPriceLabel: foreign,
    sourceDisplayName: match.listing.sourceDisplayName,
    primaryImageUrl: match.listing.primaryImageUrl,
    passportHref: `/browse/${match.listingId}`,
  };
}

export async function POST(request: Request) {
  try {
    assertLabsAdminSession(request);
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    const text = typeof body.text === "string" ? body.text.trim() : "";
    const hasCriteria =
      body.criteria && typeof body.criteria === "object" && !Array.isArray(body.criteria);

    const criteria = hasCriteria
      ? criteriaFromBody(body.criteria as Record<string, unknown>)
      : parsePropertySearchText(text);

    if (!hasCriteria && !text) {
      return NextResponse.json(
        { error: "Describe what you are looking for." },
        { status: 400 },
      );
    }

    const limitRaw = Number(body.limit);
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(25, Math.floor(limitRaw))
        : 5;

    const preview = await runPublicMatchPreview(criteria, { limit });

    return NextResponse.json({
      criteria: preview.criteria,
      inventoryCount: preview.inventoryCount,
      matchCount: preview.matchCount,
      matches: preview.matches.map(serializeMatch),
      adjustmentSuggestions: preview.adjustmentSuggestions,
    });
  } catch (error) {
    const status = error instanceof AdminAuthError ? error.status : 400;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to preview matches.",
      },
      { status },
    );
  }
}
