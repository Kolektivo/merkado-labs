import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  BedDouble,
  Building2,
  CalendarDays,
  Eye,
  History,
  LandPlot,
  MapPin,
  Maximize2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { DataError } from "@/components/data-error";
import { EffectiveNeighbourhoodBadge } from "@/components/effective-neighbourhood";
import { HelpTip } from "@/components/help-tip";
import { ListingImageGallery } from "@/components/listing-image-gallery";
import { NeighbourhoodProvenanceBadges } from "@/components/neighbourhood-provenance";
import { PriceDisplay } from "@/components/price-display";
import { PriceHistoryChart } from "@/components/price-history-chart";
import { ListingAiChanges } from "@/components/listing-ai-changes";
import {
  describeConversionLabel,
  isCurrentProductionBenchmark,
} from "@/lib/data/price-observations";
import { filterDefaultTimeline } from "@/lib/domain/activity-presentation";
import { resolveEffectiveNeighbourhood } from "@/lib/domain/effective-neighbourhood";
import { buildPriceDisplay } from "@/lib/domain/price-display";
import { buildXcgPriceSeries } from "@/lib/domain/xcg-price-series";
import { resolveListingGalleryUrls } from "@/lib/listing-gallery-urls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  getAiEnrichmentProposalsForListing,
  getListingActivityEvents,
  getListingById,
  getPriceObservations,
} from "@/lib/data/queries";
import { getListingEvidence } from "@/lib/data/listing-detail";
import {
  aiCoverageTone,
  effectiveAttributesFromProposal,
  extractFieldDecisions,
  isOperationalAttentionDecision,
  PROVENANCE_LABELS,
  resolveAiCoverage,
  selectRetainedProposal,
  type ProvenanceKind,
} from "@/lib/enrichment/display";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  titleCase,
} from "@/lib/format";
import {
  ASSIGNMENT_STATUS_LABELS,
  COORDINATE_QUALITY_LABELS,
} from "@/lib/geo/coordinates";
import { StatusBadge } from "@/components/status-badge";
import { listingDetailHref, resolveListingBackNav } from "@/lib/breadcrumbs";
import {
  buildFallbackDisplayTitle,
  resolvePublicDisplayTitle,
} from "@/lib/domain/public-presentation";
import {
  lifecycleLabel,
  lifecycleTone,
  publicVisibilityLabel,
  TIPS,
} from "@/lib/ui-labels";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  from?: string | string[];
  fromId?: string | string[];
  returnTo?: string | string[];
  tab?: string | string[];
}>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  try {
    const listing = await getListingById((await params).id);
    return { title: listing?.title ?? "Listing detail" };
  } catch {
    return { title: "Listing detail" };
  }
}

function DetailItem({
  label,
  value,
  tip,
  tipLabel,
}: {
  label: string;
  value: React.ReactNode;
  tip?: string;
  tipLabel?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/35 p-3">
      <dt className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <span>{label}</span>
        {tip ? <HelpTip label={tipLabel ?? label}>{tip}</HelpTip> : null}
      </dt>
      <dd className="mt-1.5 break-words text-sm font-medium">{value}</dd>
    </div>
  );
}

