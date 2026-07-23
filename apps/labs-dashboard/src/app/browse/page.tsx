import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConical, MapPin, Search } from "lucide-react";

import { DataError } from "@/components/data-error";
import { ListingImageGallery } from "@/components/listing-image-gallery";
import { PageHeader } from "@/components/page-header";
import { PriceDisplay } from "@/components/price-display";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getPublicListings } from "@/lib/data/public-listings";
import {
  canonicalizeNeighbourhood,
  neighbourhoodKeysMatch,
} from "@/lib/domain/neighbourhood-aliases";
import { buildPriceDisplay } from "@/lib/domain/price-display";
import { resolveListingGalleryUrls } from "@/lib/listing-gallery-urls";
import {
  listingHasPublicAttribute,
  PUBLIC_ATTRIBUTE_DISPLAY_LABELS,
  PUBLIC_ATTRIBUTE_FILTER_KEYS,
  selectBrowseAttributeChips,
} from "@/lib/domain/public-attributes";
import type { PublicPropertyListing } from "@/lib/domain/types";
import {
  publicListingTypeLabel,
  resolvePublicDisplaySummary,
  resolvePublicDisplayTitle,
} from "@/lib/domain/public-presentation";
import { titleCase } from "@/lib/format";
import { matchesSynonymSearch } from "@/lib/search/synonyms";

function listingNeighbourhoodLabel(
  listing: PublicPropertyListing,
): string | null {
  return canonicalizeNeighbourhood(listing.effectiveNeighbourhood)
    .canonicalDisplay;
}

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Public preview",
  description:
    "Browse English public-safe property listings from the Merkado Labs Curaçao dataset.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FILTER_KEYS = [
  "q",
  "type",
  "source",
  "neighbourhood",
  "propertyType",
  "bedrooms",
  "minPrice",
  "maxPrice",
  ...PUBLIC_ATTRIBUTE_FILTER_KEYS,
] as const;

const one = (
  params: Record<string, string | string[] | undefined>,
  key: string,
) => {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
};

function cardMetaParts(listing: PublicPropertyListing): {
  neighbourhood: string | null;
  details: string[];
} {
  const details: string[] = [];
  if (listing.bedrooms != null) {
    details.push(
      `${listing.bedrooms} bedroom${listing.bedrooms === 1 ? "" : "s"}`,
    );
  }
  if (listing.bathrooms != null) {
    details.push(
      `${listing.bathrooms} bathroom${listing.bathrooms === 1 ? "" : "s"}`,
    );
  }
  return {
    neighbourhood: listingNeighbourhoodLabel(listing),
    details,
  };
}

function cardAttributeChips(listing: PublicPropertyListing): string[] {
  return selectBrowseAttributeChips(listing.publicAttributes);
}

