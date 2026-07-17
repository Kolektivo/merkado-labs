import type { Metadata } from "next";
import { Bot } from "lucide-react";

import { AgentEntitlementControl } from "@/components/agent-entitlement-control";
import { PageHeader } from "@/components/page-header";
import { PrototypeNotice } from "@/components/prototype-notice";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAgentEntitlements, getPropertySearchRequests } from "@/lib/data/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Merkado Agent" };
export default async function AgentPage() {
  const [requests, entitlements] = await Promise.all([getPropertySearchRequests(), getAgentEntitlements()]);
  const confirmed = requests.filter((request) => request.status === "confirmed");
  return <div className="space-y-6"><PageHeader title="Merkado Agent" description="Internal test entitlement preview for request-based matching." icon={Bot} /><PrototypeNotice>No real subscription, billing, continuous monitoring, or email delivery is enabled.</PrototypeNotice><Card><CardHeader><CardTitle>Test access</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">{entitlements.length ? `${entitlements.length} test entitlement${entitlements.length === 1 ? "" : "s"} recorded.` : "No test entitlements yet."}</p><div className="flex flex-wrap gap-2">{entitlements.map((item) => <Badge key={item.id} variant="outline">{item.status} · {item.deliveryChannel}</Badge>)}</div><AgentEntitlementControl requests={confirmed} /></CardContent></Card></div>;
}
