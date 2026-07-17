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
import { formatCurrency, titleCase } from "@/lib/format";

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
        description="A simple preview of listings that are clean enough to show publicly. Experimental only."
        icon={Search}
      />
      <Alert>
        <FlaskConical className="size-4" />
        <AlertTitle>Experimental Labs prototype</AlertTitle>
        <AlertDescription>
          This preview is not live on merkado.cw. It only shows public-safe
          listings — private evidence and AI suggestions are left out.
        </AlertDescription>
      </Alert>
      <form className="grid items-end gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="min-w-0">
          <label
            htmlFor="browse-type"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Buy or rent
          </label>
          <select
            id="browse-type"
            name="type"
            defaultValue={type}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="">Either</option>
            <option value="sale">Buy</option>
            <option value="rent">Rent</option>
          </select>
        </div>
        <div className="min-w-0">
          <label
            htmlFor="browse-bedrooms"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Min bedrooms
          </label>
          <input
            id="browse-bedrooms"
            name="bedrooms"
            type="number"
            min="0"
            defaultValue={one(params, "bedrooms")}
            placeholder="Any"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          />
        </div>
        <div className="min-w-0">
          <label
            htmlFor="browse-min-price"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Min price
          </label>
          <input
            id="browse-min-price"
            name="minPrice"
            type="number"
            min="0"
            defaultValue={one(params, "minPrice")}
            placeholder="Any"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          />
        </div>
        <div className="min-w-0">
          <label
            htmlFor="browse-max-price"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Max price
          </label>
          <input
            id="browse-max-price"
            name="maxPrice"
            type="number"
            min="0"
            defaultValue={one(params, "maxPrice")}
            placeholder="Any"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          />
        </div>
        <button className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Apply filters
        </button>
        {source ? <input type="hidden" name="source" value={source} /> : null}
      </form>
      <p className="text-sm text-muted-foreground">
        Showing{" "}
        <span className="font-medium text-foreground">{listings.length}</span>{" "}
        of {publicListings.length} public-ready listings
      </p>
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
                  <Badge>{titleCase(listing.listingType ?? "Listing")}</Badge>
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
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          <p>No listings match these filters.</p>
          <Link
            href="/browse"
            className="mt-2 inline-block font-medium text-foreground underline underline-offset-2"
          >
            Clear all filters
          </Link>
        </div>
      ) : null}
    </div>
  );
}
