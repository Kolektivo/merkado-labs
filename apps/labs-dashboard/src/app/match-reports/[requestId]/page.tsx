import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileSearch, MapPin } from "lucide-react";

import { ConfirmSearchRequestButton } from "@/components/confirm-search-request-button";
import { PageHeader } from "@/components/page-header";
import { PrototypeNotice } from "@/components/prototype-notice";
import { SearchRequestReview } from "@/components/search-request-review";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listingDetailHref } from "@/lib/breadcrumbs";
import {
  getMatchReportsForRequest,
  getPropertySearchRequests,
} from "@/lib/data/queries";
import { formatXcgPrimary } from "@/lib/domain/price-display";
import { matchLabelForScore } from "@/lib/matching/types";
import { titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your matches" };
type Params = Promise<{ requestId: string }>;

const strings = (value: unknown) =>
  Array.isArray(value) ? value.map(String) : [];

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
          <Link href="/what-fits-me">
            <ArrowLeft data-icon="inline-start" />
            Back to What Fits Me
          </Link>
        </Button>
        <Badge variant="outline">{titleCase(request.status)}</Badge>
      </div>
      <PageHeader
        title={request.title ?? "Your matches"}
        description="Match details for this Property Search against current Labs public listings."
        icon={FileSearch}
      />
      <PrototypeNotice>
        Explainable Labs matching only. Reasons come from listing and Passport
        facts — not financial advice.
      </PrototypeNotice>
      <SearchRequestReview request={request} />
      <ConfirmSearchRequestButton
        requestId={request.id}
        initialStatus={request.status}
      />
      <Card>
        <CardHeader>
          <CardTitle>
            Your matches
            {reports.length ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {reports.length} saved
              </span>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {reports.length ? (
            reports.map((report) => {
              const reasons = strings(report.matchReasons);
              const tradeOffs = strings(report.tradeOffs);
              const label =
                report.matchScore !== null
                  ? matchLabelForScore(report.matchScore, report.hardPass)
                  : null;
              const priceLabel =
                report.listingBenchmarkPriceXcg !== null
                  ? formatXcgPrimary(report.listingBenchmarkPriceXcg)
                  : "XCG unavailable";
              const passportHref = `/browse/${report.propertyListingId}`;
              const detailHref = listingDetailHref(report.propertyListingId, {
                from: "match-reports",
                fromId: requestId,
              });

              return (
                <div
                  key={report.id}
                  className="overflow-hidden rounded-xl border"
                >
                  <div className="grid gap-0 sm:grid-cols-[160px_1fr]">
                    <div className="relative min-h-36 bg-muted">
                      {report.listingPrimaryImageUrl ? (
                        <Image
                          src={report.listingPrimaryImageUrl}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="160px"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full min-h-36 items-center justify-center text-xs text-muted-foreground">
                          No photo
                        </div>
                      )}
                    </div>
                    <div className="space-y-2 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          <Link
                            href={passportHref}
                            className="font-medium underline-offset-2 hover:underline"
                          >
                            {report.listingTitle ?? "Listing detail"}
                          </Link>
                          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="size-3.5" />
                              {report.listingNeighbourhood ??
                                "Location not listed"}
                            </span>
                            <span>{priceLabel}</span>
                          </p>
                        </div>
                        <Badge variant="secondary">
                          {label ?? (report.hardPass ? "Good match" : "Needs review")}
                        </Badge>
                      </div>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        {reasons.length ? (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide">
                              Why it fits
                            </p>
                            <ul className="mt-1 list-disc pl-4">
                              {reasons.slice(0, 4).map((reason) => (
                                <li key={reason}>{reason}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {tradeOffs.length ? (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide">
                              Trade-offs / missing information
                            </p>
                            <ul className="mt-1 list-disc pl-4">
                              {tradeOffs.slice(0, 4).map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        <p className="text-xs">
                          Source:{" "}
                          {report.listingSourceDisplayName ?? "Listing source"}
                          {" · "}
                          <Link
                            href={passportHref}
                            className="underline underline-offset-2"
                          >
                            Open Passport
                          </Link>
                          {" · "}
                          <Link
                            href={detailHref}
                            className="underline underline-offset-2"
                          >
                            Match details
                          </Link>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="space-y-3 py-4 text-sm text-muted-foreground">
              <p>
                No saved matches yet for this Property Search. Use What Fits Me
                to interpret a request and create matches from current listings.
              </p>
              <Button variant="outline" size="sm" asChild>
                <Link href="/what-fits-me">Open What Fits Me</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
