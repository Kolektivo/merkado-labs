import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PrototypeNotice } from "@/components/prototype-notice";
import { SearchRequestForm } from "@/components/search-request-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getPropertySearchRequests } from "@/lib/data/queries";
import { formatDateTime, titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Property Search" };

export default async function SearchRequestsPage() {
  const requests = await getPropertySearchRequests();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Property Search"
        description="Saved Property Search requests and their matches. Prefer What Fits Me for natural-language intake."
        icon={ClipboardList}
      />
      <PrototypeNotice>
        Labs-only Property Search data. No paywall, billing, or email delivery.
      </PrototypeNotice>
      <SearchRequestForm />
      <Card className="gap-0 py-0">
        <CardContent className="divide-y px-0">
          {requests.length ? (
            requests.map((request) => (
              <Link
                key={request.id}
                href={`/match-reports/${request.id}`}
                className="flex items-center justify-between gap-3 px-4 py-4 text-sm hover:bg-muted/30 sm:px-6"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {request.title ?? "Untitled request"}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {formatDateTime(request.updatedAt)}
                  </span>
                </span>
                <Badge variant="outline" className="shrink-0">
                  {titleCase(request.status)}
                </Badge>
              </Link>
            ))
          ) : (
            <p className="px-6 py-8 text-sm text-muted-foreground">
              No search requests yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
