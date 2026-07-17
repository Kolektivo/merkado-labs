import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getListingActivityEvents, getListingById } from "@/lib/data/queries";
import { formatCurrency, formatDateTime, titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";
type Params = Promise<{ id: string }>;
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const listing = await getListingById((await params).id).catch(() => null);
  return { title: listing?.title ?? "Property" };
}

export default async function PublicListingPage({ params }: { params: Params }) {
  const listing = await getListingById((await params).id);
  if (!listing || !listing.publicEligible || listing.status !== "active") notFound();
  const activity = await getListingActivityEvents(listing.id);
  return <div className="mx-auto max-w-4xl space-y-6">
    <Button variant="ghost" asChild><Link href="/browse">Back to browse</Link></Button>
    <Card className="overflow-hidden py-0"><div className="relative h-72 bg-muted">{listing.primaryImageUrl ? <Image src={listing.primaryImageUrl} alt={listing.title ?? "Property"} fill className="object-cover" sizes="(max-width: 768px) 100vw, 896px" /> : null}</div><CardContent className="space-y-4 p-6"><div className="flex gap-2"><Badge>{titleCase(listing.listingType)}</Badge><Badge variant="outline">{listing.neighbourhood?.name ?? "Curaçao"}</Badge></div><h1 className="text-2xl font-semibold">{listing.title ?? `Property ${listing.externalId}`}</h1><p className="font-mono text-2xl font-semibold">{formatCurrency(listing.originalPrice ?? listing.currentPrice, listing.originalCurrency ?? listing.currency)}</p>{listing.benchmarkPriceXcg !== null ? <p className="text-sm text-muted-foreground">XCG equivalent: {formatCurrency(listing.benchmarkPriceXcg, "XCG")}. Indicative equivalent based on known information.</p> : null}<p className="text-sm text-muted-foreground">{listing.bedrooms ?? "—"} bedrooms · {listing.bathrooms ?? "—"} bathrooms · {listing.floorAreaM2 ?? "—"} m²</p></CardContent></Card>
    <Card><CardHeader><CardTitle>Property Passport</CardTitle></CardHeader><CardContent className="space-y-4"><section><h2 className="font-medium">Current listing</h2><p className="mt-1 text-sm text-muted-foreground">{listing.description ?? "Source description is not available."}</p></section><section><h2 className="font-medium">Activity timeline</h2><div className="mt-2 space-y-2">{activity.length ? activity.map((event) => <p key={event.id} className="text-sm text-muted-foreground">{formatDateTime(event.eventAt)} · {titleCase(event.eventType.replaceAll("_", " "))}</p>) : <p className="text-sm text-muted-foreground">No public activity events yet.</p>}</div></section></CardContent></Card>
  </div>;
}
