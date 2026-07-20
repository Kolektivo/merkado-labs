import type { Metadata } from "next";
import Link from "next/link";
import { Coins, Sparkles } from "lucide-react";

import { DataError } from "@/components/data-error";
import { HelpTip } from "@/components/help-tip";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { SummaryStrip } from "@/components/summary-strip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { listingDetailHref } from "@/lib/breadcrumbs";
import {
  filterEnrichmentProposals,
  getEnrichmentDashboard,
  type EnrichmentAuditFilter,
  type EnrichmentRunRow,
  type ModelEfficiencyRow,
  type UsageAttempt,
} from "@/lib/data/enrichment";
import {
  COST_ESTIMATE_LABEL,
  formatUsd,
  formatPercent,
  totalTokenCount,
} from "@/lib/enrichment/cost";
import { formatDateTime, formatDuration, formatNumber } from "@/lib/format";
import {
  jobStatusLabel,
  jobStatusTone,
  proposalStatusLabel,
} from "@/lib/ui-labels";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "AI enrichment" };

type SearchParams = Promise<{
  filter?: string | string[];
  review?: string | string[];
  view?: string | string[];
}>;

const FILTERS: Array<{ id: EnrichmentAuditFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "needs_attention", label: "Needs review" },
  { id: "conflicts", label: "Conflicts" },
  { id: "low_confidence", label: "Low confidence" },
  { id: "changed_by_ai", label: "Changed by AI" },
  { id: "failed", label: "Failed" },
  { id: "never_enriched", label: "Never enriched" },
  { id: "stale_checksum", label: "Stale checksum" },
];

function parseFilter(value: string | string[] | undefined): EnrichmentAuditFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw && FILTERS.some((item) => item.id === raw)) {
    return raw as EnrichmentAuditFilter;
  }
  return "all";
}

