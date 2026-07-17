import type { Metadata } from "next";
import { History } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getAllListings, getListingActivityEvents } from "@/lib/data/queries";
import { formatDateTime, titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Lifecycle" };

export default async function LifecyclePage() {
  const listings = await getAllListings();
  const counts = new Map<string, number>();
  listings.forEach((listing) => counts.set(listing.status, (counts.get(listing.status) ?? 0) + 1));
  const events = (await Promise.all(listings.slice(0, 100).map((listing) => getListingActivityEvents(listing.id))))
    .flat()
    .filter((event) => ["source_marked_sold", "source_marked_rented", "source_marked_under_contract"].includes(event.eventType))
    .sort((a, b) => b.eventAt.localeCompare(a.eventAt))
    .slice(0, 30);
  return <div className="space-y-6">
    <PageHeader title="Listing lifecycle" description="Status counts and observed sold, rented, or under-contract changes." icon={History} />
    <Card><CardContent className="flex flex-wrap gap-2 py-5">{Array.from(counts, ([status, count]) => <Badge key={status} variant="outline">{titleCase(status)}: {count}</Badge>)}</CardContent></Card>
    <Card><CardContent className="divide-y px-0">
      {events.length ? events.map((event) => <div key={event.id} className="flex items-center justify-between gap-3 px-6 py-3 text-sm"><span>{titleCase(event.eventType.replaceAll("_", " "))}</span><span className="text-xs text-muted-foreground">{formatDateTime(event.eventAt)}</span></div>) : <p className="px-6 py-8 text-sm text-muted-foreground">No observed sold, rented, or under-contract events yet.</p>}
    </CardContent></Card>
  </div>;
}
