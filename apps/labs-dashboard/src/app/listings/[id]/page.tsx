import type { Metadata } from "next";
import Image from "next/image";
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
import { HelpTip } from "@/components/help-tip";
import { NeighbourhoodProvenanceBadges } from "@/components/neighbourhood-provenance";
import { PriceHistoryChart } from "@/components/price-history-chart";
import { ProposalReviewControl } from "@/components/proposal-review-control";
import {
  describeConversionLabel,
  isCurrentProductionBenchmark,
} from "@/lib/data/price-observations";
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
  getLatestAiEnrichmentProposal,
  getListingActivityEvents,
  getListingById,
  getPriceObservations,
} from "@/lib/data/queries";
import { getListingEvidence } from "@/lib/data/listing-detail";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  titleCase,
} from "@/lib/format";
import {
  ASSIGNMENT_STATUS_LABELS,
  COORDINATE_QUALITY_LABELS,
} from "@/lib/geo/coordinates";
import { StatusBadge } from "@/components/status-badge";
import {
  enrichmentStatusLabel,
  enrichmentStatusTone,
  lifecycleLabel,
  lifecycleTone,
  publicVisibilityLabel,
  TIPS,
} from "@/lib/ui-labels";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

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
    <div className="min-w-0 rounded-lg border bg-muted/20 p-3">
      <dt className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
  kind:
    | "source"
    | "code"
    | "ai_inferred"
    | "ai_summarized"
    | "system";
}) {
  const labels = {
    source: {
      text: "From website",
      tip: "Copied from the original realtor ad.",
    },
    code: {
      text: "Extracted automatically",
      tip: "Pulled out of the ad by Labs code (not AI).",
    },
    ai_inferred: {
      text: "AI guess",
      tip: "Suggested by AI. Treat as a proposal until a person reviews it.",
    },
    ai_summarized: {
      text: "AI suggestion",
      tip: "AI wrote a suggestion. It does not replace the original ad facts.",
    },
    system: {
      text: "Calculated by Labs",
      tip: "Derived by Labs from other known fields (for example map checks).",
    },
  } as const;
  const entry = labels[kind];
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant="outline" className="font-normal">
        {entry.text}
      </Badge>
      <HelpTip label={entry.text}>{entry.tip}</HelpTip>
    </span>
  );
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export default async function ListingDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  let listing;
  try {
    listing = await getListingById(id);
  } catch (error) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" asChild>
          <Link href="/listings">
            <ArrowLeft className="size-4" />
            Back to listings
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
  let proposal;
  let evidence;
  try {
    [history, activity, proposal, evidence] = await Promise.all([
      getPriceObservations(id),
      getListingActivityEvents(id),
      getLatestAiEnrichmentProposal(id),
      getListingEvidence(id),
    ]);
  } catch (error) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" asChild>
          <Link href="/listings">
            <ArrowLeft className="size-4" />
            Back to listings
          </Link>
        </Button>
        <DataError
          message={error instanceof Error ? error.message : "Unknown data error"}
        />
      </div>
    );
  }

  const sourceLink = listing.originalRealtorUrl ?? listing.sourceUrl;
  const chartHistory = history.map((item) => ({
    date: formatDate(item.observedAt),
    price: item.price,
    currency: item.currency,
  }));
  const proposalBody = asRecord(proposal?.proposal);
  const features = asRecord(proposalBody.features);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" asChild>
          <Link href="/listings">
            <ArrowLeft data-icon="inline-start" />
            Back to listings
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/enrichment">
              <Sparkles data-icon="inline-start" />
              Review AI proposals
            </Link>
          </Button>
          <Button asChild>
            <a href={sourceLink} target="_blank" rel="noreferrer">
              Open original ad
              <ArrowUpRight data-icon="inline-end" />
            </a>
          </Button>
        </div>
      </div>

      <Card className="gap-0 py-0">
        <div className="grid xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <div className="relative min-h-64 bg-muted xl:min-h-[430px]">
            {listing.primaryImageUrl ? (
              <Image
                src={listing.primaryImageUrl}
                alt={listing.title ?? `Listing ${listing.externalId}`}
                fill
                className="object-cover"
                sizes="(max-width: 1280px) 100vw, 55vw"
                priority
                unoptimized
              />
            ) : (
              <div className="flex h-full min-h-64 items-center justify-center text-muted-foreground">
                <Building2 className="size-10" aria-hidden="true" />
                <span className="sr-only">No property image available</span>
              </div>
            )}
          </div>
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
                <StatusBadge
                  tone={enrichmentStatusTone(listing.enrichmentStatus ?? "not_run")}
                >
                  AI: {enrichmentStatusLabel(listing.enrichmentStatus ?? "not_run")}
                </StatusBadge>
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
                  {listing.title ?? `Listing ${listing.externalId}`}
                </h1>
                <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="size-4 shrink-0" />
                  {listing.neighbourhood?.name ??
                    "Neighbourhood not specified"}
                </p>
              </div>
              <NeighbourhoodProvenanceBadges
                sourceName={listing.neighbourhood?.name ?? null}
                inferredName={listing.inferredNeighbourhood?.name ?? null}
                status={listing.neighbourhoodAssignmentStatus}
              />
            </div>

            <div className="flex flex-col gap-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {listing.listingType === "rent"
                    ? "Original asking rent"
                    : "Original asking price"}
                </p>
                <p className="mt-1 font-mono text-3xl font-semibold tabular-nums">
                  {formatCurrency(
                    listing.originalPrice ?? listing.currentPrice,
                    listing.originalCurrency ?? listing.currency,
                  )}
                </p>
                {listing.listingType === "rent" ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Rental amount from the source ad
                    {listing.pricePeriod
                      ? ` · period: ${listing.pricePeriod}`
                      : " · rental period not stated clearly on the source page"}
                    . Not a sale price.
                  </p>
                ) : null}
                {listing.benchmarkPriceXcg !== null ? (
                  <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                    <p className="inline-flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1">
                        Approx. in XCG
                        <HelpTip label={TIPS.xcgBenchmark.label}>
                          {TIPS.xcgBenchmark.tip}
                        </HelpTip>
                      </span>
                      <span className="font-mono tabular-nums text-foreground">
                        {formatCurrency(listing.benchmarkPriceXcg, "XCG")}
                      </span>
                    </p>
                    <p className="text-xs">
                      Conversion method:{" "}
                      {describeConversionLabel({
                        conversionMethod: listing.conversionMethod,
                        conversionProvider: listing.conversionProvider,
                        conversionRate: listing.conversionRate,
                        conversionRateAt: listing.conversionRateAt,
                      })}
                      {listing.conversionRateAt
                        ? isCurrentProductionBenchmark(listing.conversionProvider)
                          ? ` · rate date ${formatDate(listing.conversionRateAt)}`
                          : ` · older test/manual rate from ${formatDate(listing.conversionRateAt)}`
                        : ""}
                      . The original currency on the ad remains the source of
                      truth.
                      {!isCurrentProductionBenchmark(listing.conversionProvider) ? (
                        <>
                          {" "}
                          This comparison still uses a test/manual rate until an
                          approved official recalculation is imported.
                        </>
                      ) : null}
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Approximate XCG comparison price is not available yet.
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
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
                <DetailItem
                  label="Bedrooms"
                  value={
                    <span className="inline-flex items-center gap-2">
                      <BedDouble className="size-4 text-muted-foreground" />
                      {listing.bedrooms ?? "Not available"}
                    </span>
                  }
                />
                <DetailItem
                  label="Floor area"
                  value={
                    <span className="inline-flex items-center gap-2">
                      <Maximize2 className="size-4 text-muted-foreground" />
                      {listing.floorAreaM2
                        ? `${listing.floorAreaM2.toLocaleString()} m²`
                        : "Not available"}
                    </span>
                  }
                />
                <DetailItem
                  label="Lot area"
                  value={
                    <span className="inline-flex items-center gap-2">
                      <LandPlot className="size-4 text-muted-foreground" />
                      {listing.lotAreaValue !== null
                        ? `${listing.lotAreaValue.toLocaleString()}${
                            listing.lotAreaUnit
                              ? ` ${listing.lotAreaUnit}`
                              : ""
                          }`
                        : "Not available"}
                    </span>
                  }
                />
                <DetailItem
                  label="Last seen"
                  value={formatDate(listing.lastSeenAt)}
                />
              </dl>
            </div>
          </div>
        </div>
      </Card>

      <Tabs defaultValue="overview" className="gap-4">
        <TabsList variant="line" className="w-full flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="source">Source data</TabsTrigger>
          {proposal ? <TabsTrigger value="ai">AI review</TabsTrigger> : null}
          {evidence.length ? <TabsTrigger value="evidence">Evidence</TabsTrigger> : null}
          {activity.length ? <TabsTrigger value="timeline">Timeline</TabsTrigger> : null}
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
                    <DetailItem
                      label="Bedrooms"
                      value={listing.bedrooms ?? "Not available"}
                    />
                    <DetailItem
                      label="Bathrooms"
                      value={listing.bathrooms ?? "Not available"}
                    />
                    {listing.listingType === "rent" ? (
                      <DetailItem
                        label="Rental period"
                        value={listing.pricePeriod ?? "Not stated / unclear"}
                      />
                    ) : null}
                    <DetailItem
                      label="Floor area"
                      value={
                        listing.floorAreaM2
                          ? `${listing.floorAreaM2.toLocaleString()} m²`
                          : "Not available"
                      }
                    />
                    <DetailItem
                      label="Lot area"
                      tip="Value taken as written on the website. The unit may be missing or inconsistent across sites."
                      tipLabel="lot area"
                      value={
                        listing.lotAreaValue !== null
                          ? `${listing.lotAreaValue.toLocaleString()}${
                              listing.lotAreaUnit
                                ? ` ${listing.lotAreaUnit}`
                                : " (unit unknown)"
                            }`
                          : "Not available"
                      }
                    />
                    <DetailItem
                      label="Resort / complex"
                      value={listing.resort ?? "Not available"}
                    />
                    <DetailItem
                      label="Street"
                      value={
                        [listing.street, listing.houseNumber]
                          .filter(Boolean)
                          .join(" ") || "Not available"
                      }
                    />
                    <DetailItem
                      label="Listing status"
                      value={titleCase(listing.status)}
                    />
                    <DetailItem
                      label="Source status"
                      value={
                        listing.sourceListingStatus
                          ? titleCase(listing.sourceListingStatus)
                          : "Not available"
                      }
                    />
                  </dl>
                </CardContent>
              </Card>

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
                    Website location compared with the map pin and inferred area.
                  </CardDescription>
                </CardHeader>
                <CardContent>
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
                </CardContent>
              </Card>

              {listing.amenities.length ? (
                <Card>
                  <CardHeader className="border-b">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>Amenities</CardTitle>
                      <ProvenanceLabel kind="code" />
                    </div>
                    <CardDescription>
                      Labels come from source amenity codes when available.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {listing.amenities.map((amenity) => (
                      <Badge
                        key={`${amenity.code}-${amenity.label ?? "unlabeled"}`}
                        variant={amenity.label ? "secondary" : "outline"}
                      >
                        {amenity.label ?? `Code ${amenity.code}`}
                      </Badge>
                    ))}
                  </CardContent>
                </Card>
              ) : null}

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
                  <dl className="grid gap-3">
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

        <TabsContent value="source" className="space-y-4">
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
                  label="First observed sold"
                  value={
                    listing.firstObservedSoldAt
                      ? formatDateTime(listing.firstObservedSoldAt)
                      : "—"
                  }
                />
                <DetailItem
                  label="First observed rented"
                  value={
                    listing.firstObservedRentedAt
                      ? formatDateTime(listing.firstObservedRentedAt)
                      : "—"
                  }
                />
                <DetailItem
                  label="First observed under contract"
                  value={
                    listing.firstObservedUnderContractAt
                      ? formatDateTime(listing.firstObservedUnderContractAt)
                      : "—"
                  }
                />
                <DetailItem
                  label="Source status date"
                  value={
                    listing.sourceStatusDate
                      ? formatDate(listing.sourceStatusDate)
                      : "—"
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
                    </a>
                  }
                />
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="space-y-4">
          <Card>
            <CardHeader className="border-b">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>AI enrichment proposal</CardTitle>
                    <ProvenanceLabel kind="ai_summarized" />
                  </div>
                  <CardDescription>
                    AI suggestions never change the website’s price, currency,
                    status, dates, coordinates, or address.
                  </CardDescription>
                </div>
                <Button variant="outline" asChild>
                  <Link href="/enrichment">
                    <Sparkles data-icon="inline-start" />
                    Open suggestion queue
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <DetailItem
                  label="AI status"
                  tip={TIPS.enrichmentStatus.tip}
                  tipLabel={TIPS.enrichmentStatus.label}
                  value={enrichmentStatusLabel(
                    listing.enrichmentStatus ?? "not_run",
                  )}
                />
                <DetailItem
                  label="Last AI run"
                  value={
                    listing.enrichmentLastRunAt
                      ? formatDateTime(listing.enrichmentLastRunAt)
                      : "Never"
                  }
                />
                <DetailItem
                  label="Input fingerprint"
                  tip="Technical fingerprint of the text AI was given. Used to avoid re-running when nothing changed."
                  tipLabel="input fingerprint"
                  value={
                    <span className="break-all font-mono text-xs">
                      {listing.enrichmentLastInputChecksum ?? "—"}
                    </span>
                  }
                />
              </dl>

              {!proposal ? (
                <p className="text-sm text-muted-foreground">
                  No AI suggestion yet for this listing.
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge>
                      {titleCase(proposal.status.replaceAll("_", " "))}
                    </Badge>
                    <Badge variant="outline">{proposal.model}</Badge>
                    <Badge variant="secondary">{proposal.promptVersion}</Badge>
                    <Badge variant="outline">
                      Review:{" "}
                      {titleCase(proposal.reviewStatus.replaceAll("_", " "))}
                    </Badge>
                    {proposal.confidence !== null ? (
                      <Badge variant="outline">
                        Confidence {(proposal.confidence * 100).toFixed(0)}%
                      </Badge>
                    ) : null}
                  </div>

                  {proposal.errorMessage ? (
                    <p className="text-sm text-destructive">
                      {proposal.errorMessage}
                    </p>
                  ) : null}
                  <ProposalReviewControl
                    proposalId={proposal.id}
                    initialStatus={proposal.reviewStatus}
                    initialNotes={proposal.reviewNotes}
                  />

                  {proposalBody.concise_summary ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium">Concise summary</h3>
                        <ProvenanceLabel kind="ai_summarized" />
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                        {String(proposalBody.concise_summary)}
                      </p>
                    </div>
                  ) : null}

                  {proposalBody.ai_description ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium">AI description</h3>
                        <ProvenanceLabel kind="ai_summarized" />
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                        {String(proposalBody.ai_description)}
                      </p>
                    </div>
                  ) : null}

                  <dl className="grid gap-3 sm:grid-cols-2">
                    <DetailItem
                      label="Neighbourhood candidate"
                      value={
                        <span className="inline-flex flex-wrap items-center gap-2">
                          {proposalBody.neighbourhood_candidate
                            ? String(proposalBody.neighbourhood_candidate)
                            : "—"}
                          <ProvenanceLabel kind="ai_inferred" />
                        </span>
                      }
                    />
                    <DetailItem
                      label="Property type candidate"
                      value={
                        proposalBody.normalized_property_type_candidate
                          ? String(
                              proposalBody.normalized_property_type_candidate,
                            )
                          : "—"
                      }
                    />
                    <DetailItem
                      label="Key strengths"
                      value={
                        asStringList(proposalBody.key_strengths).join(" · ") ||
                        "—"
                      }
                    />
                    <DetailItem
                      label="Trade-offs"
                      value={
                        asStringList(proposalBody.trade_offs).join(" · ") || "—"
                      }
                    />
                    <DetailItem
                      label="Missing important fields"
                      value={
                        asStringList(
                          proposalBody.missing_important_fields,
                        ).join(" · ") || "—"
                      }
                    />
                    <DetailItem
                      label="Fields needing review"
                      value={
                        asStringList(
                          proposalBody.fields_requiring_human_review,
                        ).join(" · ") || "—"
                      }
                    />
                  </dl>

                  {Object.keys(features).length ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium">Feature assessments</h3>
                        <ProvenanceLabel kind="ai_inferred" />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(features).map(([key, raw]) => {
                          const assessment = asRecord(raw);
                          return (
                            <Badge key={key} variant="secondary">
                              {titleCase(key)}:{" "}
                              {titleCase(String(assessment.value ?? "unknown"))}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="evidence" className="space-y-4">
          <Card>
            <CardHeader className="border-b">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>Proof from the original ad</CardTitle>
                <ProvenanceLabel kind="source" />
              </div>
              <CardDescription>
                We keep a private fingerprint of what the website said. Raw HTML
                files stay admin-only and are never shown here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="rounded-lg border border-dashed bg-muted/20 p-3 text-sm text-muted-foreground">
                {evidence.length} private snapshot
                {evidence.length === 1 ? "" : "s"} of the original ad are
                recorded. Raw files are not opened in this dashboard.
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
                  tip="Technical fingerprint of the text last sent to AI for this listing."
                  tipLabel="AI input fingerprint"
                  value={
                    <span className="break-all font-mono text-xs">
                      {listing.enrichmentLastInputChecksum ?? "Not stored"}
                    </span>
                  }
                />
              </dl>
              {listing.description ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">
                    Description stored from the website
                  </h3>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {listing.description}
                  </p>
                </div>
              ) : null}
              {evidence.length ? (
                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Technical details (for engineers)
                  </summary>
                  <div className="mt-3 space-y-3">
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
                          Private evidence: {item.evidenceStorageBucket && item.evidenceStoragePath ? "stored" : "not stored"}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </CardContent>
          </Card>
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
                History of notable changes Labs recorded for this listing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No activity events yet for this listing.
                </p>
              ) : (
                <ul className="space-y-3">
                  {activity.map((event) => (
                    <li
                      key={event.id}
                      className="rounded-lg border bg-muted/20 px-3 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">
                          {titleCase(event.eventType.replaceAll("_", " "))}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(event.eventAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {titleCase(event.derivationType.replaceAll("_", " "))}
                        {event.notes ? ` · ${event.notes}` : ""}
                      </p>
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
