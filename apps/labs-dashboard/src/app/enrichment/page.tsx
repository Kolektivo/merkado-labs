import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";

import { DataError } from "@/components/data-error";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getEnrichmentDashboard } from "@/lib/data/enrichment";
import { formatDateTime, formatNumber } from "@/lib/format";
import {
  jobStatusLabel,
  jobStatusTone,
  proposalStatusLabel,
  reviewStatusLabel,
  reviewStatusTone,
  TIPS,
} from "@/lib/ui-labels";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "AI enrichment" };

export default async function EnrichmentPage() {
  let dashboard;
  try {
    dashboard = await getEnrichmentDashboard();
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="AI enrichment"
          description="Review AI suggestions next to their original listings. Suggestions never overwrite the source ad automatically."
          icon={Sparkles}
        />
        <DataError
          message={error instanceof Error ? error.message : "Unknown data error"}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI enrichment"
        description="AI can suggest clearer details for a listing. A person still decides what to keep — the original website data stays the source of truth."
        icon={Sparkles}
      />
      <div className="rounded-lg border border-amber-300/60 bg-amber-50/50 p-4 text-sm dark:bg-amber-950/10">
        Starting new AI jobs is turned off during cleanup. This page only shows
        suggestions and past jobs already stored in Labs.
      </div>
      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="All suggestions"
          value={formatNumber(dashboard.proposals.length)}
          hint="Stored AI proposals"
          icon={Sparkles}
        />
        <MetricCard
          label="Waiting for a person"
          value={formatNumber(dashboard.unreviewed)}
          hint="Nobody has decided yet"
          icon={Sparkles}
          tip={TIPS.unreviewedProposals.tip}
          tipLabel={TIPS.unreviewedProposals.label}
        />
        <MetricCard
          label="Flagged for closer look"
          value={formatNumber(dashboard.needsReview)}
          hint="AI asked for extra caution"
          icon={Sparkles}
          tip={TIPS.needsReviewProposals.tip}
          tipLabel={TIPS.needsReviewProposals.label}
        />
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Suggestion queue</CardTitle>
          <CardDescription>
            Open a listing to compare the original ad with the AI suggestion.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y px-0">
          {dashboard.proposals.length ? (
            dashboard.proposals.map((proposal) => (
              <Link
                key={proposal.id}
                href={`/listings/${proposal.listingId}`}
                className="grid gap-2 px-6 py-4 hover:bg-muted/30 sm:grid-cols-[1fr_auto]"
              >
                <div>
                  <p className="font-medium">
                    {proposal.listingTitle ?? "Untitled listing"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {proposal.sourceName ?? "Unknown website"} ·{" "}
                    {formatDateTime(proposal.generatedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {proposalStatusLabel(proposal.status)}
                  </Badge>
                  <StatusBadge tone={reviewStatusTone(proposal.reviewStatus)}>
                    {reviewStatusLabel(proposal.reviewStatus)}
                  </StatusBadge>
                </div>
              </Link>
            ))
          ) : (
            <p className="px-6 py-8 text-sm text-muted-foreground">
              No AI suggestions yet.
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Past AI jobs</CardTitle>
          <CardDescription>
            Historical enrichment runs already stored in Labs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {dashboard.jobs.length ? (
            dashboard.jobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span>
                  {formatDateTime(job.createdAt)} · {job.model}
                </span>
                <StatusBadge tone={jobStatusTone(job.status)}>
                  {jobStatusLabel(job.status)}
                </StatusBadge>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No past jobs yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
