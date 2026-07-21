import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, FlaskConical, MapPin } from "lucide-react";

import { AboutPropertyDescription } from "@/components/about-property-description";
import { ListingImageGallery } from "@/components/listing-image-gallery";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PriceDisplay } from "@/components/price-display";
import { getPublicListingById } from "@/lib/data/public-listings";
import { buildPriceDisplay } from "@/lib/domain/price-display";
import {
  publicListingTypeLabel,
  resolvePublicDisplaySummary,
  resolvePublicDisplayTitle,
  resolvePublicMetaDescription,
} from "@/lib/domain/public-presentation";
import { resolveListingGalleryUrls } from "@/lib/listing-gallery-urls";
import {
  groupPublicAttributes,
  publicAttributeChipLabel,
} from "@/lib/domain/public-attributes";
import { formatDateTime, titleCase } from "@/lib/format";
import {
  buildPublicListingJsonLd,
  publicListingCanonicalPath,
  publicListingCanonicalUrl,
  publicSiteOrigin,
} from "@/lib/seo/public-listing-jsonld";

export const dynamic = "force-dynamic";
type Params = Promise<{ id: string }>;
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
  if (!listing) {
    return { title: "Property" };
  }

  const title = resolvePublicDisplayTitle(listing);
  const description = resolvePublicMetaDescription(listing);
  const canonicalPath = publicListingCanonicalPath(listing.id);
  const canonicalUrl = publicListingCanonicalUrl(listing.id);
  const origin = publicSiteOrigin();
  const image =
    listing.primaryImageUrl ?? listing.imageUrls[0] ?? undefined;

  return {
    title,
    description,
    alternates: {
      canonical: origin ? canonicalUrl : canonicalPath,
    },
    openGraph: {
      title,
      description,
      type: "article",
      url: origin ? canonicalUrl : canonicalPath,
      locale: "en",
      siteName: "Merkado Labs",
      ...(image
        ? {
            images: [
              {
                url: image,
                alt: title,
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
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
  const displayDescriptionNl = listing.displayDescriptionNl;
  const displayTitle = resolvePublicDisplayTitle(listing);
  const displaySummary = resolvePublicDisplaySummary(listing);
  const jsonLd = buildPublicListingJsonLd(listing);

  return (
    <div className="mx-auto max-w-5xl space-y-6 overflow-x-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" asChild>
          <Link href={backHref}>
            <ArrowLeft data-icon="inline-start" />
            Back to browse
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <a
            href={listing.originalRealtorUrl ?? listing.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open original listing
            <ArrowUpRight data-icon="inline-end" />
            <span className="sr-only"> (opens in new tab)</span>
          </a>
        </Button>
      </div>
      <Alert className="border-primary/20 bg-primary/[0.03]">
        <FlaskConical className="size-4" />
        <AlertTitle>Labs preview · not live</AlertTitle>
        <AlertDescription>
          This uses only public-safe listing data and is not proof of ownership,
          value, or sale. Public copy is English.
        </AlertDescription>
      </Alert>

      <Card className="overflow-hidden py-0">
        <ListingImageGallery
          images={resolveListingGalleryUrls({
            imageUrls: listing.imageUrls,
            primaryImageUrl: listing.primaryImageUrl,
          })}
          altBase={displayTitle}
          variant="detail"
          priority
        />
        <CardContent className="space-y-5 p-5 md:p-7">
          <div className="flex flex-wrap gap-2">
            <Badge>{publicListingTypeLabel(listing.listingType)}</Badge>
            <Badge variant="outline">{listing.sourceDisplayName}</Badge>
            {propertyType ? (
              <Badge variant="secondary">{titleCase(propertyType)}</Badge>
            ) : null}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {displayTitle}
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
              <span className="inline-flex min-w-0 max-w-full items-center gap-1 truncate">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">
                  {listing.effectiveNeighbourhood}
                  {listing.effectiveNeighbourhoodProvenanceLabel ? (
                    <span className="text-xs">
                      {" "}
                      · {listing.effectiveNeighbourhoodProvenanceLabel}
                    </span>
                  ) : null}
                </span>
              </span>
            ) : null}
            {listing.bedrooms != null ? (
              <span>
                {listing.bedrooms} bedroom
                {listing.bedrooms === 1 ? "" : "s"}
              </span>
            ) : null}
            {listing.bathrooms != null ? (
              <span>
                {listing.bathrooms} bathroom
                {listing.bathrooms === 1 ? "" : "s"}
              </span>
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
          {displaySummary ? (
            <section>
              <h2 className="text-sm font-medium">Summary</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {displaySummary}
              </p>
            </section>
          ) : null}
          <AboutPropertyDescription
            english={displayDescription}
            dutch={displayDescriptionNl}
          />
          <details>
            <summary className="cursor-pointer text-sm font-medium">
              Original source description
            </summary>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
              {listing.description ?? "Source description is not available."}
            </p>
          </details>
          {listing.title && listing.title.trim() !== displayTitle ? (
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                Original source title
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">
                {listing.title}
              </p>
            </details>
          ) : null}
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
