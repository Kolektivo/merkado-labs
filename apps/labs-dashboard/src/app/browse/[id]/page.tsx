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
import { getPublicListingActivityEvents } from "@/lib/data/public-listing-activity";
import { getPublicListingById } from "@/lib/data/public-listings";
import {
  activityPriceDelta,
  activityTitle,
  filterDefaultTimeline,
} from "@/lib/domain/activity-presentation";
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
import { formatCurrency, formatDateTime, titleCase } from "@/lib/format";
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

function contactHref(method: string, value: string): string | null {
  const normalized = method.trim().toLowerCase();
  if (normalized === "email") return `mailto:${value.trim()}`;
  if (normalized === "phone") return `tel:${value.trim().replace(/\s+/g, "")}`;
  if (normalized === "whatsapp") {
    const digits = value.replace(/\D/g, "");
    return digits ? `https://wa.me/${digits}` : null;
  }
  return null;
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
  const activity = filterDefaultTimeline(
    await getPublicListingActivityEvents(listing.id),
    { includeSecondary: false },
  );
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
        {listing.listingOrigin !== "manual" &&
        (listing.originalRealtorUrl || listing.sourceUrl) ? (
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
        ) : null}
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
            <Badge variant="outline">
              {listing.listingOrigin === "manual"
                ? "User provided"
                : listing.sourceDisplayName}
            </Badge>
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
          {listing.listingOrigin === "manual" ? (
            listing.description ? (
              <section>
                <h2 className="text-sm font-medium">Description</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {listing.description}
                </p>
              </section>
            ) : null
          ) : (
            <>
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
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Property Passport activity</CardTitle>
        </CardHeader>
        <CardContent>
          {activity.length ? (
            <ul className="space-y-3">
              {activity.map((event) => {
                const delta = activityPriceDelta(event);
                return (
                  <li
                    key={event.id}
                    className="rounded-lg border bg-muted/20 px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {activityTitle(event.eventType)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(event.eventAt)}
                      </span>
                    </div>
                    {delta ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatCurrency(
                          delta.previous.amount,
                          delta.previous.currency,
                        )}{" "}
                        → {formatCurrency(delta.next.amount, delta.next.currency)}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {listing.listingOrigin === "manual"
                ? `Submitted to Labs ${formatDateTime(listing.firstSeenAt)}.`
                : `First seen by Merkado ${formatDateTime(listing.firstSeenAt)}.`}
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Operational refreshes, AI processing, benchmark-only FX changes,
            repeated imports, and display jitter remain in the audit record but
            are hidden here.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {listing.listingOrigin === "manual" ? "Provenance" : "Source"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {listing.listingOrigin === "manual" ? (
            <>
              <p className="text-sm text-muted-foreground">
                User provided · Labs admin native listing prototype. Facts on
                this Passport are owner-entered, not scraped from a realtor
                website.
              </p>
              {listing.contactMethod && listing.contactValue ? (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm">
                    {listing.contactName
                      ? `Contact ${listing.contactName}`
                      : "Contact the property owner"}
                  </p>
                  {contactHref(
                    listing.contactMethod,
                    listing.contactValue,
                  ) ? (
                    <Button asChild size="sm">
                      <a
                        href={
                          contactHref(
                            listing.contactMethod,
                            listing.contactValue,
                          ) ?? undefined
                        }
                        target={
                          listing.contactMethod.toLowerCase() === "whatsapp"
                            ? "_blank"
                            : undefined
                        }
                        rel={
                          listing.contactMethod.toLowerCase() === "whatsapp"
                            ? "noreferrer"
                            : undefined
                        }
                      >
                        Contact via {titleCase(listing.contactMethod)}
                        {listing.contactMethod.toLowerCase() === "whatsapp" ? (
                          <>
                            <ArrowUpRight data-icon="inline-end" />
                            <span className="sr-only"> (opens in new tab)</span>
                          </>
                        ) : null}
                      </a>
                    </Button>
                  ) : (
                    <span className="text-sm">{listing.contactValue}</span>
                  )}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Listed by {listing.sourceDisplayName}
                {listing.externalId ? ` · Ref ${listing.externalId}` : ""}
              </p>
              {listing.originalRealtorUrl || listing.sourceUrl ? (
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
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
