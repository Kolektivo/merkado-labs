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
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
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
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b pb-6 lg:flex-row lg:items-end">
        <div className="max-w-4xl space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge>{titleCase(listing.listingType)}</Badge>
            <Badge variant="outline">{titleCase(listing.propertyType)}</Badge>
            <Badge variant="secondary">{titleCase(listing.status)}</Badge>
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              {listing.title ?? `Listing ${listing.externalId}`}
            </h1>
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="size-4" />
              {listing.neighbourhood?.name ?? "Neighbourhood not specified"}
            </p>
          </div>
          <NeighbourhoodProvenanceBadges
            sourceName={listing.neighbourhood?.name ?? null}
            inferredName={listing.inferredNeighbourhood?.name ?? null}
            status={listing.neighbourhoodAssignmentStatus}
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-end">
          <p className="font-mono text-2xl font-semibold tabular-nums">
            {formatCurrency(listing.currentPrice, listing.currency)}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/listings">
                <ArrowLeft className="size-4" />
                Back
              </Link>
            </Button>
            <Button asChild>
              <a href={sourceLink} target="_blank" rel="noreferrer">
                Open original ad
                <ArrowUpRight className="size-4" />
              </a>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,0.7fr)]">
        <div className="space-y-4">
          {listing.primaryImageUrl ? (
            <div className="relative aspect-[16/7] overflow-hidden rounded-xl border bg-muted">
              <Image
                src={listing.primaryImageUrl}
                alt={listing.title ?? `Listing ${listing.externalId}`}
                fill
                className="object-cover"
                sizes="(max-width: 1280px) 100vw, 65vw"
              />
            </div>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>Property details</CardTitle>
              <CardDescription>
                What we stored from the public listing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
                  label="Area on the website"
                  value={listing.neighbourhood?.name ?? "Not available"}
                />
                <DetailItem
                  label="Area from the map"
                  value={
                    listing.inferredNeighbourhood?.name ?? "Not available"
                  }
                />
                <DetailItem
                  label="Do they agree?"
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
                  label="Reviewed property link"
                  value={
                    listing.propertyAssetId
                      ? "Yes — linked after review"
                      : "Not linked yet"
                  }
                />
                <DetailItem
                  label="Listing status"
                  value={titleCase(listing.status)}
                />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Price over time</CardTitle>
              <CardDescription>
                Prices we recorded each time this listing showed up in a harvest.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {history.length ? (
                <>
                  <PriceHistoryChart data={chartHistory} />
                  <Separator className="my-4" />
                  <div className="space-y-3">
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
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No price history yet — we have only seen this listing once, or
                  without a price.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tracking summary</CardTitle>
              <CardDescription>
                How often we have seen this ad. Original scrape files stay
                private.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
              <Separator />
              <dl className="space-y-4">
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
                      <ShieldCheck className="size-4 text-neutral-500" />
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
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="size-4" />
                Where it came from
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="font-medium">{listing.source.name}</p>
              <a
                href={listing.source.baseUrl}
                target="_blank"
                rel="noreferrer"
                className="block break-all text-sm text-primary hover:underline"
              >
                {listing.source.baseUrl}
              </a>
              <a
                href={listing.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="block text-sm text-muted-foreground hover:text-foreground"
              >
                Open listing on that website
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
