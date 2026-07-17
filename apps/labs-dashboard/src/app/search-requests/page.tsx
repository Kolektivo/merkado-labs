import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PrototypeNotice } from "@/components/prototype-notice";
import { SearchRequestForm } from "@/components/search-request-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getPropertySearchRequests } from "@/lib/data/queries";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Search requests" };
export default async function SearchRequestsPage() {
  const requests = await getPropertySearchRequests();
  return <div className="space-y-6"><PageHeader title="Property search requests" description="Labs draft requests only; no user accounts or customer delivery." icon={ClipboardList} /><PrototypeNotice>Draft records are internal test data. Nothing is emailed or activated for customers.</PrototypeNotice><SearchRequestForm /><Card><CardContent className="divide-y px-0">{requests.length ? requests.map((request) => <Link key={request.id} href={`/match-reports/${request.id}`} className="flex items-center justify-between gap-3 px-6 py-4 text-sm hover:bg-muted/30"><span><span className="font-medium">{request.title ?? "Untitled request"}</span><span className="block text-xs text-muted-foreground">{formatDateTime(request.updatedAt)}</span></span><Badge variant="outline">{request.status}</Badge></Link>) : <p className="px-6 py-8 text-sm text-muted-foreground">No draft requests yet.</p>}</CardContent></Card></div>;
}
