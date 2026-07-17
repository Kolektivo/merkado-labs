import type { Metadata } from "next";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAllListings } from "@/lib/data/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Eligibility" };

export default async function EligibilityPage() {
  const listings = await getAllListings();
  const eligible = listings.filter((listing) => listing.publicEligible);
  const groups = new Map<string, number>();
  for (const listing of listings.filter((item) => !item.publicEligible)) {
    const reason = listing.publicExclusionReason ?? "not classified";
    groups.set(reason, (groups.get(reason) ?? 0) + 1);
  }
  return <div className="space-y-6">
    <PageHeader title="Public eligibility" description={`${eligible.length} listings currently qualify for the safe Labs browse surface.`} icon={SlidersHorizontal} />
    <div className="grid gap-4 sm:grid-cols-2">
      <Card><CardHeader><CardTitle>Eligible active inventory</CardTitle></CardHeader><CardContent className="text-3xl font-semibold">{eligible.length}</CardContent></Card>
      <Card><CardHeader><CardTitle>Excluded inventory</CardTitle></CardHeader><CardContent className="text-3xl font-semibold">{listings.length - eligible.length}</CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle>Exclusion reasons</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">
      {groups.size ? Array.from(groups, ([reason, count]) => <Badge key={reason} variant="outline">{reason}: {count}</Badge>) : <p className="text-sm text-muted-foreground">No exclusions.</p>}
    </CardContent></Card>
    <Card><CardContent className="flex items-center justify-between gap-3 py-5 text-sm"><span>Inspect the eligible subset in the dashboard listing table.</span><Link className="underline" href="/listings?publicEligible=eligible">View eligible listings</Link></CardContent></Card>
  </div>;
}
