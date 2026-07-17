import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Search } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getAllListings } from "@/lib/data/queries";
import { formatCurrency } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Public browse" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (params: Record<string, string | string[] | undefined>, key: string) => {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
};

export default async function BrowsePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const type = one(params, "type");
  const source = one(params, "source");
  const neighbourhood = one(params, "neighbourhood").toLowerCase();
  const bedrooms = Number(one(params, "bedrooms")) || 0;
  const min = Number(one(params, "minPrice")) || 0;
  const max = Number(one(params, "maxPrice")) || Number.POSITIVE_INFINITY;
  const listings = (await getAllListings()).filter((listing) =>
    listing.publicEligible && listing.status === "active" &&
    (!type || listing.listingType === type) &&
    (!source || listing.source.sourceKey === source) &&
    (!neighbourhood || (listing.neighbourhood?.name ?? "").toLowerCase().includes(neighbourhood)) &&
    (!bedrooms || (listing.bedrooms ?? 0) >= bedrooms) &&
    (listing.currentPrice ?? 0) >= min && (listing.currentPrice ?? Number.POSITIVE_INFINITY) <= max,
  );
  return <div className="space-y-6">
    <PageHeader title="Public browse" description="Labs-only, public-safe view of eligible active inventory." icon={Search} />
    <form className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
      <input name="type" defaultValue={type} placeholder="Sale or rent" className="rounded-md border bg-background px-3 py-2 text-sm" />
      <input name="neighbourhood" defaultValue={one(params, "neighbourhood")} placeholder="Neighbourhood" className="rounded-md border bg-background px-3 py-2 text-sm" />
      <input name="bedrooms" defaultValue={one(params, "bedrooms")} placeholder="Minimum bedrooms" className="rounded-md border bg-background px-3 py-2 text-sm" />
      <input name="minPrice" defaultValue={one(params, "minPrice")} placeholder="Minimum price" className="rounded-md border bg-background px-3 py-2 text-sm" />
      <input name="maxPrice" defaultValue={one(params, "maxPrice")} placeholder="Maximum price" className="rounded-md border bg-background px-3 py-2 text-sm" />
      <input name="source" defaultValue={source} placeholder="Source key" className="rounded-md border bg-background px-3 py-2 text-sm" />
      <button className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground sm:w-fit">Apply filters</button>
    </form>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {listings.map((listing) => <Link key={listing.id} href={`/browse/${listing.id}`}><Card className="h-full overflow-hidden py-0">
        <div className="relative h-44 bg-muted">{listing.primaryImageUrl ? <Image src={listing.primaryImageUrl} alt="" fill className="object-cover" sizes="(max-width: 1280px) 50vw, 33vw" /> : null}</div>
        <CardContent className="space-y-2 p-4"><div className="flex gap-2"><Badge>{listing.listingType ?? "Listing"}</Badge><Badge variant="outline">{listing.source.displayName ?? listing.source.name}</Badge></div><h2 className="font-medium">{listing.title ?? `Property ${listing.externalId}`}</h2><p className="font-mono font-semibold">{formatCurrency(listing.originalPrice ?? listing.currentPrice, listing.originalCurrency ?? listing.currency)}</p><p className="text-sm text-muted-foreground">{listing.neighbourhood?.name ?? "Curaçao"} · {listing.bedrooms ?? "—"} beds</p></CardContent>
      </Card></Link>)}
    </div>
    {!listings.length ? <p className="text-sm text-muted-foreground">No eligible listings match these filters.</p> : null}
  </div>;
}
