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
import { buildPriceDisplay } from "@/lib/domain/price-display";
import { getPublicListingById } from "@/lib/data/public-listings";
import { formatDateTime, titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";
type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function browseBackHref(
  params: Record<string, string | string[] | undefined>,
) {
  const query = new URLSearchParams();
  for (const key of ["type", "source", "bedrooms", "minPrice", "maxPrice"]) {
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
  const missingOptional = [
    listing.bedrooms == null,
    listing.bathrooms == null,
    listing.floorAreaM2 == null,
  ].filter(Boolean).length;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
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
          <div className="flex gap-2">
            <Badge>{titleCase(listing.listingType)}</Badge>
            <Badge variant="outline">{listing.sourceDisplayName}</Badge>
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
            {listing.bedrooms != null ? (
              <span>{listing.bedrooms} bedrooms</span>
            ) : null}
            {listing.bathrooms != null ? (
              <span>{listing.bathrooms} bathrooms</span>
            ) : null}
            {listing.floorAreaM2 != null ? (
              <span>{listing.floorAreaM2} m²</span>
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
      <Card>
        <CardHeader>
          <CardTitle>Property Passport preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <section>
            <h2 className="font-medium">Source data</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {listing.description ?? "Source description is not available."}
            </p>
          </section>
          <section>
            <h2 className="font-medium">Public activity summary</h2>
            <div className="mt-2 space-y-2 text-sm text-muted-foreground">
              <p>
                First detected by Merkado:{" "}
                {formatDateTime(listing.firstSeenAt)}
              </p>
              <p>
                Last detected by Merkado:{" "}
                {formatDateTime(listing.lastSeenAt)}
              </p>
              {listing.sourceListedAt ? (
                <p>
                  Source listing date:{" "}
                  {formatDateTime(listing.sourceListedAt)}
                </p>
              ) : null}
            </div>
          </section>
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