function matchesFilters(
  listing: PublicPropertyListing,
  filters: {
    query: string;
    type: string;
    source: string;
    neighbourhood: string;
    propertyType: string;
    bedrooms: number;
    min: number;
    max: number;
    attributeFlags: Record<string, boolean>;
  },
): boolean {
  if (filters.type && listing.listingType !== filters.type) return false;
  if (filters.source && listing.sourceKey !== filters.source) return false;
  if (
    filters.neighbourhood &&
    !neighbourhoodKeysMatch(
      listing.effectiveNeighbourhood,
      filters.neighbourhood,
    )
  ) {
    return false;
  }
  if (
    filters.propertyType &&
    (listing.effectivePropertyType ?? listing.propertyType) !==
      filters.propertyType
  ) {
    return false;
  }
  if (filters.bedrooms && (listing.bedrooms ?? 0) < filters.bedrooms) {
    return false;
  }
  const price = listing.benchmarkPriceXcg;
  if ((price ?? 0) < filters.min) return false;
  if ((price ?? Number.POSITIVE_INFINITY) > filters.max) return false;
  for (const [key, enabled] of Object.entries(filters.attributeFlags)) {
    if (enabled && !listingHasPublicAttribute(listing.publicAttributes, key)) {
      return false;
    }
  }
  if (filters.query) {
    const displayTitle = resolvePublicDisplayTitle(listing);
    const displaySummary = resolvePublicDisplaySummary(listing);
    const chips = selectBrowseAttributeChips(listing.publicAttributes).join(
      " ",
    );
    if (
      !matchesSynonymSearch(
        [
          displayTitle,
          displaySummary,
          listing.displayTitle,
          listing.displaySummary,
          listing.effectiveSummary,
          listing.displayDescription?.overview,
          listing.effectiveNeighbourhood,
          listing.effectivePropertyType,
          listing.propertyType,
          listing.listingType,
          listing.sourceDisplayName,
          chips,
          // Residual source text so Dutch queries still match pre-migration rows.
          listing.title,
          listing.description,
        ],
        filters.query,
      )
    ) {
      return false;
    }
  }
  return true;
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query = one(params, "q");
  const type = one(params, "type");
  const source = one(params, "source");
  const neighbourhood = one(params, "neighbourhood");
  const propertyType = one(params, "propertyType");
  const bedrooms = Number(one(params, "bedrooms")) || 0;
  const min = Number(one(params, "minPrice")) || 0;
  const max = Number(one(params, "maxPrice")) || Number.POSITIVE_INFINITY;
  const attributeFlags = Object.fromEntries(
    PUBLIC_ATTRIBUTE_FILTER_KEYS.map((key) => [key, one(params, key) === "1"]),
  );

  const detailParams = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = one(params, key);
    if (value) detailParams.set(key, value);
  }
  const detailQuery = detailParams.toString();

  let publicListings;
  try {
    publicListings = await getPublicListings();
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Public preview"
          description="Public-safe property listings from the Labs dataset."
          icon={Search}
        />
        <DataError
          message={error instanceof Error ? error.message : "Unknown data error"}
        />
      </div>
    );
  }

  const neighbourhoodOptions = Array.from(
    new Set(
      publicListings
        .map((listing) => listingNeighbourhoodLabel(listing))
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const propertyTypeOptions = Array.from(
    new Set(
      publicListings
        .map((listing) => listing.effectivePropertyType ?? listing.propertyType)
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const listings = publicListings.filter((listing) =>
    matchesFilters(listing, {
      query,
      type,
      source,
      neighbourhood,
      propertyType,
      bedrooms,
      min,
      max,
      attributeFlags,
    }),
  );

  return (
    <div className="max-w-full space-y-6 overflow-x-hidden">
      <PageHeader
        title="Public preview"
        description="Browse listings that meet the current public-data checks."
        icon={Search}
      />
      <Alert>
        <FlaskConical className="size-4" />
        <AlertTitle>Labs preview · not live</AlertTitle>
        <AlertDescription>
          Not live on merkado.cw. Private evidence and internal AI suggestions
          are excluded.
        </AlertDescription>
      </Alert>
      <form
        method="get"
        action="/browse"
        className="grid w-full max-w-full items-end gap-3 overflow-hidden rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        <div className="min-w-0 sm:col-span-2 lg:col-span-3 xl:col-span-4">
          <label
            htmlFor="browse-q"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Search
          </label>
          <input
            id="browse-q"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="e.g. furnished, zwembad, Jan Thiel"
            className="h-9 w-full max-w-full rounded-md border bg-background px-3 text-sm"
          />
        </div>
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
            className="h-9 w-full max-w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="">Either</option>
            <option value="sale">Buy</option>
            <option value="rent">Rent</option>
          </select>
        </div>
        <div className="min-w-0 overflow-hidden">
          <label
            htmlFor="browse-neighbourhood"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Neighbourhood
          </label>
          <select
            id="browse-neighbourhood"
            name="neighbourhood"
            defaultValue={neighbourhood}
            className="h-9 w-full max-w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="">Any</option>
            {neighbourhoodOptions.map((name) => (
              <option key={name} value={name}>
                {name.length > 48 ? `${name.slice(0, 45)}…` : name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label
            htmlFor="browse-property-type"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Property type
          </label>
          <select
            id="browse-property-type"
            name="propertyType"
            defaultValue={propertyType}
            className="h-9 w-full max-w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="">Any</option>
            {propertyTypeOptions.map((name) => (
              <option key={name} value={name}>
                {titleCase(name)}
              </option>
            ))}
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
            className="h-9 w-full max-w-full rounded-md border bg-background px-3 text-sm"
          />
        </div>
        <div className="min-w-0">
          <label
            htmlFor="browse-min-price"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Min price (XCG)
          </label>
          <input
            id="browse-min-price"
            name="minPrice"
            type="number"
            min="0"
            defaultValue={one(params, "minPrice")}
            placeholder="Any"
            className="h-9 w-full max-w-full rounded-md border bg-background px-3 text-sm"
          />
        </div>
        <div className="min-w-0">
          <label
            htmlFor="browse-max-price"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Max price (XCG)
          </label>
          <input
            id="browse-max-price"
            name="maxPrice"
            type="number"
            min="0"
            defaultValue={one(params, "maxPrice")}
            placeholder="Any"
            className="h-9 w-full max-w-full rounded-md border bg-background px-3 text-sm"
          />
        </div>
        {PUBLIC_ATTRIBUTE_FILTER_KEYS.map((key) => (
          <label
            key={key}
            htmlFor={`browse-attr-${key}`}
            className="flex min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-sm"
          >
            <input
              id={`browse-attr-${key}`}
              name={key}
              type="checkbox"
              value="1"
              defaultChecked={attributeFlags[key]}
              className="size-4"
            />
            <span className="truncate">
              {PUBLIC_ATTRIBUTE_DISPLAY_LABELS[key] ?? titleCase(key)}
            </span>
          </label>
        ))}
        <Button type="submit" className="sm:col-span-2 xl:col-span-1">
          Apply filters
        </Button>
        {source ? <input type="hidden" name="source" value={source} /> : null}
      </form>
      <p className="text-sm text-muted-foreground">
        Showing{" "}
        <span className="font-medium text-foreground">{listings.length}</span>{" "}
        of {publicListings.length} public-ready listings
      </p>
      <div className="grid max-w-full gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {listings.map((listing, index) => {
          const meta = cardMetaParts(listing);
          const chips = cardAttributeChips(listing);
          const hasMeta = Boolean(meta.neighbourhood || meta.details.length);
          const displayTitle = resolvePublicDisplayTitle(listing);
          return (
            <Link
              key={listing.id}
              href={
                detailQuery
                  ? `/browse/${listing.id}?${detailQuery}`
                  : `/browse/${listing.id}`
              }
              className="min-w-0 max-w-full"
            >
              <Card className="h-full max-w-full overflow-hidden py-0">
                <ListingImageGallery
                  images={resolveListingGalleryUrls({
                    imageUrls: listing.imageUrls,
                    primaryImageUrl: listing.primaryImageUrl,
                  })}
                  altBase={displayTitle}
                  variant="card"
                  priority={index === 0}
                  aspectClassName="relative h-44 bg-muted"
                />
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge>
                      {publicListingTypeLabel(listing.listingType)}
                    </Badge>
                    <Badge variant="outline">
                      {listing.listingOrigin === "manual"
                        ? "User provided"
                        : listing.sourceDisplayName}
                    </Badge>
                  </div>
                  <h2 className="line-clamp-2 font-medium">{displayTitle}</h2>
                  <PriceDisplay
                    model={buildPriceDisplay({
                      originalPrice: listing.originalPrice,
                      originalCurrency: listing.originalCurrency,
                      benchmarkPriceXcg: listing.benchmarkPriceXcg,
                      surface: "browse",
                    })}
                    size="sm"
                  />
                  {hasMeta ? (
                    <p className="flex min-w-0 items-center gap-1.5 truncate text-sm text-muted-foreground">
                      {meta.neighbourhood ? (
                        <span className="inline-flex min-w-0 items-center gap-1 truncate">
                          <MapPin
                            className="size-3.5 shrink-0"
                            aria-hidden
                          />
                          <span className="truncate">{meta.neighbourhood}</span>
                        </span>
                      ) : null}
                      {meta.neighbourhood && meta.details.length ? (
                        <span className="shrink-0" aria-hidden>
                          ·
                        </span>
                      ) : null}
                      {meta.details.length ? (
                        <span className="truncate">
                          {meta.details.join(" · ")}
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                  {chips.length ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {chips.join(" · ")}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
      {!listings.length ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          <p>
            {publicListings.length
              ? "No listings match these filters."
              : "No public-ready listings are available yet."}
          </p>
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
