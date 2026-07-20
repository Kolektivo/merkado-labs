import Link from "next/link";
import { Sparkles } from "lucide-react";

import { ProposalReviewControl } from "@/components/proposal-review-control";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AiEnrichmentProposal } from "@/lib/domain/types";
import {
  calculateUsageCostUsd,
  COST_ESTIMATE_LABEL,
  formatUsd,
  isSuccessfulProposalStatus,
  parseTokenUsage,
  sumCostUsd,
  totalTokenCount,
} from "@/lib/enrichment/cost";
import {
  decisionStatusLabel,
  extractFieldDecisions,
  isOperationalAttentionDecision,
  type FieldDecisionView,
} from "@/lib/enrichment/display";
import { formatDateTime, formatNumber } from "@/lib/format";

function statusTone(
  status: FieldDecisionView["status"],
): "success" | "warning" | "error" | "neutral" {
  if (status === "auto_applied") return "success";
  if (status === "needs_attention") return "warning";
  if (status === "rejected") return "error";
  return "neutral";
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function ListingAiChanges({
  proposals,
  selectedChecksum,
  sourceNeighbourhoodText = null,
  mapNeighbourhoodName = null,
}: {
  proposals: AiEnrichmentProposal[];
  selectedChecksum?: string | null;
  sourceNeighbourhoodText?: string | null;
  mapNeighbourhoodName?: string | null;
}) {
  if (!proposals.length) {
    return (
      <Card>
        <CardHeader className="border-b">
          <CardTitle>AI changes</CardTitle>
          <CardDescription>
            No enrichment runs yet. Successful high-confidence fields will apply
            automatically when enrichment is enabled.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const selected =
    proposals.find((item) => item.inputChecksum === selectedChecksum) ??
    proposals[0];
  const decisions = extractFieldDecisions(selected.proposal, {
    model: selected.model,
    generatedAt: selected.generatedAt,
  });
  const attention = decisions.filter((d) =>
    isOperationalAttentionDecision(d, {
      sourceNeighbourhood: sourceNeighbourhoodText,
      mapNeighbourhood: mapNeighbourhoodName,
    }),
  );
  const applied = decisions.filter((d) => d.status === "auto_applied");
  const rejected = decisions.filter((d) => d.status === "rejected");
  const evidence = selected.supportingEvidence;
  const runAudit =
    evidence && typeof evidence === "object" && !Array.isArray(evidence)
      ? (evidence as Record<string, unknown>).run_audit
      : null;
  const audit =
    runAudit && typeof runAudit === "object" && !Array.isArray(runAudit)
      ? (runAudit as Record<string, unknown>)
      : null;

  const latest = proposals[0];
  const latestTokens = parseTokenUsage(latest.tokenUsage);
  const latestCostUsd = calculateUsageCostUsd(latest.model, latestTokens);
  const latestDecisions = extractFieldDecisions(latest.proposal, {
    model: latest.model,
    generatedAt: latest.generatedAt,
  });
  const latestApplied = latestDecisions.filter(
    (d) => d.status === "auto_applied",
  ).length;
  const latestAttention = latestDecisions.filter((d) =>
    isOperationalAttentionDecision(d, {
      sourceNeighbourhood: sourceNeighbourhoodText,
      mapNeighbourhood: mapNeighbourhoodName,
    }),
  ).length;
  const cumulativeCostUsd = sumCostUsd(
    proposals.map((item) =>
      calculateUsageCostUsd(item.model, parseTokenUsage(item.tokenUsage)),
    ),
  );
  const latestIsRetained = isSuccessfulProposalStatus(latest.status);
  const failedOrSupersededCount = latestIsRetained
    ? proposals.length - 1
    : proposals.length;

  return (
    <div className="space-y-4">
      <details className="rounded-xl border bg-card p-4">
        <summary className="cursor-pointer font-medium">
          AI run and cost details
        </summary>
        <p className="mt-1 text-xs text-muted-foreground">
          Model, token use, estimated cost, and prior attempts.
        </p>
        <div className="mt-4">
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Latest model</dt>
              <dd className="font-mono">{latest.model}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                Latest enrichment time
              </dt>
              <dd>{formatDateTime(latest.generatedAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                Latest run tokens / cost
              </dt>
              <dd>
                {formatNumber(totalTokenCount(latestTokens))} tokens ·{" "}
                <span className="font-mono">{formatUsd(latestCostUsd)}</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                Fields applied / attention (latest run)
              </dt>
              <dd>
                {latestApplied} applied · {latestAttention} attention
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                Cumulative attempts{proposals.length >= 50 ? " (last 50)" : ""}
              </dt>
              <dd>{proposals.length}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                Cumulative estimated cost
              </dt>
              <dd className="font-mono">{formatUsd(cumulativeCostUsd)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                Failed / superseded attempts
              </dt>
              <dd>{failedOrSupersededCount}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            {COST_ESTIMATE_LABEL}
          </p>
        </div>
      </details>
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>AI changes</CardTitle>
                <Badge variant="outline" className="font-normal">
                  AI extracted
                </Badge>
              </div>
              <CardDescription>
                Before/after from the selected enrichment run. Exceptions are
                highlighted; successful auto-applied fields do not need approval.
              </CardDescription>
            </div>
            <Button variant="outline" asChild>
              <Link href="/enrichment?view=attention&filter=needs_attention">
                <Sparkles data-icon="inline-start" />
                Open needs attention
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {proposals.map((item) => {
              const active = item.id === selected.id;
              return (
                <Badge
                  key={item.id}
                  variant={active ? "default" : "outline"}
                  className="font-normal"
                >
                  {formatDateTime(item.generatedAt)} · {item.model}
                </Badge>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <StatusBadge tone="success">
              {applied.length} auto-applied
            </StatusBadge>
            <StatusBadge tone="warning">
              {attention.length} need attention
            </StatusBadge>
            <StatusBadge tone="neutral">{rejected.length} rejected</StatusBadge>
            <Badge variant="outline">{selected.model}</Badge>
          </div>

          {attention.length ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Needs review
              </h3>
              <DecisionTable decisions={attention} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No fields need attention for this run.
            </p>
          )}

          {applied.length ? (
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Applied changes ({applied.length})
              </summary>
              <div className="mt-3">
                <DecisionTable decisions={applied} />
              </div>
            </details>
          ) : null}

          {rejected.length ? (
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Detailed audit ({rejected.length} rejected)
              </summary>
              <div className="mt-3">
                <DecisionTable decisions={rejected} />
              </div>
            </details>
          ) : null}

          <details className="rounded-lg border border-dashed p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Advanced metadata (checksums, rejected noise, review notes)
            </summary>
            <div className="mt-3 space-y-3">
              {audit ? (
                <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  <div>Proposed: {String(audit.fields_proposed ?? "—")}</div>
                  <div>
                    Input fingerprint:{" "}
                    <span className="break-all font-mono">
                      {String(audit.input_checksum ?? selected.inputChecksum)}
                    </span>
                  </div>
                </dl>
              ) : null}
              <ProposalReviewControl
                proposalId={selected.id}
                initialStatus={selected.reviewStatus}
                initialNotes={selected.reviewNotes}
              />
            </div>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}

function DecisionTable({ decisions }: { decisions: FieldDecisionView[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Field</th>
            <th className="px-3 py-2 font-medium">Before</th>
            <th className="px-3 py-2 font-medium">After</th>
            <th className="px-3 py-2 font-medium">Why / evidence</th>
            <th className="px-3 py-2 font-medium">Confidence</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {decisions.map((decision) => (
            <tr key={`${decision.key}-${decision.status}`} className="border-t">
              <td className="px-3 py-2 font-medium">{decision.displayLabel}</td>
              <td className="px-3 py-2 text-muted-foreground">
                {formatValue(decision.before)}
              </td>
              <td className="px-3 py-2">{formatValue(decision.after)}</td>
              <td className="max-w-xs px-3 py-2 text-xs text-muted-foreground">
                {decision.evidence ?? "—"}
              </td>
              <td className="px-3 py-2 font-mono text-xs">
                {decision.confidence !== null
                  ? `${Math.round(decision.confidence * 100)}%`
                  : "—"}
              </td>
              <td className="px-3 py-2">
                <StatusBadge tone={statusTone(decision.status)}>
                  {decisionStatusLabel(decision.status)}
                </StatusBadge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
