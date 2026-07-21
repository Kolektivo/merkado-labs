/**
 * JSON-LD for public Browse listing detail.
 * Uses English presentation fields and XCG price when available.
 */

import type { PublicPropertyListing } from "@/lib/domain/types";
import {
  resolvePublicDisplaySummary,
  resolvePublicDisplayTitle,
  resolvePublicMetaDescription,
} from "@/lib/domain/public-presentation";

export function publicSiteOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    return vercel.startsWith("http") ? vercel.replace(/\/$/, "") : `https://${vercel}`;
  }
  return "";
}

export function publicListingCanonicalPath(id: string): string {
  return `/browse/${id}`;
}

export function publicListingCanonicalUrl(id: string): string {
  const origin = publicSiteOrigin();
  const path = publicListingCanonicalPath(id);
  return origin ? `${origin}${path}` : path;
}

export function buildPublicListingJsonLd(listing: PublicPropertyListing) {
  const name = resolvePublicDisplayTitle(listing);
  const description = resolvePublicMetaDescription(listing);
  const summary = resolvePublicDisplaySummary(listing);
  const url = publicListingCanonicalUrl(listing.id);
  const images = listing.imageUrls.length
    ? listing.imageUrls
    : listing.primaryImageUrl
      ? [listing.primaryImageUrl]
      : [];

  const offer: Record<string, unknown> = {
    "@type": "Offer",
    url,
    availability: "https://schema.org/InStock",
  };

  if (
    listing.benchmarkPriceXcg != null &&
    Number.isFinite(listing.benchmarkPriceXcg)
  ) {
    offer.price = Number(listing.benchmarkPriceXcg.toFixed(2));
    offer.priceCurrency = "XCG";
  } else if (
    listing.originalPrice != null &&
    listing.originalCurrency &&
    Number.isFinite(listing.originalPrice)
  ) {
    offer.price = Number(listing.originalPrice.toFixed(2));
    offer.priceCurrency = listing.originalCurrency.toUpperCase();
  }

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name,
    description: summary ?? description,
    url,
    datePosted: listing.sourceListedAt ?? listing.firstSeenAt,
  };

  if (images.length) jsonLd.image = images.length === 1 ? images[0] : images;
  if (listing.effectiveNeighbourhood) {
    jsonLd.contentLocation = {
      "@type": "Place",
      name: listing.effectiveNeighbourhood,
      address: {
        "@type": "PostalAddress",
        addressLocality: listing.effectiveNeighbourhood,
        addressCountry: "CW",
      },
    };
  }
  if (listing.sourceDisplayName) {
    jsonLd.seller = {
      "@type": "RealEstateAgent",
      name: listing.sourceDisplayName,
    };
  }
  jsonLd.offers = offer;

  return jsonLd;
}
