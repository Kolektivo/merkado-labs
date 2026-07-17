import type { Metadata } from "next";
import { Bot } from "lucide-react";

import { AgentEntitlementControl } from "@/components/agent-entitlement-control";
import { HelpTip } from "@/components/help-tip";
import { PageHeader } from "@/components/page-header";
import { PrototypeNotice } from "@/components/prototype-notice";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getAgentEntitlements,
  getPropertySearchRequests,
} from "@/lib/data/queries";
import { titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Merkado Agent" };

export default async function AgentPage() {
  const [requests, entitlements] = await Promise.all([
    getPropertySearchRequests(),
    getAgentEntitlements(),
  ]);
  const confirmed = requests.filter((request) => request.status === "confirmed");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Merkado Agent"
        description="Internal test access for request-based matching. Not a live customer product."
        icon={Bot}
      />
      <PrototypeNotice>
        No real subscription, billing, continuous monitoring, or email delivery
        is enabled.
      </PrototypeNotice>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Test access
            <HelpTip label="test access">
              A test “access pass” that lets Labs try matching for a confirmed
              search request. It is not a paid subscription.
            </HelpTip>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {entitlements.length
              ? `${entitlements.length} test access pass${entitlements.length === 1 ? "" : "es"} recorded.`
              : "No test access passes yet."}
          </p>
          <div className="flex flex-wrap gap-2">
            {entitlements.map((item) => (
              <Badge key={item.id} variant="outline">
                {titleCase(item.status)} ·{" "}
                {titleCase(item.deliveryChannel.replaceAll("_", " "))}
              </Badge>
            ))}
          </div>
          <AgentEntitlementControl requests={confirmed} />
        </CardContent>
      </Card>
    </div>
  );
}
