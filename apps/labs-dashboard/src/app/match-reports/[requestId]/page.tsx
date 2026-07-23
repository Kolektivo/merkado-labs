import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileSearch } from "lucide-react";

import { ConfirmSearchRequestButton } from "@/components/confirm-search-request-button";
import { HelpTip } from "@/components/help-tip";
import { PageHeader } from "@/components/page-header";
import { PrototypeNotice } from "@/components/prototype-notice";
import { SearchRequestReview } from "@/components/search-request-review";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listingDetailHref } from "@/lib/breadcrumbs";
import {
  getMatchReportsForRequest,
  getPropertySearchRequests,
} from "@/lib/data/queries";
import { titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Match report" };
type Params = Promise<{ requestId: string }>;
const strings = (value: unknown) =>
  Array.isArray(value) ? value.map(String).join(" · ") : "";

export default async function MatchReportsPage({
  params,
}: {
  params: Params;
}) {
  const requestId = (await params).requestId;
  const [reports, requests] = await Promise.all([
    getMatchReportsForRequest(requestId),
    getPropertySearchRequests(),
  ]);
  const request = requests.find((item) => item.id === requestId);
  if (!request) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" asChild>
          <Link href="/search-requests">
            <ArrowLeft data-icon="inline-start" />
            Back to search requests
          </Link>
        </Button>
        <Badge variant="outline">{titleCase(request.status)}</Badge>
      </div>
      <PageHeader
        title={request.title ?? "Match report"}
        description="Test scores showing how well listings fit one internal search request."
        icon={FileSearch}
      />
      <PrototypeNotice>
        Scores are experimental matching output, not property advice or a
        customer recommendation.
      </PrototypeNotice>
      <SearchRequestReview request={request} />
      <ConfirmSearchRequestButton
        requestId={request.id}
        initialStatus={request.status}
      />
      <Card className="gap-0 py-0">
        <CardContent className="divide-y px-0">
          {reports.length ? (
            reports.map((report) => (
              <div key={report.id} className="space-y-2 px-4 py-4 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <Link
                    href={listingDetailHref(report.propertyListingId, {
                      from: "match-reports",
                      fromId: requestId,
                    })}
                    className="min-w-0 break-words font-medium underline"
                  >
                    {report.listingTitle ?? "Listing detail"}
                  </Link>
                  <span className="inline-flex items-center gap-1.5">
                    <Badge variant="outline">
                      {report.matchScore === null
                        ? "Unscored"
                        : `${Math.round(report.matchScore * 100)}% fit`}
                      {" · "}
                      {report.hardPass ? "Strong match" : "Needs review"}
                    </Badge>
                    <HelpTip label="match result">
                      “Strong match” means the listing cleared the must-have
                      rules. “Needs review” means a person should check trade-offs
                      before trusting the score.
                    </HelpTip>
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {strings(report.matchReasons)}
                </p>
                {strings(report.tradeOffs) ? (
                  <p className="text-xs text-muted-foreground">
                    Trade-offs: {strings(report.tradeOffs)}
                  </p>
                ) : null}
              </div>
            ))
          ) : (
            <div className="space-y-3 px-6 py-8 text-sm text-muted-foreground">
              <p>
                No match scores yet for this request. Matching is experimental
                and not generated automatically when you create a draft.
              </p>
              <p>
                Confirm the request above if you want to use it with Merkado
                Agent test access.
              </p>
              <Button variant="outline" size="sm" asChild>
                <Link href="/agent">Open Merkado Agent</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
