import type { Metadata } from "next";
import Link from "next/link";
import { FileSearch } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PrototypeNotice } from "@/components/prototype-notice";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getMatchReportsForRequest } from "@/lib/data/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Match report" };
type Params = Promise<{ requestId: string }>;
const strings = (value: unknown) => Array.isArray(value) ? value.map(String).join(" · ") : "";

export default async function MatchReportsPage({ params }: { params: Params }) {
  const requestId = (await params).requestId;
  const reports = await getMatchReportsForRequest(requestId);
  return <div className="space-y-6"><PageHeader title="Match report" description="Deterministic test scoring for one internal Labs request." icon={FileSearch} /><PrototypeNotice>Scores are experimental matching output, not property advice or a customer recommendation.</PrototypeNotice><Card><CardContent className="divide-y px-0">{reports.length ? reports.map((report) => <div key={report.id} className="space-y-2 px-6 py-4"><div className="flex items-center justify-between gap-3"><Link href={`/listings/${report.propertyListingId}`} className="font-medium underline">{report.listingTitle ?? "Listing detail"}</Link><Badge variant="outline">{report.matchScore === null ? "Unscored" : `${Math.round(report.matchScore * 100)}%`} · {report.hardPass ? "passes" : "review"}</Badge></div><p className="text-sm text-muted-foreground">{strings(report.matchReasons)}</p>{strings(report.tradeOffs) ? <p className="text-xs text-muted-foreground">Trade-offs: {strings(report.tradeOffs)}</p> : null}</div>) : <p className="px-6 py-8 text-sm text-muted-foreground">No match report exists for this request.</p>}</CardContent></Card></div>;
}
