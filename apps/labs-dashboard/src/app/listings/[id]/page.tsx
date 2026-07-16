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
} from "lucide-react";

import { DataError } from "@/components/data-error";
import { NeighbourhoodProvenanceBadges } from "@/components/neighbourhood-provenance";
import { PriceHistoryChart } from "@/components/price-history-chart";
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
  getListingById,
  getPriceObservations,
} from "@/lib/data/queries";
import {
  formatCurrency,
  formatDate,
  titleCase,
} from "@/lib/format";
import {
  ASSIGNMENT_STATUS_LABELS,
  COORDINATE_QUALITY_LABELS,
} from "@/lib/geo/coordinates";

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
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/20 p-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1.5 break-words text-sm font-medium">{value}</dd>
    </div>
  );
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
  try {
    history = await getPriceObservations(id);
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" asChild>
          <Link href="/listings">
            <ArrowLeft data-icon="inline-start" />
            Back to listings
          </Link>
        </Button>
        <Button asChild>
          <a href={sourceLink} target="_blank" rel="noreferrer">
            Open original ad
            <ArrowUpRight data-icon="inline-end" />
          </a>
        </Button>
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
                <Badge variant="secondary">{titleCase(listing.status)}</Badge>
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
                  Asking price
                </p>
                <p className="mt-1 font-mono text-3xl font-semibold tabular-nums">
                  {formatCurrency(listing.currentPrice, listing.currency)}
                </p>
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

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Property information</CardTitle>
              <CardDescription>
                The physical and listing details captured from the public ad.
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
                  label="Floor area"
                  value={
                    listing.floorAreaM2
                      ? `${listing.floorAreaM2.toLocaleString()} m²`
                      : "Not available"
                  }
                />
                <DetailItem
                  label="Lot area (raw)"
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
              <CardTitle className="flex items-center gap-2">
                <MapPin className="size-4" />
                Location & map verification
              </CardTitle>
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
                  label="Pin quality"
                  value={COORDINATE_QUALITY_LABELS[listing.coordinateQuality]}
                />
                <DetailItem
                  label="Coordinates source"
                  value={listing.coordinatesSource ?? "Not available"}
                />
              </dl>
            </CardContent>
          </Card>

          {listing.amenities.length ? (
            <Card>
              <CardHeader className="border-b">
                <CardTitle>Amenities</CardTitle>
                <CardDescription>
                  Labels come from CaribbeanHouseHunt map filters. Unlabeled
                  codes are shown by number only.
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

          {listing.description ? (
            <Card>
              <CardHeader className="border-b">
                <CardTitle>Description</CardTitle>
                <CardDescription>
                  Text captured from the CaribbeanHouseHunt bulk payload.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {listing.description}
                </p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="border-b">
              <CardTitle>Price over time</CardTitle>
              <CardDescription>
                Prices recorded each time this listing appeared in a harvest.
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
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-muted-foreground">
                          {formatDate(item.observedAt)}
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
                  No price history yet — we have only seen this listing once, or
                  without a price.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="flex flex-col gap-4 xl:sticky xl:top-6">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Tracking summary</CardTitle>
              <CardDescription>
                How often this ad has appeared in our harvests.
              </CardDescription>
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
                  <p className="text-xs text-muted-foreground">Price records</p>
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
                  label="ID confidence"
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
              <CardTitle>Data quality</CardTitle>
              <CardDescription>
                Review and completeness signals for this record.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3">
                <DetailItem
                  label="Reviewed property link"
                  value={
                    listing.propertyAssetId
                      ? "Yes — linked after review"
                      : "Not linked yet"
                  }
                />
                <DetailItem
                  label="Data completeness"
                  value={
                    listing.dataCompletenessScore !== null
                      ? `${listing.dataCompletenessScore}%`
                      : "Not available"
                  }
                />
                <DetailItem
                  label="Source conflicts"
                  value={
                    listing.unresolvedConflictCount > 0
                      ? `${listing.unresolvedConflictCount} unresolved`
                      : "None recorded"
                  }
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
              <CardDescription>
                Where the listing came from and who originally published it.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm leading-relaxed">
                Found via {listing.source.name}
                {listing.originalRealtorName
                  ? `, originally listed by ${listing.originalRealtorName}`
                  : ", original realtor not attributed yet"}
                .
              </p>
              <dl className="grid gap-3">
                <DetailItem label="Aggregator" value={listing.source.name} />
                <DetailItem
                  label="Original realtor"
                  value={listing.originalRealtorName ?? "Missing attribution"}
                />
                <DetailItem
                  label="Realtor domain"
                  value={listing.originalRealtorDomain ?? "Not available"}
                />
                <DetailItem
                  label="Attribution method"
                  value={listing.attributionMethod ?? "Not available"}
                />
                <DetailItem
                  label="Attribution observed"
                  value={
                    listing.attributionObservedAt
                      ? formatDate(listing.attributionObservedAt)
                      : "Not available"
                  }
                />
              </dl>
              <Separator />
              <div className="flex flex-col items-start gap-1">
                <Button variant="link" className="h-auto px-0" asChild>
                  <a
                    href={listing.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open CaribbeanHouseHunt map
                    <ArrowUpRight data-icon="inline-end" />
                  </a>
                </Button>
                {listing.originalRealtorUrl ? (
                  <Button
                    variant="link"
                    className="h-auto max-w-full justify-start px-0"
                    asChild
                  >
                    <a
                      href={listing.originalRealtorUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open original realtor listing
                      <ArrowUpRight data-icon="inline-end" />
                    </a>
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No original realtor URL stored.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
