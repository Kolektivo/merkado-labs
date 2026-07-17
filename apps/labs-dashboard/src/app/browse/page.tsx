import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { FlaskConical, Search } from "lucide-react";

import { DataError } from "@/components/data-error";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getPublicListings } from "@/lib/data/public-listings";
import { formatCurrency } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Public browse" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (
  params: Record<string, string | string[] | undefined>,
  key: string,
) => {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
};

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const type = one(params, "type");
  const source = one(params, "source");
  const bedrooms = Number(one(params, "bedrooms")) || 0;
  const min = Number(one(params, "minPrice")) || 0;
  const max = Number(one(params, "maxPrice")) || Number.POSITIVE_INFINITY;
  let publicListings;
  try {
    publicListings = await getPublicListings();
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Public browse preview"
          description="Experimental Labs prototype — not live on merkado.cw."
          icon={Search}
        />
        <DataError
          message={error instanceof Error ? error.message : "Unknown data error"}
        />
      </div>
    );
  }
  const listings = publicListings.filter((listing) =>
    (!type || listing.listingType === type) &&
    (!source || listing.sourceKey === source) &&
    (!bedrooms || (listing.bedrooms ?? 0) >= bedrooms) &&
    (listing.originalPrice ?? 0) >= min &&
    (listing.originalPrice ?? Number.POSITIVE_INFINITY) <= max,
  );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Public browse preview"
        description="Public-safe eligible inventory from the isolated Labs dataset."
        icon={Search}
      />
      <Alert>
        <FlaskConical className="size-4" />
        <AlertTitle>Experimental Labs prototype</AlertTitle>
        <AlertDescription>
          This preview is not live on merkado.cw. It reads only the public-safe
          database view; internal evidence and AI proposals are excluded.
        </AlertDescription>
      </Alert>
      <form className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
        <input
          name="type"
          defaultValue={type}
          placeholder="Sale or rent"
          aria-label="Sale or rent"
          className="rounded-md border bg-background px-3 py-2 text-sm"
        />
        <input
          name="bedrooms"
          defaultValue={one(params, "bedrooms")}
          placeholder="Minimum bedrooms"
          aria-label="Minimum bedrooms"
          className="rounded-md border bg-background px-3 py-2 text-sm"
        />
        <input
          name="minPrice"
          defaultValue={one(params, "minPrice")}
          placeholder="Minimum price"
          aria-label="Minimum price"
          className="rounded-md border bg-background px-3 py-2 text-sm"
        />
        <input
          name="maxPrice"
          defaultValue={one(params, "maxPrice")}
          placeholder="Maximum price"
          aria-label="Maximum price"
          className="rounded-md border bg-background px-3 py-2 text-sm"
        />
        <input
          name="source"
          defaultValue={source}
          placeholder="Source key"
          aria-label="Source key"
          className="rounded-md border bg-background px-3 py-2 text-sm"
        />
        <button className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground sm:w-fit">
          Apply filters
        </button>
      </form>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {listings.map((listing, index) => (
          <Link key={listing.id} href={`/browse/${listing.id}`}>
            <Card className="h-full overflow-hidden py-0">
              <div className="relative h-44 bg-muted">
                {listing.primaryImageUrl ? (
                  <Image
                    src={listing.primaryImageUrl}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="(max-width: 1280px) 50vw, 33vw"
                    priority={index === 0}
                    unoptimized
                  />
                ) : null}
              </div>
              <CardContent className="space-y-2 p-4">
                <div className="flex gap-2">
                  <Badge>{listing.listingType ?? "Listing"}</Badge>
                  <Badge variant="outline">{listing.sourceDisplayName}</Badge>
                </div>
                <h2 className="font-medium">
                  {listing.title ?? `Property ${listing.externalId}`}
                </h2>
                <p className="font-mono font-semibold">
                  {formatCurrency(
                    listing.originalPrice,
                    listing.originalCurrency,
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  Curaçao · {listing.bedrooms ?? "—"} beds
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      {!listings.length ? (
        <p className="text-sm text-muted-foreground">
          No eligible listings match these filters.
        </p>
      ) : null}
    </div>
  );
}
