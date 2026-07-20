import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FlaskConical } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PriceDisplay } from "@/components/price-display";
import { getPublicListingById } from "@/lib/data/public-listings";
import { buildPriceDisplay } from "@/lib/domain/price-display";
import {
  groupPublicAttributes,
  publicAttributeChipLabel,
} from "@/lib/domain/public-attributes";
import { formatDateTime, titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";
type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FILTER_KEYS = [
  "type",
  "source",
  "neighbourhood",
  "propertyType",
  "bedrooms",
  "minPrice",
  "maxPrice",
  "furnished",
  "gated_community",
  "parking",
  "air_conditioning",
] as const;

function browseBackHref(
  params: Record<string, string | string[] | undefined>,
) {
  const query = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value) query.set(key, value);
  }
  const search = query.toString();
  return search ? `/browse?${search}` : "/browse";
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const listing = await getPublicListingById((await params).id).catch(() => null);
  return { title: listing?.title ?? "Property" };
}

export default async function PublicListingPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const listing = await getPublicListingById((await params).id);
  if (!listing) notFound();
  const backHref = browseBackHref(await searchParams);
  const featureGroups = groupPublicAttributes(listing.publicAttributes);
  const propertyType =
    listing.effectivePropertyType ?? listing.propertyType ?? null;
  const displayDescription = listing.displayDescription;
  const missingOptional = [
    listing.bedrooms == null,
    listing.bathrooms == null,
    listing.floorAreaM2 == null,
  ].filter(Boolean).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6 overflow-x-hidden">
      <Button variant="ghost" asChild>
        <Link href={backHref}>Back to browse</Link>
      </Button>
      <Alert>
        <FlaskConical className="size-4" />
        <AlertTitle>Experimental Labs Passport preview</AlertTitle>
        <AlertDescription>
          Not live on merkado.cw. This page uses only the public-safe listing
          projection and is not proof of ownership, value, or sale.
        </AlertDescription>
      </Alert>

      <Card className="overflow-hidden py-0">
        <div className="relative h-72 bg-muted">
          {listing.primaryImageUrl ? (
            <Image
              src={listing.primaryImageUrl}
              alt={listing.title ?? "Property"}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 896px"
              priority
              unoptimized
            />
          ) : null}
        </div>
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap gap-2">
            <Badge>{titleCase(listing.listingType)}</Badge>
            <Badge variant="outline">{listing.sourceDisplayName}</Badge>
            {propertyType ? (
              <Badge variant="secondary">{titleCase(propertyType)}</Badge>
            ) : null}
          </div>
          <h1 className="text-2xl font-semibold">
            {listing.title ?? `Property ${listing.externalId}`}
          </h1>
          <PriceDisplay
            model={buildPriceDisplay({
              originalPrice: listing.originalPrice,
              originalCurrency: listing.originalCurrency,
              benchmarkPriceXcg: listing.benchmarkPriceXcg,
            })}
            size="lg"
          />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {listing.effectiveNeighbourhood ? (
              <span className="min-w-0 max-w-full truncate">
                {listing.effectiveNeighbourhood}
                {listing.effectiveNeighbourhoodProvenanceLabel ? (
                  <span className="text-xs">
                    {" "}
                    · {listing.effectiveNeighbourhoodProvenanceLabel}
                  </span>
                ) : null}
              </span>
            ) : null}
            {listing.bedrooms != null ? (
              <span>{listing.bedrooms} bedrooms</span>
            ) : null}
            {listing.bathrooms != null ? (
              <span>{listing.bathrooms} bathrooms</span>
            ) : null}
            {listing.floorAreaM2 != null ? (
              <span>{listing.floorAreaM2} m² floor</span>
            ) : null}
            {listing.lotAreaValue != null ? (
              <span>
                {listing.lotAreaValue}
                {listing.lotAreaUnit ? ` ${listing.lotAreaUnit}` : ""} lot
              </span>
            ) : null}
          </div>
          {missingOptional > 0 ? (
            <p className="text-xs text-muted-foreground">
              {missingOptional} optional property{" "}
              {missingOptional === 1 ? "detail was" : "details were"} not
              provided by this source.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {featureGroups.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Property features</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {featureGroups.map((group) => (
              <section key={group.id} aria-labelledby={`features-${group.id}`}>
                <h2
                  id={`features-${group.id}`}
                  className="text-sm font-medium"
                >
                  {group.title}
                </h2>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {group.attributes.map((attr) => (
                    <li key={attr.key}>
                      <Badge variant="secondary">
                        {publicAttributeChipLabel(attr)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>About this property</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {listing.effectiveSummary ? (
            <section>
              <h2 className="text-sm font-medium">Concise listing summary</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {listing.effectiveSummary}
              </p>
            </section>
          ) : null}
          {displayDescription ? (
            <>
              {displayDescription.overview ? (
                <section>
                  <h2 className="text-sm font-medium">Overview</h2>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {displayDescription.overview}
                  </p>
                </section>
              ) : null}
              {displayDescription.layout ? (
                <section>
                  <h2 className="text-sm font-medium">Layout</h2>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {displayDescription.layout}
                  </p>
                </section>
              ) : null}
              {displayDescription.location ? (
                <section>
                  <h2 className="text-sm font-medium">Location</h2>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {displayDescription.location}
                  </p>
                </section>
              ) : null}
              {displayDescription.highlights.length ? (
                <section>
                  <h2 className="text-sm font-medium">Highlights</h2>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {displayDescription.highlights.map((highlight) => (
                      <li key={highlight}>{highlight}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {displayDescription.practical ? (
                <section>
                  <h2 className="text-sm font-medium">Practical details</h2>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {displayDescription.practical}
                  </p>
                </section>
              ) : null}
            </>
          ) : null}
          <details>
            <summary className="cursor-pointer text-sm font-medium">
              Original source description
            </summary>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
              {listing.description ?? "Source description is not available."}
            </p>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Property activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            First detected by Merkado: {formatDateTime(listing.firstSeenAt)}
          </p>
          <p>
            Last detected by Merkado: {formatDateTime(listing.lastSeenAt)}
          </p>
          {listing.sourceListedAt ? (
            <p>
              Source listing date: {formatDateTime(listing.sourceListedAt)}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Source</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Listed by {listing.sourceDisplayName}
            {listing.externalId ? ` · Ref ${listing.externalId}` : ""}
          </p>
          <Button asChild>
            <a
              href={listing.originalRealtorUrl ?? listing.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open original listing
              <span className="sr-only"> (opens in new tab)</span>
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