function ProvenanceLabel({
  kind,
}: {
  kind: ProvenanceKind | "code" | "ai_inferred" | "ai_summarized" | "system";
}) {
  const mapped: ProvenanceKind =
    kind === "code" || kind === "system"
      ? "deterministic"
      : kind === "ai_inferred" || kind === "ai_summarized"
        ? "ai_extracted"
        : kind;
  const entry = PROVENANCE_LABELS[mapped];
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant="outline" className="font-normal">
        {entry.text}
      </Badge>
      <HelpTip label={entry.text}>{entry.tip}</HelpTip>
    </span>
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function activityLabel(eventType: string, sourceName: string) {
  const labels: Record<string, string> = {
    first_seen: `Listing first found on ${sourceName}`,
    listing_first_seen: `Listing first found on ${sourceName}`,
    price_changed: "Asking price changed",
    currency_changed: "Asking currency changed",
    status_changed: "Listing status changed",
    missing_from_source: "Listing was not found in a complete source refresh",
    removed_from_source: "Listing was removed from the source website",
    relisted: "Listing appeared on the source website again",
    benchmark_recalculated: "XCG comparison price updated",
    enrichment_completed: "AI enrichment completed",
    ai_enrichment_completed: "AI enrichment completed",
    source_refresh_completed: "Source refresh completed",
    source_marked_sold: "Source marked listing as sold",
    source_marked_rented: "Source marked listing as rented",
    source_marked_under_contract: "Source marked listing under contract",
    source_returned_active: "Listing returned to active on source",
    source_description_changed: "Source description changed",
  };
  return labels[eventType] ?? titleCase(eventType.replaceAll("_", " "));
}

export default async function ListingDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const query = await searchParams;
  const backNav = resolveListingBackNav({
    from: firstParam(query.from),
    fromId: firstParam(query.fromId),
    returnTo: firstParam(query.returnTo),
  });
  let listing;
  try {
    listing = await getListingById(id);
  } catch (error) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" asChild>
          <Link href={backNav.href}>
            <ArrowLeft className="size-4" />
            {backNav.label}
          </Link>
        </Button>
        <DataError
          message={error instanceof Error ? error.message : "Unknown data error"}
        />
      </div>
    );
  }
  if (!listing) notFound();

  let history;
  let activity;
  let proposals;
  let evidence;
  try {
    [history, activity, proposals, evidence] = await Promise.all([
      getPriceObservations(id),
      getListingActivityEvents(id),
      getAiEnrichmentProposalsForListing(id, 50),
      getListingEvidence(id),
    ]);
  } catch (error) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" asChild>
          <Link href={backNav.href}>
            <ArrowLeft className="size-4" />
            {backNav.label}
          </Link>
        </Button>
        <DataError
          message={error instanceof Error ? error.message : "Unknown data error"}
        />
      </div>
    );
  }

  const sourceLink = listing.originalRealtorUrl ?? listing.sourceUrl;
  // XCG-over-time from material asking changes only (not rate-only moves).
  const chartHistory = buildXcgPriceSeries(history).map((point) => ({
    ...point,
    date: formatDate(point.observedAt),
  }));
  const timelineActivity = filterDefaultTimeline(activity);
  const proposal = selectRetainedProposal(proposals);
  const proposalBody = asRecord(proposal?.proposal);
  const aiCoverage = resolveAiCoverage({
    enrichmentStatus: listing.enrichmentStatus,
    enrichmentLastInputChecksum: listing.enrichmentLastInputChecksum,
    proposalStatus: proposal?.status,
    proposalInputChecksum: proposal?.inputChecksum,
    proposalBody,
  });
  const fieldDecisions = extractFieldDecisions(proposalBody, {
    model: proposal?.model,
    generatedAt: proposal?.generatedAt,
  });
  const attentionCount = fieldDecisions.filter((item) =>
    isOperationalAttentionDecision(item, {
      sourceNeighbourhood: listing.sourceNeighbourhoodText,
      mapNeighbourhood: listing.inferredNeighbourhood?.name ?? null,
    }),
  ).length;
  const appliedAttrs = effectiveAttributesFromProposal(proposalBody);
  const aiNeighbourhoodCandidate =
    typeof proposalBody.neighbourhood_candidate === "string"
      ? proposalBody.neighbourhood_candidate
      : null;
  const aiNeighbourhoodConfidence =
    typeof proposalBody.neighbourhood_candidate_confidence === "number"
      ? proposalBody.neighbourhood_candidate_confidence
      : null;
  const neighbourhoodFieldDecision = fieldDecisions.find(
    (item) => item.key === "neighbourhood_candidate",
  );
  const effectiveNeighbourhood = resolveEffectiveNeighbourhood({
    sourceName: listing.sourceNeighbourhoodText,
    mapName: listing.inferredNeighbourhood?.name ?? null,
    aiCandidateName: aiNeighbourhoodCandidate,
    aiCandidateConfidence: aiNeighbourhoodConfidence,
    aiEvidenceGrounded: neighbourhoodFieldDecision
      ? neighbourhoodFieldDecision.status === "auto_applied"
      : undefined,
  });
  const proposalDisplayTitle =
    typeof proposalBody.display_title === "string"
      ? proposalBody.display_title.trim() || null
      : null;
  const proposalDisplaySummary =
    typeof proposalBody.display_summary === "string"
      ? proposalBody.display_summary.trim() || null
      : typeof proposalBody.concise_summary === "string"
        ? proposalBody.concise_summary.trim() || null
        : null;
  const publicEnglishTitle = resolvePublicDisplayTitle({
    displayTitle: proposalDisplayTitle,
    bedrooms: listing.bedrooms,
    effectivePropertyType: listing.propertyType,
    propertyType: listing.propertyType,
    effectiveNeighbourhood: effectiveNeighbourhood.name,
    listingType: listing.listingType,
    externalId: listing.externalId,
  });
  const deterministicTitle = buildFallbackDisplayTitle({
    bedrooms: listing.bedrooms,
    effectivePropertyType: listing.propertyType,
    propertyType: listing.propertyType,
    effectiveNeighbourhood: effectiveNeighbourhood.name,
    listingType: listing.listingType,
    externalId: listing.externalId,
  });

  const priceDisplay = buildPriceDisplay({
    originalPrice: listing.originalPrice ?? listing.currentPrice,
    originalCurrency: listing.originalCurrency ?? listing.currency,
    benchmarkPriceXcg: listing.benchmarkPriceXcg,
    listingStatus: listing.status,
  });
  const from = firstParam(query.from);
  const fromId = firstParam(query.fromId);
  const returnTo = firstParam(query.returnTo);
  const tabAlias: Record<string, string> = {
    source: "overview",
    ai: "changes",
    evidence: "changes",
  };
  const requestedTab = firstParam(query.tab);
  const normalizedTab = requestedTab
    ? (tabAlias[requestedTab] ?? requestedTab)
    : "overview";
  const availableTabs = new Set(["overview", "changes", "timeline"]);
  const defaultTab = availableTabs.has(normalizedTab)
    ? normalizedTab
    : "overview";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" asChild>
          <Link href={backNav.href}>
            <ArrowLeft data-icon="inline-start" />
            {backNav.label}
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {attentionCount > 0 ? (
            <Button variant="outline" asChild>
              <Link
                href={`${listingDetailHref(id, {
                  from,
                  fromId,
                  returnTo,
                  tab: "changes",
                })}`}
              >
                <Sparkles data-icon="inline-start" />
                {attentionCount} field{attentionCount === 1 ? "" : "s"} need attention
              </Link>
            </Button>
          ) : null}
          <Button asChild>
            <a href={sourceLink} target="_blank" rel="noreferrer">
              Open original ad
              <ArrowUpRight data-icon="inline-end" />
              <span className="sr-only"> (opens in new tab)</span>
            </a>
          </Button>
        </div>
      </div>

      <Card className="gap-0 py-0">
        <div className="grid xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <ListingImageGallery
            images={resolveListingGalleryUrls({
              imageUrls: listing.imageUrls,
              primaryImageUrl: listing.primaryImageUrl,
            })}
            altBase={listing.title ?? `Listing ${listing.externalId}`}
            variant="detail"
            priority
            className="h-full"
            aspectClassName="relative aspect-[4/3] bg-muted sm:aspect-[16/10] xl:h-full xl:min-h-[500px] xl:aspect-auto"
          />
          <div className="flex min-w-0 flex-col justify-between gap-6 p-5 md:p-7">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <Badge>{titleCase(listing.listingType)}</Badge>
                <Badge variant="outline">
                  {titleCase(listing.propertyType)}
                </Badge>
                <StatusBadge tone={lifecycleTone(listing.status)}>
                  {lifecycleLabel(listing.status)}
                </StatusBadge>
                <StatusBadge tone={aiCoverageTone(aiCoverage.category)}>
                  {aiCoverage.label}
                </StatusBadge>
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
                  {listing.title ?? `Listing ${listing.externalId}`}
                </h1>
                <p className="mt-1 text-xs text-muted-foreground">
                  Source title (unchanged). Public English title is resolved
                  separately for Browse.
                </p>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="size-4 shrink-0" />
                  {effectiveNeighbourhood.name ? (
                    <>
                      <span>
                        Neighbourhood:{" "}
                        <span className="font-medium text-foreground">
                          {effectiveNeighbourhood.name}
                        </span>
                      </span>
                      <EffectiveNeighbourhoodBadge
                        effective={effectiveNeighbourhood}
                      />
                    </>
                  ) : (
                    "Neighbourhood not specified"
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-5">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <span>
                    {listing.listingType === "rent"
                      ? "Asking rent"
                      : "Asking price"}
                  </span>
                  <HelpTip
                    label={
                      listing.listingType === "rent"
                        ? TIPS.rentalAmount.label
                        : TIPS.xcgBenchmark.label
                    }
                  >
                    {listing.listingType === "rent"
                      ? TIPS.rentalAmount.tip
                      : TIPS.xcgBenchmark.tip}
                  </HelpTip>
                </div>
                <PriceDisplay model={priceDisplay} size="lg" className="mt-1" />
                {listing.listingType === "rent" ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {listing.pricePeriod
                      ? `Rental period: ${listing.pricePeriod}`
                      : "Rental period not stated by the source"}
                  </p>
                ) : null}
                {listing.benchmarkPriceXcg !== null ? (
                  <details className="mt-3 text-xs text-muted-foreground">
                    <summary className="w-fit cursor-pointer rounded-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      Price calculation details
                    </summary>
                    <p className="mt-1">
                      {describeConversionLabel({
                        conversionMethod: listing.conversionMethod,
                        conversionProvider: listing.conversionProvider,
                        conversionRate: listing.conversionRate,
                        conversionRateAt: listing.conversionRateAt,
                      })}
                      {listing.conversionRateAt
                        ? ` · rate date ${formatDate(listing.conversionRateAt)}`
                        : ""}
                      . The original source price remains authoritative.
                      {!isCurrentProductionBenchmark(listing.conversionProvider)
                        ? " This uses an older test/manual rate until an approved recalculation is imported."
                        : ""}
                    </p>
                  </details>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
                  <StatusBadge
                    tone={listing.publicEligible ? "success" : "warning"}
                  >
                    {publicVisibilityLabel({
                      publicEligible: listing.publicEligible,
                      publicExclusionReason: listing.publicExclusionReason,
                    })}
                  </StatusBadge>
                  <span>
                    {listing.sourceListedAt
                      ? `Posted on website ${formatDate(listing.sourceListedAt)} · `
                      : ""}
                    First seen by Labs {formatDate(listing.firstSeenAt)}
                  </span>
                </div>
              </div>
              <Separator />
              <dl className="grid grid-cols-2 gap-3">
                {listing.bedrooms != null ? (
                  <DetailItem
                    label="Bedrooms"
                    value={
                      <span className="inline-flex items-center gap-2">
                        <BedDouble className="size-4 text-muted-foreground" />
                        {listing.bedrooms}
                      </span>
                    }
                  />
                ) : null}
                {listing.bathrooms != null ? (
                  <DetailItem label="Bathrooms" value={listing.bathrooms} />
                ) : null}
                {listing.floorAreaM2 != null ? (
                  <DetailItem
                    label="Floor area"
                    value={
                      <span className="inline-flex items-center gap-2">
                        <Maximize2 className="size-4 text-muted-foreground" />
                        {formatNumber(listing.floorAreaM2)} m²
                      </span>
                    }
                  />
                ) : null}
                {listing.lotAreaValue !== null ? (
                  <DetailItem
                    label="Lot area"
                    value={
                      <span className="inline-flex items-center gap-2">
                        <LandPlot className="size-4 text-muted-foreground" />
                        {formatNumber(listing.lotAreaValue)}
                        {listing.lotAreaUnit ? ` ${listing.lotAreaUnit}` : ""}
                      </span>
                    }
                  />
                ) : null}
                <DetailItem
                  label="Last seen"
                  value={formatDate(listing.lastSeenAt)}
                />
              </dl>
            </div>
          </div>
        </div>
      </Card>

      <Tabs key={defaultTab} defaultValue={defaultTab} className="gap-4">
        <TabsList variant="line" className="w-full flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="changes">Changes & evidence</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
            <div className="flex min-w-0 flex-col gap-4">
              <Card>
                <CardHeader className="border-b">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>Property information</CardTitle>
                    <ProvenanceLabel kind="source" />
                  </div>
                  <CardDescription>
                    Physical and listing details captured from the public ad.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <DetailItem
                      label="Property type"
                      value={titleCase(listing.propertyType)}
                    />
                    {listing.resort ? (
                      <DetailItem label="Resort / complex" value={listing.resort} />
                    ) : null}
                    {[listing.street, listing.houseNumber].some(Boolean) ? (
                      <DetailItem
                        label="Street"
                        value={[listing.street, listing.houseNumber]
                          .filter(Boolean)
                          .join(" ")}
                      />
                    ) : null}
                    <DetailItem
                      label="Listing status"
                      value={titleCase(listing.status)}
                    />
                    {listing.sourceListingStatus ? (
                      <DetailItem
                        label="Source status"
                        value={titleCase(listing.sourceListingStatus)}
                      />
                    ) : null}
                  </dl>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="border-b">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>Enrichment</CardTitle>
                    <ProvenanceLabel kind="ai_extracted" />
                  </div>
                  <CardDescription>
                    Current effective listing state after automatic enrichment.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <DetailItem
                      label="AI coverage"
                      tip={aiCoverage.tip}
                      tipLabel={TIPS.enrichmentStatus.label}
                      value={aiCoverage.label}
                    />
                    <DetailItem
                      label="Last enriched"
                      value={
                        listing.enrichmentLastRunAt
                          ? formatDateTime(listing.enrichmentLastRunAt)
                          : "Never"
                      }
                    />
                    <DetailItem
                      label="Model"
                      value={proposal?.model ?? "—"}
                    />
                    <DetailItem
                      label="Data completeness"
                      tip={TIPS.completeness.tip}
                      tipLabel={TIPS.completeness.label}
                      value={
                        listing.dataCompletenessScore !== null
                          ? `${Math.round(listing.dataCompletenessScore)}%`
                          : "—"
                      }
                    />
                    <DetailItem
                      label="Fields needing attention"
                      value={attentionCount || "None"}
                    />
                  </dl>
                  {appliedAttrs.length || listing.amenities.length ? (
                    <div className="mt-4 space-y-2">
                      <h3 className="text-sm font-medium">Effective attributes</h3>
                      <div className="flex flex-wrap gap-2">
                        {appliedAttrs.map((attr) => (
                          <Badge key={attr.key} variant="secondary">
                            {titleCase(attr.key)}: {String(attr.value)}
                          </Badge>
                        ))}
                        {listing.amenities.map((amenity) => (
                          <Badge
                            key={`${amenity.code}-${amenity.label ?? "unlabeled"}`}
                            variant={amenity.label ? "outline" : "outline"}
                          >
                            {amenity.label ?? `Code ${amenity.code}`}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="border-b">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>Price over time</CardTitle>
                    <ProvenanceLabel kind="system" />
                  </div>
                  <CardDescription>
                    Only distinct asking amounts. Repeat visits with the same
                    price are folded into one row.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {history.length ? (
                    <div className="flex flex-col gap-4">
                      <PriceHistoryChart data={chartHistory} />
                      <Separator />
                      <div className="flex flex-col gap-3">
                        {history.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-3 text-sm"
                          >
                            <span className="text-muted-foreground">
                              {formatDate(item.observedAt)}
                              {(item.suppressedDuplicateCount ?? 0) > 0
                                ? ` · +${item.suppressedDuplicateCount} same-price rechecks`
                                : ""}
                            </span>
                            <span className="font-mono font-medium">
                              {formatCurrency(item.price, item.currency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No price history yet.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            <aside className="flex flex-col gap-4 xl:sticky xl:top-6">
              <Card>
                <CardHeader className="border-b">
                  <CardTitle>Tracking summary</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border bg-muted/40 p-3">
                      <Eye className="size-4 text-muted-foreground" />
                      <p className="mt-2 font-mono text-xl font-semibold">
                        {listing.observationCount}
                      </p>
                      <p className="text-xs text-muted-foreground">Times seen</p>
                    </div>
                    <div className="rounded-lg border bg-muted/40 p-3">
                      <History className="size-4 text-muted-foreground" />
                      <p className="mt-2 font-mono text-xl font-semibold">
                        {listing.priceObservationCount}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Price records
                      </p>
                    </div>
                  </div>
                  <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <DetailItem
                      label="First seen"
                      value={
                        <span className="inline-flex items-center gap-2">
                          <CalendarDays className="size-4 text-muted-foreground" />
                          {formatDate(listing.firstSeenAt)}
                        </span>
                      }
                    />
                    <DetailItem
                      label="Last seen"
                      value={formatDate(listing.lastSeenAt)}
                    />
                  </dl>
                  <details className="rounded-lg bg-muted/35 p-3 text-sm">
                    <summary className="cursor-pointer font-medium">
                      Technical identity
                    </summary>
                    <dl className="mt-3 grid gap-3">
                      <DetailItem
                        label="Website listing ID"
                        value={
                          <span className="font-mono">#{listing.externalId}</span>
                        }
                      />
                      <DetailItem
                        label="Listing ID confidence"
                        tip="How sure we are that the website’s listing ID is stable and correctly matched over time."
                        tipLabel="listing ID confidence"
                        value={
                          <span className="inline-flex items-center gap-2">
                            <ShieldCheck className="size-4 text-muted-foreground" />
                            {titleCase(listing.externalIdStatus)}
                          </span>
                        }
                      />
                    </dl>
                  </details>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="border-b">
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="size-4" />
                    Source & attribution
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <p className="text-sm leading-relaxed">
                    Collected from {listing.source.name}
                    {listing.originalRealtorName
                      ? `, originally listed by ${listing.originalRealtorName}`
                      : ", original realtor name not found yet"}
                    .
                  </p>
                  <dl className="grid gap-3">
                    <DetailItem
                      label="Collected from"
                      tip="The approved realtor website this listing was imported from."
                      tipLabel="collected from"
                      value={listing.source.name}
                    />
                    <DetailItem
                      label="Original realtor"
                      tip={TIPS.attribution.tip}
                      tipLabel={TIPS.attribution.label}
                      value={listing.originalRealtorName ?? "Realtor not listed"}
                    />
                  </dl>
                </CardContent>
              </Card>
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="changes" className="space-y-4">
          <ListingAiChanges
            proposals={proposals}
            selectedChecksum={proposal?.inputChecksum ?? null}
            sourceNeighbourhoodText={listing.sourceNeighbourhoodText}
            mapNeighbourhoodName={listing.inferredNeighbourhood?.name ?? null}
          />

          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Neighbourhood & map details
            </summary>
            <div className="mt-4 space-y-4">
              <Card>
                <CardHeader className="border-b">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="size-4" />
                      Location & map verification
                    </CardTitle>
                    <ProvenanceLabel kind="system" />
                  </div>
                  <CardDescription>
                    Website location compared with the map pin and inferred
                    area. Effective neighbourhood shown on Overview:{" "}
                    <span className="font-medium text-foreground">
                      {effectiveNeighbourhood.name ?? "Not specified"}
                    </span>{" "}
                    ({effectiveNeighbourhood.label}).
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <NeighbourhoodProvenanceBadges
                    sourceName={listing.neighbourhood?.name ?? null}
                    inferredName={listing.inferredNeighbourhood?.name ?? null}
                    status={listing.neighbourhoodAssignmentStatus}
                  />
                  <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <DetailItem
                      label="Area on website"
                      value={listing.neighbourhood?.name ?? "Not available"}
                    />
                    <DetailItem
                      label="Area from map"
                      value={
                        listing.inferredNeighbourhood?.name ?? "Not available"
                      }
                    />
                    <DetailItem
                      label="AI-suggested area"
                      tip="A neighbourhood AI proposed from the listing text. Only used as a fallback when the website and map do not give a specific area."
                      tipLabel="AI-suggested area"
                      value={
                        effectiveNeighbourhood.aiName ??
                        aiNeighbourhoodCandidate ??
                        "Not available"
                      }
                    />
                    <DetailItem
                      label="Location match"
                      value={
                        ASSIGNMENT_STATUS_LABELS[
                          listing.neighbourhoodAssignmentStatus
                        ]
                      }
                    />
                    <DetailItem
                      label="Map coordinates"
                      value={
                        listing.latitude !== null && listing.longitude !== null
                          ? `${listing.latitude.toFixed(5)}, ${listing.longitude.toFixed(5)}`
                          : "Not available"
                      }
                    />
                    <DetailItem
                      label="Map pin quality"
                      tip={TIPS.coordinateQuality.tip}
                      tipLabel={TIPS.coordinateQuality.label}
                      value={COORDINATE_QUALITY_LABELS[listing.coordinateQuality]}
                    />
                    <DetailItem
                      label="Where the pin came from"
                      value={
                        listing.coordinatesSource
                          ? titleCase(listing.coordinatesSource)
                          : "Not available"
                      }
                    />
                  </dl>
                  {effectiveNeighbourhood.conflict ? (
                    <p className="text-xs text-muted-foreground">
                      The website and map neighbourhoods disagree for this
                      listing; the website value is shown on Overview because
                      an explicit source value always wins.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </details>

          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Source facts & description
            </summary>
            <div className="mt-4 space-y-4">
              <Card>
                <CardHeader className="border-b">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>Source vs public English title</CardTitle>
                  </div>
                  <CardDescription>
                    Source title is preserved. Public Browse prefers AI English
                    title, then a deterministic English fallback.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Source title
                    </p>
                    <p className="mt-1">
                      {listing.title ?? "No source title stored."}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      AI display title
                    </p>
                    <p className="mt-1">
                      {proposalDisplayTitle ??
                        "Not available yet (awaiting English presentation enrichment)."}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Public title used in Browse
                    </p>
                    <p className="mt-1 font-medium">{publicEnglishTitle}</p>
                    {!proposalDisplayTitle ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Deterministic fallback: {deterministicTitle}
                      </p>
                    ) : null}
                  </div>
                  {proposalDisplaySummary ? (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">
                        AI display summary
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {proposalDisplaySummary}
                      </p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="border-b">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>Source description</CardTitle>
                    <ProvenanceLabel kind="source" />
                  </div>
                  <CardDescription>
                    Plain text from the source listing. Never rendered as HTML.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {listing.description ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                      {listing.description}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No source description stored.
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="border-b">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>Source facts</CardTitle>
                    <ProvenanceLabel kind="source" />
                  </div>
                </CardHeader>
                <CardContent>
                  <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <DetailItem
                      label="Original price"
                      value={formatCurrency(
                        listing.originalPrice ?? listing.currentPrice,
                        listing.originalCurrency ?? listing.currency,
                      )}
                    />
                    <DetailItem
                      label="Source listing status"
                      value={
                        listing.sourceListingStatus
                          ? titleCase(listing.sourceListingStatus)
                          : "Not available"
                      }
                    />
                    <DetailItem
                      label="Source URL"
                      value={
                        <a
                          href={listing.sourceUrl}
                          className="break-all underline underline-offset-2"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {listing.sourceUrl}
                          <span className="sr-only"> (opens in new tab)</span>
                        </a>
                      }
                    />
                  </dl>
                </CardContent>
              </Card>
            </div>
          </details>

          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Evidence details (collapsed by default)
            </summary>
            <div className="mt-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Exact supporting snippets live with each AI change above. Raw HTML
                is never rendered. {evidence.length} private snapshot
                {evidence.length === 1 ? "" : "s"} recorded.
              </p>
              <dl className="grid gap-3 sm:grid-cols-2">
                <DetailItem
                  label="Ad text fingerprint"
                  tip={TIPS.evidenceChecksum.tip}
                  tipLabel={TIPS.evidenceChecksum.label}
                  value={
                    <span className="break-all font-mono text-xs">
                      {listing.sourceDescriptionChecksum ?? "Not stored"}
                    </span>
                  }
                />
                <DetailItem
                  label="AI input fingerprint"
                  value={
                    <span className="break-all font-mono text-xs">
                      {listing.enrichmentLastInputChecksum ?? "Not stored"}
                    </span>
                  }
                />
              </dl>
              {evidence.length ? (
                <div className="space-y-3">
                  {evidence.map((item) => (
                    <div key={item.id} className="text-xs text-muted-foreground">
                      <p>
                        {formatDateTime(item.observedAt)} · HTTP{" "}
                        {item.httpStatus ?? "—"} · importer{" "}
                        {item.adapterVersion ?? "—"}
                      </p>
                      <p className="break-all font-mono">
                        Fingerprint {item.sourceSha256}
                      </p>
                      <p>
                        Private evidence:{" "}
                        {item.evidenceStorageBucket && item.evidenceStoragePath
                          ? "stored"
                          : "not stored"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </details>
        </TabsContent>

        <TabsContent value="timeline" className="space-y-4">
          <Card>
            <CardHeader className="border-b">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="flex items-center gap-2">
                  <History className="size-4" />
                  Listing activity
                </CardTitle>
                <ProvenanceLabel kind="system" />
              </div>
              <CardDescription>
                Seller and source activity. Rate-only benchmark updates,
                enrichment, and duplicate import events stay in storage but are
                hidden from this default view.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {timelineActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No seller/source activity events for this listing.
                  {activity.length > 0
                    ? ` (${activity.length} system events suppressed from default view)`
                    : ""}
                </p>
              ) : (
                <ul className="space-y-3">
                  {timelineActivity.map((event) => (
                    <li
                      key={event.id}
                      className="rounded-lg border bg-muted/20 px-3 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">
                          {activityLabel(event.eventType, listing.source.name)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(event.eventAt)}
                        </span>
                      </div>
                      {event.notes ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {event.notes}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
