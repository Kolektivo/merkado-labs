import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";

import { DataError } from "@/components/data-error";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getEnrichmentDashboard } from "@/lib/data/enrichment";
import { formatDateTime, formatNumber, titleCase } from "@/lib/format";

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
          description="Queue OpenAI enrichment jobs for Labs listings. Proposals never overwrite source facts."
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
        title="Enrichment"
        description="Review AI suggestions beside their source listings. Suggestions never become source facts automatically."
        icon={Sparkles}
      />
      <div className="rounded-lg border border-amber-300/60 bg-amber-50/50 p-4 text-sm dark:bg-amber-950/10">
        AI execution is intentionally disabled during this cleanup. This page
        only reviews proposals and historical jobs already stored in Labs.
      </div>
      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="All proposals" value={formatNumber(dashboard.proposals.length)} hint="Existing Labs rows" icon={Sparkles} />
        <MetricCard label="Unreviewed" value={formatNumber(dashboard.unreviewed)} hint="Human decision required" icon={Sparkles} />
        <MetricCard label="Needs review" value={formatNumber(dashboard.needsReview)} hint="Model workflow status" icon={Sparkles} />
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Proposal queue</CardTitle>
          <CardDescription>
            Open a listing to compare source data, evidence, and the AI suggestion.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y px-0">
          {dashboard.proposals.length ? dashboard.proposals.map((proposal) => (
            <Link key={proposal.id} href={`/listings/${proposal.listingId}`} className="grid gap-2 px-6 py-4 hover:bg-muted/30 sm:grid-cols-[1fr_auto]">
              <div>
                <p className="font-medium">{proposal.listingTitle ?? "Untitled listing"}</p>
                <p className="text-xs text-muted-foreground">
                  {proposal.sourceName ?? "Unknown source"} · {proposal.model} · {formatDateTime(proposal.generatedAt)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{titleCase(proposal.status.replaceAll("_", " "))}</Badge>
                <Badge variant={proposal.reviewStatus === "unreviewed" ? "secondary" : "outline"}>
                  {titleCase(proposal.reviewStatus.replaceAll("_", " "))}
                </Badge>
              </div>
            </Link>
          )) : <p className="px-6 py-8 text-sm text-muted-foreground">No AI proposals exist.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Historical jobs</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {dashboard.jobs.map((job) => (
            <div key={job.id} className="flex items-center justify-between gap-3 text-sm">
              <span>{formatDateTime(job.createdAt)} · {job.model}</span>
              <Badge variant="outline">{job.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