function parseView(value: string | string[] | undefined): "overview" | "runs" | "attention" {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "runs" || raw === "attention") return raw;
  return "overview";
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default async function EnrichmentPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = await searchParams;
  const filter = parseFilter(query.filter ?? query.review);
  const view = parseView(query.view);
  let dashboard;
  try {
    dashboard = await getEnrichmentDashboard();
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="AI enrichment"
          description="Audit automatic enrichment afterwards. Source facts stay untouched."
          icon={Sparkles}
        />
        <DataError
          message={error instanceof Error ? error.message : "Unknown data error"}
        />
      </div>
    );
  }

  const attentionProposals = filterEnrichmentProposals(
    dashboard.proposals,
    "needs_attention",
  );
  const visibleProposals =
    filter === "never_enriched"
      ? []
      : filter === "all" && view === "attention"
        ? attentionProposals
        : filterEnrichmentProposals(dashboard.proposals, filter);
  const cost = dashboard.costSummary;
  const latestRun = dashboard.runRows[0] ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="AI enrichment"
        description="Coverage, cost, run outcomes, and the small number of suggestions that need a person."
        icon={Sparkles}
      />
      <p className="-mt-2 max-w-3xl text-sm text-muted-foreground">
        AI adds structured details from listing descriptions. Source prices,
        statuses, and other protected facts are never overwritten.
      </p>

      <Tabs defaultValue={view} className="gap-4">
        <TabsList variant="line" className="w-full flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="runs">Runs</TabsTrigger>
          <TabsTrigger value="attention">Needs review</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <SummaryStrip
            items={[
              {
                label: "Listings enriched",
                value: formatNumber(cost.distinctListingsAttempted),
                helper: "At least one recorded AI attempt",
                icon: Sparkles,
              },
              {
                label: "Needs review",
                value: formatNumber(dashboard.needsAttentionListings),
                helper: "Genuine decisions only",
                href: "/enrichment?view=attention&filter=needs_attention",
                icon: Sparkles,
              },
              {
                label: "Failures",
                value: formatNumber(dashboard.failed),
                helper: "Latest attempt could not finish",
                icon: Sparkles,
              },
              {
                label: "Estimated spend",
                value: formatUsd(cost.grossSpendUsd),
                helper: "All recorded paid attempts",
                icon: Coins,
              },
            ]}
          />
          <dl className="grid gap-4 rounded-xl bg-muted/35 p-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Current model</dt>
              <dd className="mt-1 font-medium">
                {cost.modelsUsed[0] ?? "gpt-5.6-terra"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                Average cost per successful listing
              </dt>
              <dd className="mt-1 font-medium">
                {formatUsd(cost.avgCostPerSuccessfulListingUsd)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Latest run</dt>
              <dd className="mt-1 font-medium">
                {latestRun
                  ? `${jobStatusLabel(latestRun.status)} · ${formatDateTime(
                      latestRun.createdAt,
                    )}`
                  : "No run recorded"}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">{COST_ESTIMATE_LABEL}</p>
        </TabsContent>

        <TabsContent value="runs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Runs</h2>
              </CardTitle>
              <CardDescription>
                Understandable run history. Expand a run for token and
                per-listing detail. New jobs are started from Data operations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {dashboard.runRows.length ? (
                <RunHistoryTable rows={dashboard.runRows} />
              ) : (
                <p className="text-sm text-muted-foreground">No jobs stored yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attention" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Needs review</h2>
              </CardTitle>
              <CardDescription>
                Real exceptions requiring a decision. Rejected noise stays in
                advanced audit below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!attentionProposals.length ? (
                <p className="text-sm text-muted-foreground">
                  No listings currently need attention.
                </p>
              ) : (
                attentionProposals.map((proposal) => (
                  <div
                    key={proposal.id}
                    className="flex flex-col gap-3 rounded-lg border px-4 py-4"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                      <Link
                        href={listingDetailHref(proposal.listingId, {
                          from: "enrichment",
                          tab: "changes",
                        })}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {proposal.listingTitle ?? proposal.listingId}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {proposal.sourceName ?? "Unknown source"} ·{" "}
                        {formatDateTime(proposal.generatedAt)}
                      </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">
                          {proposal.needsAttentionCount}{" "}
                          {proposal.needsAttentionCount === 1 ? "field" : "fields"}
                        </Badge>
                        <StatusBadge tone="warning">Needs review</StatusBadge>
                      </div>
                    </div>
                    {proposal.attentionFields.slice(0, 2).map((field) => (
                      <dl
                        key={field.label}
                        className="grid gap-3 rounded-lg bg-muted/35 p-3 text-sm sm:grid-cols-2"
                      >
                        <div>
                          <dt className="text-xs text-muted-foreground">Field</dt>
                          <dd className="font-medium">{field.label}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            Why attention is required
                          </dt>
                          <dd>Evidence or confidence needs a person to decide.</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            Current value
                          </dt>
                          <dd>{displayValue(field.currentValue)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            AI suggestion
                          </dt>
                          <dd>{displayValue(field.suggestedValue)}</dd>
                        </div>
                        {field.evidence ? (
                          <div className="sm:col-span-2">
                            <dt className="text-xs text-muted-foreground">
                              Supporting evidence
                            </dt>
                            <dd className="mt-1 text-muted-foreground">
                              “{field.evidence}”
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                    ))}
                    <Button variant="outline" size="sm" asChild className="w-fit">
                      <Link
                        href={listingDetailHref(proposal.listingId, {
                          from: "enrichment",
                          tab: "changes",
                        })}
                      >
                        Review issue
                      </Link>
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer font-medium">
          Advanced audit detail
        </summary>
        <div className="mt-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Schema / prompt / policy versions, raw token categories, rejected
            suggestions, internal IDs, and checksums remain available here.
          </p>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Coins className="size-4" />
                Cost & usage detail
              </CardTitle>
              <CardDescription>
                {cost.costLabel} Pricing as of {cost.pricingAsOf}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Retained result cost"
                  value={formatUsd(cost.retainedResultCostUsd)}
                  hint="Only the result currently in effect per listing"
                  icon={Coins}
                />
                <MetricCard
                  label="Wasted / failed attempt cost"
                  value={formatUsd(cost.wastedAttemptCostUsd)}
                  hint="Paid attempts that were not retained"
                  icon={Coins}
                />
                <MetricCard
                  label="Total API attempts"
                  value={formatNumber(cost.totalApiAttempts)}
                  hint={`${formatNumber(cost.enrichmentRunCount)} recorded runs · ${formatNumber(cost.paidApiAttempts)} paid`}
                  icon={Coins}
                />
                <MetricCard
                  label="Structured-output failure rate"
                  value={formatPercent(cost.structuredOutputFailureRate)}
                  hint={`${formatNumber(cost.structuredOutputFailureCount)} unparseable outputs`}
                  icon={Coins}
                />
              </div>
              <dl className="grid gap-3 rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  Tokens in/cached/out/reasoning:{" "}
                  <span className="font-mono text-foreground">
                    {formatNumber(cost.tokenTotals.inputTokens)} /{" "}
                    {formatNumber(cost.tokenTotals.cachedInputTokens)} /{" "}
                    {formatNumber(cost.tokenTotals.outputTokens)} /{" "}
                    {formatNumber(cost.tokenTotals.reasoningTokens)}
                  </span>
                </div>
                <div>
                  Auto-applied fields:{" "}
                  <span className="font-mono text-foreground">
                    {formatNumber(dashboard.autoAppliedFields)}
                  </span>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Model efficiency</CardTitle>
              <CardDescription>
                Grouped by model + prompt version + schema version.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {dashboard.modelEfficiency.length ? (
                <ModelEfficiencyTable rows={dashboard.modelEfficiency} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No AI attempts recorded yet.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Full proposal audit</CardTitle>
              <CardDescription>
                Includes rejected suggestions and technical filters.
              </CardDescription>
              <div className="flex flex-wrap gap-2 text-sm">
                {FILTERS.map((item) => {
                  const active = filter === item.id;
                  const href =
                    item.id === "all"
                      ? "/enrichment?view=overview"
                      : `/enrichment?view=attention&filter=${item.id}`;
                  return (
                    <Link
                      key={item.id}
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={
                        active
                          ? "font-medium text-foreground underline underline-offset-4"
                          : "text-muted-foreground hover:text-foreground"
                      }
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {filter === "never_enriched" ? (
                <p className="text-sm text-muted-foreground">
                  {formatNumber(dashboard.neverEnriched)} listings have never been
                  enriched.
                </p>
              ) : null}
              {!visibleProposals.length && filter !== "never_enriched" ? (
                <p className="text-sm text-muted-foreground">
                  No enrichment rows match this filter.
                </p>
              ) : null}
              {visibleProposals.map((proposal) => (
                <div
                  key={proposal.id}
                  className="flex flex-col gap-2 rounded-lg border px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <Link
                      href={listingDetailHref(proposal.listingId, {
                        from: "enrichment",
                        tab: "changes",
                      })}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {proposal.listingTitle ?? proposal.listingId}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {proposal.sourceName ?? "Unknown source"} ·{" "}
                      {formatDateTime(proposal.generatedAt)} · {proposal.model} ·{" "}
                      {formatUsd(proposal.costUsd)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {proposal.retained ? (
                      <Badge variant="secondary">Current result</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Superseded
                      </Badge>
                    )}
                    <Badge variant="secondary">
                      {proposal.autoAppliedCount} auto-applied
                    </Badge>
                    <Badge variant="outline">
                      {proposal.needsAttentionCount} attention
                    </Badge>
                    <StatusBadge tone="neutral">
                      {proposalStatusLabel(proposal.status)}
                    </StatusBadge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </details>
    </div>
  );
}

function RunHistoryTable({ rows }: { rows: EnrichmentRunRow[] }) {
  return (
    <>
      <div className="divide-y rounded-lg border lg:hidden">
        {rows.map((row) => (
          <article key={row.id} className="flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-medium">
                  {row.sourceLabel ?? "Mixed sources"}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDateTime(row.createdAt)} · {formatDuration(row.durationMs)}
                </p>
              </div>
              <StatusBadge tone={jobStatusTone(row.status)}>
                {jobStatusLabel(row.status)}
              </StatusBadge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Listings</p>
                <p>
                  {formatNumber(row.succeeded)} successful ·{" "}
                  {formatNumber(row.failed)} failed
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Properties changed</p>
                <p>{formatNumber(row.autoAppliedFields)} fields applied</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Skipped</p>
                <p>{formatNumber(row.skipped)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Estimated cost</p>
                <p>{formatUsd(row.costUsd)}</p>
              </div>
            </div>
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium text-foreground">
                Open run details
              </summary>
              <div className="mt-2 flex flex-col gap-1">
                <p>Model: {row.model}</p>
                <p>
                  Versions: {row.promptVersion} / {row.schemaVersion}
                </p>
                <p>Tokens: {formatNumber(totalTokenCount(row.tokens))}</p>
                <p>Attention items: {row.needsAttentionListings}</p>
              </div>
            </details>
          </article>
        ))}
      </div>
      <div className="hidden overflow-x-auto rounded-lg border lg:block">
        <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Run</th>
            <th className="px-3 py-2 font-medium">Source</th>
            <th className="px-3 py-2 font-medium">Model / versions</th>
            <th className="px-3 py-2 font-medium">Targeted → processed</th>
            <th className="px-3 py-2 font-medium">Outcome</th>
            <th className="px-3 py-2 font-medium">Fields</th>
            <th className="px-3 py-2 font-medium">Tokens</th>
            <th className="px-3 py-2 font-medium">Est. cost</th>
            <th className="px-3 py-2 font-medium">Duration</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <RunHistoryRow key={row.id} row={row} />
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}

function RunHistoryRow({ row }: { row: EnrichmentRunRow }) {
  return (
    <>
      <tr className="border-t align-top">
        <td className="px-3 py-2">
          <p className="font-medium">{formatDateTime(row.createdAt)}</p>
          <p className="text-xs text-muted-foreground">
            {row.requestedBy ?? "Unknown requester"} · {row.scopeType}
          </p>
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground">
          {row.sourceLabel ?? "—"}
        </td>
        <td className="px-3 py-2">
          <p className="font-mono text-xs">{row.model}</p>
          <p className="text-xs text-muted-foreground">
            {row.promptVersion} / {row.schemaVersion}
          </p>
        </td>
        <td className="px-3 py-2 font-mono text-xs">
          {formatNumber(row.targeted)} → {formatNumber(row.processed)}
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap gap-1 text-xs">
            <StatusBadge tone="success" showDot={false}>
              {formatNumber(row.succeeded)} ok
            </StatusBadge>
            <StatusBadge tone="error" showDot={false}>
              {formatNumber(row.failed)} failed
            </StatusBadge>
            <StatusBadge tone="neutral" showDot={false}>
              {formatNumber(row.skipped)} skipped
            </StatusBadge>
          </div>
        </td>
        <td className="px-3 py-2 text-xs">
          <p>{formatNumber(row.autoAppliedFields)} auto-applied</p>
          <p className="text-muted-foreground">
            {formatNumber(row.needsAttentionListings)} need attention
          </p>
        </td>
        <td className="px-3 py-2 font-mono text-xs">
          {formatNumber(totalTokenCount(row.tokens))}
        </td>
        <td className="px-3 py-2 font-mono text-xs">
          {formatUsd(row.costUsd)}
          <p className="font-normal text-muted-foreground">
            {formatUsd(row.avgCostPerListingUsd)} / listing
          </p>
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground">
          {formatDuration(row.durationMs)}
        </td>
        <td className="px-3 py-2">
          <StatusBadge tone={jobStatusTone(row.status)}>
            {jobStatusLabel(row.status)}
          </StatusBadge>
        </td>
      </tr>
      {row.attempts.length ? (
        <tr className="border-t bg-muted/10">
          <td colSpan={10} className="px-3 py-2">
            <details>
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                {row.attempts.length} per-listing attempt
                {row.attempts.length === 1 ? "" : "s"} for this run
              </summary>
              <div className="mt-2">
                <AttemptsTable attempts={row.attempts} />
              </div>
            </details>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function AttemptsTable({ attempts }: { attempts: UsageAttempt[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[900px] text-left text-xs">
        <thead className="bg-muted/40 uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Listing</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Tokens</th>
            <th className="px-3 py-2 font-medium">Cost</th>
            <th className="px-3 py-2 font-medium">Fields</th>
            <th className="px-3 py-2 font-medium">Failure reason</th>
          </tr>
        </thead>
        <tbody>
          {attempts.map((attempt) => (
            <tr key={attempt.id} className="border-t">
              <td className="px-3 py-2">
                <Link
                  href={listingDetailHref(attempt.listingId, {
                    from: "enrichment",
                    tab: "changes",
                  })}
                  className="underline-offset-4 hover:underline"
                >
                  {attempt.listingTitle ?? attempt.listingId}
                </Link>
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-1">
                  <StatusBadge
                    tone={
                      attempt.status === "invalid_output" || attempt.status === "failed"
                        ? "error"
                        : attempt.status === "needs_review"
                          ? "warning"
                          : "success"
                    }
                    showDot={false}
                  >
                    {proposalStatusLabel(attempt.status)}
                  </StatusBadge>
                  {attempt.retained ? (
                    <Badge variant="secondary" className="font-normal">
                      Current
                    </Badge>
                  ) : null}
                </div>
              </td>
              <td className="px-3 py-2 font-mono">
                {formatNumber(totalTokenCount(attempt.tokens))}
              </td>
              <td className="px-3 py-2 font-mono">{formatUsd(attempt.costUsd)}</td>
              <td className="px-3 py-2">
                {attempt.autoAppliedCount} applied · {attempt.needsAttentionCount}{" "}
                attention · {attempt.rejectedCount} rejected
              </td>
              <td className="max-w-xs px-3 py-2 text-muted-foreground">
                {attempt.errorMessage ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ModelEfficiencyTable({ rows }: { rows: ModelEfficiencyRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[1100px] text-left text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Model / versions</th>
            <th className="px-3 py-2 font-medium">Listings attempted</th>
            <th className="px-3 py-2 font-medium">Success rate</th>
            <th className="px-3 py-2 font-medium">Structured-output failure rate</th>
            <th className="px-3 py-2 font-medium">Avg tokens / listing</th>
            <th className="px-3 py-2 font-medium">Avg cost / successful</th>
            <th className="px-3 py-2 font-medium">Cost / auto-applied field</th>
            <th className="px-3 py-2 font-medium">Avg attention fields / listing</th>
            <th className="px-3 py-2 font-medium">Comparability</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.model}-${row.promptVersion}-${row.schemaVersion}`}
              className="border-t align-top"
            >
              <td className="px-3 py-2">
                <p className="font-mono text-xs">{row.model}</p>
                <p className="text-xs text-muted-foreground">
                  {row.promptVersion} / {row.schemaVersion}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(row.firstSeenAt)} – {formatDateTime(row.lastSeenAt)}
                </p>
              </td>
              <td className="px-3 py-2 font-mono text-xs">
                {formatNumber(row.distinctListings)}
                <span className="ml-1 font-normal text-muted-foreground">
                  ({formatNumber(row.attempts)} attempts)
                </span>
              </td>
              <td className="px-3 py-2 font-mono text-xs">
                {formatPercent(row.successRate)}
              </td>
              <td className="px-3 py-2 font-mono text-xs">
                {formatPercent(row.structuredOutputFailureRate)}
              </td>
              <td className="px-3 py-2 font-mono text-xs">
                {formatNumber(Math.round(row.avgTokensPerListing))}
              </td>
              <td className="px-3 py-2 font-mono text-xs">
                {formatUsd(row.avgCostPerSuccessfulUsd)}
              </td>
              <td className="px-3 py-2 font-mono text-xs">
                {formatUsd(row.costPerAutoAppliedFieldUsd)}
              </td>
              <td className="px-3 py-2 font-mono text-xs">
                {row.avgAttentionFieldsPerListing.toFixed(2)}
              </td>
              <td className="px-3 py-2">
                {row.isMostRecent ? (
                  <StatusBadge tone="info" showDot={false}>
                    Current combination
                  </StatusBadge>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <StatusBadge tone="neutral" showDot={false}>
                      Historical
                    </StatusBadge>
                    <HelpTip label="not directly comparable">
                      A different prompt or schema version changes what the
                      model was asked to do, so this row is not directly
                      comparable to the current combination.
                    </HelpTip>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
