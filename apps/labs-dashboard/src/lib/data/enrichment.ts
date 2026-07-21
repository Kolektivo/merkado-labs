import "server-only";

import { cache } from "react";

import type { AiEnrichmentJob } from "@/lib/domain/types";
import {
  calculateUsageCostUsd,
  COST_ESTIMATE_LABEL,
  parseTokenUsage,
  PRICING_AS_OF,
  safeDivide,
  sumCostUsd,
  sumTokenUsage,
  totalTokenCount,
  type TokenUsage,
} from "@/lib/enrichment/cost";
import { getRecentAiEnrichmentJobs } from "@/lib/data/queries";
import {
  extractFieldDecisions,
  isCurrentPolicyVersions,
  isOperationalAttentionDecision,
} from "@/lib/enrichment/display";
import { PROMPT_VERSION, SCHEMA_VERSION } from "@/lib/enrichment/versions";
import { createLabsAdminClient } from "@/lib/supabase/admin";

/** How many of the most recent proposals to show in the backwards-audit list. */
const AUDIT_LIST_LIMIT = 150;
/** Enough to cover the full recorded job history for this research project. */
const JOB_HISTORY_LIMIT = 300;

export type ProposalQueueItem = {
  id: string;
  listingId: string;
  listingTitle: string | null;
  sourceName: string | null;
  status: string;
  reviewStatus: string;
  confidence: number | null;
  model: string;
  generatedAt: string;
  autoAppliedCount: number;
  needsAttentionCount: number;
  rejectedCount: number;
  inputChecksum: string | null;
  costUsd: number | null;
  retained: boolean;
  attentionFields: Array<{
    label: string;
    key: string;
    currentValue: unknown;
    suggestedValue: unknown;
    evidence: string | null;
    reasons: string[];
    confidence: number | null;
    conflict: boolean;
  }>;
};

export type EnrichmentAuditFilter =
  | "all"
  | "needs_attention"
  | "conflicts"
  | "low_confidence"
  | "changed_by_ai"
  | "failed"
  | "never_enriched"
  | "stale_checksum";

/** One `ai_enrichment_proposals` row: one paid (or skipped) API attempt for one listing. */
export type UsageAttempt = {
  id: string;
  listingId: string;
  listingTitle: string | null;
  sourceName: string | null;
  jobId: string | null;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  inputChecksum: string | null;
  status: string;
  reviewStatus: string;
  confidence: number | null;
  generatedAt: string;
  tokens: TokenUsage;
  costUsd: number | null;
  autoAppliedCount: number;
  needsAttentionCount: number;
  rejectedCount: number;
  errorMessage: string | null;
  apiRequestId: string | null;
  /** Latest attempt for its listing, and that attempt succeeded — the result actually in effect. */
  retained: boolean;
  attentionFields: ProposalQueueItem["attentionFields"];
};

export type EnrichmentCostSummary = {
  costLabel: string;
  pricingAsOf: string;
  grossSpendUsd: number;
  retainedResultCostUsd: number;
  wastedAttemptCostUsd: number;
  totalApiAttempts: number;
  paidApiAttempts: number;
  enrichmentRunCount: number;
  listingsTargeted: number;
  listingsSucceeded: number;
  listingsFailed: number;
  listingsSkipped: number;
  tokenTotals: TokenUsage;
  distinctListingsAttempted: number;
  distinctListingsRetained: number;
  avgCostPerAttemptedListingUsd: number | null;
  avgCostPerSuccessfulListingUsd: number | null;
  avgCostPerChangedPropertyUsd: number | null;
  costPerAutoAppliedFieldUsd: number | null;
  structuredOutputFailureRate: number | null;
  structuredOutputFailureCount: number;
  trueAttentionRate: number | null;
  modelsUsed: string[];
};

export type ModelEfficiencyRow = {
  model: string;
  promptVersion: string;
  schemaVersion: string;
  attempts: number;
  distinctListings: number;
  successCount: number;
  successRate: number;
  structuredOutputFailureCount: number;
  structuredOutputFailureRate: number;
  avgTokensPerListing: number;
  avgCostPerSuccessfulUsd: number | null;
  costPerAutoAppliedFieldUsd: number | null;
  avgAttentionFieldsPerListing: number;
  totalCostUsd: number;
  firstSeenAt: string;
  lastSeenAt: string;
  isMostRecent: boolean;
};

export type EnrichmentRunRow = {
  id: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  sourceLabel: string | null;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  requestedBy: string | null;
  scopeType: string;
  targeted: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  autoAppliedFields: number;
  needsAttentionListings: number;
  rejectedFields: number;
  tokens: TokenUsage;
  costUsd: number | null;
  avgCostPerListingUsd: number | null;
  durationMs: number | null;
  status: string;
  attempts: UsageAttempt[];
};

function isSuccessStatus(status: string): boolean {
  return status === "succeeded" || status === "needs_review";
}

function isStructuredOutputFailure(status: string): boolean {
  return status === "invalid_output";
}

function oneRelation(
  value: Record<string, unknown> | Record<string, unknown>[] | null | undefined,
): Record<string, unknown> | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

const ATTEMPT_SELECT = [
  "id",
  "property_listing_id",
  "enrichment_job_id",
  "model",
  "prompt_version",
  "schema_version",
  "input_checksum",
  "status",
  "review_status",
  "confidence",
  "proposal",
  "token_usage",
  "api_request_id",
  "error_message",
  "generated_at",
  "listing:property_listings(title,source_neighbourhood_text,inferred_neighbourhood_id,source:property_sources(display_name,name))",
].join(",");

/**
 * Every recorded AI enrichment attempt (paginated — the audit UI only shows
 * the most recent slice, but cost/efficiency metrics need the full history).
 */
const loadAllAiEnrichmentAttempts = cache(async (): Promise<UsageAttempt[]> => {
  const client = createLabsAdminClient();
  const pageSize = 500;
  const rows: Record<string, unknown>[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("ai_enrichment_proposals")
      .select(ATTEMPT_SELECT)
      .order("generated_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Unable to load AI enrichment attempts: ${error.message}`);
    }
    const page = (data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  const draft = rows.map((row) => {
    const listing = oneRelation(
      row.listing as Record<string, unknown> | Record<string, unknown>[] | null,
    );
    const source = oneRelation(
      listing?.source as Record<string, unknown> | Record<string, unknown>[] | null,
    );
    const proposalBody =
      row.proposal && typeof row.proposal === "object" && !Array.isArray(row.proposal)
        ? (row.proposal as Record<string, unknown>)
        : {};
    const model = String(row.model);
    const decisions = extractFieldDecisions(proposalBody, {
      model,
      generatedAt: String(row.generated_at),
    });
    const sourceNeighbourhood = listing?.source_neighbourhood_text
      ? String(listing.source_neighbourhood_text)
      : null;
    // Presence of a map assignment is enough to demote neighbourhood AI noise
    // even when the polygon name is not joined into this select.
    const mapNeighbourhood = listing?.inferred_neighbourhood_id
      ? "map_assigned"
      : null;
    const operationalAttention = decisions.filter((decision) =>
      isOperationalAttentionDecision(decision, {
        sourceNeighbourhood,
        mapNeighbourhood,
      }),
    );
    const tokens = parseTokenUsage(row.token_usage);
    const status = String(row.status);

    return {
      id: String(row.id),
      listingId: String(row.property_listing_id),
      listingTitle: listing?.title ? String(listing.title) : null,
      sourceName: source?.display_name
        ? String(source.display_name)
        : source?.name
          ? String(source.name)
          : null,
      jobId: row.enrichment_job_id ? String(row.enrichment_job_id) : null,
      model,
      promptVersion: String(row.prompt_version),
      schemaVersion: String(row.schema_version),
      inputChecksum: row.input_checksum ? String(row.input_checksum) : null,
      status,
      reviewStatus: row.review_status ? String(row.review_status) : "unreviewed",
      confidence:
        row.confidence === null || row.confidence === undefined
          ? null
          : Number(row.confidence),
      generatedAt: String(row.generated_at),
      tokens,
      costUsd: calculateUsageCostUsd(model, tokens),
      autoAppliedCount: decisions.filter((d) => d.status === "auto_applied").length,
      needsAttentionCount: operationalAttention.length,
      attentionFields: operationalAttention.map((decision) => ({
        label: decision.displayLabel,
        key: decision.key,
        currentValue: decision.before,
        suggestedValue: decision.after,
        evidence: decision.evidence,
        reasons: decision.reasons,
        confidence: decision.confidence,
        conflict: decision.conflict,
      })),
      rejectedCount: decisions.filter((d) => d.status === "rejected").length,
      errorMessage: row.error_message ? String(row.error_message) : null,
      apiRequestId: row.api_request_id ? String(row.api_request_id) : null,
      retained: false,
    };
  });

  return markRetainedAttempts(draft);
});

/**
 * Marks the retained attempt per listing.
 * Prefer current v5 prompt/schema (matches public_property_listings), then
 * newest successful attempt. Historical v3/v4 rows must not drive the
 * operational "Needs review" badge when a newer v5 result exists.
 */
function markRetainedAttempts(attempts: UsageAttempt[]): UsageAttempt[] {
  const byListing = new Map<string, UsageAttempt[]>();
  for (const attempt of attempts) {
    const list = byListing.get(attempt.listingId) ?? [];
    list.push(attempt);
    byListing.set(attempt.listingId, list);
  }
  const retainedIds = new Set<string>();
  for (const list of byListing.values()) {
    const successful = list.filter((a) => isSuccessStatus(a.status));
    if (!successful.length) continue;
    const ranked = [...successful].sort((a, b) => {
      const aV4 = isCurrentPolicyVersions(a.promptVersion, a.schemaVersion)
        ? 0
        : 1;
      const bV4 = isCurrentPolicyVersions(b.promptVersion, b.schemaVersion)
        ? 0
        : 1;
      if (aV4 !== bV4) return aV4 - bV4;
      return b.generatedAt.localeCompare(a.generatedAt);
    });
    retainedIds.add(ranked[0]!.id);
  }
  return attempts.map((attempt) => ({
    ...attempt,
    retained: retainedIds.has(attempt.id),
  }));
}

/**
 * Overview-only count of listings whose retained current-contract proposal still
 * has operational needs_attention. Avoids loading the full proposal audit history
 * (which timeouts after large English-presentation backfills).
 */
export const getRetainedAttentionListingCount = cache(async () => {
  const client = createLabsAdminClient();
  const pageSize = 200;
  const latestByListing = new Map<
    string,
    {
      generatedAt: string;
      needsAttention: boolean;
    }
  >();

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("ai_enrichment_proposals")
      .select(
        [
          "property_listing_id",
          "status",
          "generated_at",
          "proposal",
          "listing:property_listings(source_neighbourhood_text,inferred_neighbourhood_id)",
        ].join(","),
      )
      .eq("prompt_version", PROMPT_VERSION)
      .eq("schema_version", SCHEMA_VERSION)
      .order("generated_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(
        `Unable to load AI enrichment attention counts: ${error.message}`,
      );
    }

    const page = (data ?? []) as unknown as Record<string, unknown>[];
    for (const row of page) {
      if (!isSuccessStatus(String(row.status))) continue;
      const listingId = String(row.property_listing_id);
      if (latestByListing.has(listingId)) continue;

      const listing = oneRelation(
        row.listing as Record<string, unknown> | Record<string, unknown>[] | null,
      );
      const proposalBody =
        row.proposal && typeof row.proposal === "object" && !Array.isArray(row.proposal)
          ? (row.proposal as Record<string, unknown>)
          : {};
      const decisions = extractFieldDecisions(proposalBody, {
        model: "overview",
        generatedAt: String(row.generated_at),
      });
      const sourceNeighbourhood = listing?.source_neighbourhood_text
        ? String(listing.source_neighbourhood_text)
        : null;
      const mapNeighbourhood = listing?.inferred_neighbourhood_id
        ? "map_assigned"
        : null;
      const needsAttention = decisions.some((decision) =>
        isOperationalAttentionDecision(decision, {
          sourceNeighbourhood,
          mapNeighbourhood,
        }),
      );
      latestByListing.set(listingId, {
        generatedAt: String(row.generated_at),
        needsAttention,
      });
    }

    if (page.length < pageSize) break;
  }

  let count = 0;
  for (const entry of latestByListing.values()) {
    if (entry.needsAttention) count += 1;
  }
  return count;
});

function attemptToProposalQueueItem(attempt: UsageAttempt): ProposalQueueItem {
  return {
    id: attempt.id,
    listingId: attempt.listingId,
    listingTitle: attempt.listingTitle,
    sourceName: attempt.sourceName,
    status: attempt.status,
    reviewStatus: attempt.reviewStatus,
    confidence: attempt.confidence,
    model: attempt.model,
    generatedAt: attempt.generatedAt,
    autoAppliedCount: attempt.autoAppliedCount,
    needsAttentionCount: attempt.needsAttentionCount,
    rejectedCount: attempt.rejectedCount,
    inputChecksum: attempt.inputChecksum,
    costUsd: attempt.costUsd,
    retained: attempt.retained,
    attentionFields: attempt.attentionFields,
  };
}

export function buildEnrichmentCostSummary(
  attempts: UsageAttempt[],
  jobs: AiEnrichmentJob[],
): EnrichmentCostSummary {
  const paidAttempts = attempts.filter((a) => totalTokenCount(a.tokens) > 0);
  const retainedAttempts = attempts.filter((a) => a.retained);

  const grossSpendUsd = sumCostUsd(paidAttempts.map((a) => a.costUsd));
  const retainedResultCostUsd = sumCostUsd(retainedAttempts.map((a) => a.costUsd));
  const wastedAttemptCostUsd = Math.max(grossSpendUsd - retainedResultCostUsd, 0);

  const distinctListingsAttempted = new Set(attempts.map((a) => a.listingId)).size;
  const distinctListingsRetained = new Set(retainedAttempts.map((a) => a.listingId))
    .size;

  const totalAutoAppliedFieldsAll = attempts.reduce(
    (sum, a) => sum + a.autoAppliedCount,
    0,
  );
  const totalAutoAppliedFieldsRetained = retainedAttempts.reduce(
    (sum, a) => sum + a.autoAppliedCount,
    0,
  );
  const listingsWithAttentionRetained = new Set(
    retainedAttempts
      .filter((a) => a.needsAttentionCount > 0)
      .map((a) => a.listingId),
  ).size;

  const structuredOutputFailureCount = attempts.filter((a) =>
    isStructuredOutputFailure(a.status),
  ).length;

  const tokenTotals = sumTokenUsage(paidAttempts.map((a) => a.tokens));

  const listingsTargeted = jobs.reduce((sum, job) => sum + job.totalListings, 0);
  const listingsSucceeded = jobs.reduce((sum, job) => sum + job.succeededCount, 0);
  const listingsFailed = jobs.reduce((sum, job) => sum + job.failedCount, 0);
  const listingsSkipped = jobs.reduce(
    (sum, job) => sum + job.skippedUnchangedCount,
    0,
  );

  return {
    costLabel: COST_ESTIMATE_LABEL,
    pricingAsOf: PRICING_AS_OF,
    grossSpendUsd,
    retainedResultCostUsd,
    wastedAttemptCostUsd,
    totalApiAttempts: attempts.length,
    paidApiAttempts: paidAttempts.length,
    enrichmentRunCount: jobs.length,
    listingsTargeted,
    listingsSucceeded,
    listingsFailed,
    listingsSkipped,
    tokenTotals,
    distinctListingsAttempted,
    distinctListingsRetained,
    avgCostPerAttemptedListingUsd: safeDivide(
      grossSpendUsd,
      distinctListingsAttempted,
    ),
    avgCostPerSuccessfulListingUsd: safeDivide(
      retainedResultCostUsd,
      distinctListingsRetained,
    ),
    avgCostPerChangedPropertyUsd: safeDivide(
      retainedResultCostUsd,
      totalAutoAppliedFieldsRetained,
    ),
    costPerAutoAppliedFieldUsd: safeDivide(grossSpendUsd, totalAutoAppliedFieldsAll),
    structuredOutputFailureRate: safeDivide(
      structuredOutputFailureCount,
      attempts.length,
    ),
    structuredOutputFailureCount,
    trueAttentionRate: safeDivide(
      listingsWithAttentionRetained,
      distinctListingsRetained,
    ),
    modelsUsed: [...new Set(attempts.map((a) => a.model))],
  };
}

/**
 * Grouped by (model, prompt_version, schema_version) — different combinations
 * are not directly comparable, since prompt/schema changes shift what the
 * model is even being asked to do.
 */
export function buildModelEfficiencyRows(
  attempts: UsageAttempt[],
): ModelEfficiencyRow[] {
  const groups = new Map<string, UsageAttempt[]>();
  for (const attempt of attempts) {
    const key = `${attempt.model}::${attempt.promptVersion}::${attempt.schemaVersion}`;
    const list = groups.get(key) ?? [];
    list.push(attempt);
    groups.set(key, list);
  }

  const rows = [...groups.entries()].map(([key, list]) => {
    const [model, promptVersion, schemaVersion] = key.split("::");
    const distinctListings = new Set(list.map((a) => a.listingId)).size;
    const successList = list.filter((a) => isSuccessStatus(a.status));
    const failureList = list.filter((a) => isStructuredOutputFailure(a.status));
    const totalTokens = sumTokenUsage(list.map((a) => a.tokens));
    const totalCostUsd = sumCostUsd(list.map((a) => a.costUsd));
    const successCostUsd = sumCostUsd(successList.map((a) => a.costUsd));
    const autoAppliedFieldsTotal = list.reduce(
      (sum, a) => sum + a.autoAppliedCount,
      0,
    );
    const attentionFieldsTotal = list.reduce(
      (sum, a) => sum + a.needsAttentionCount,
      0,
    );
    const sortedByTime = [...list].sort((a, b) =>
      a.generatedAt.localeCompare(b.generatedAt),
    );

    return {
      model,
      promptVersion,
      schemaVersion,
      attempts: list.length,
      distinctListings,
      successCount: successList.length,
      successRate: safeDivide(successList.length, list.length) ?? 0,
      structuredOutputFailureCount: failureList.length,
      structuredOutputFailureRate: safeDivide(failureList.length, list.length) ?? 0,
      avgTokensPerListing: distinctListings
        ? totalTokenCount(totalTokens) / distinctListings
        : 0,
      avgCostPerSuccessfulUsd: safeDivide(successCostUsd, successList.length),
      costPerAutoAppliedFieldUsd: safeDivide(totalCostUsd, autoAppliedFieldsTotal),
      avgAttentionFieldsPerListing: distinctListings
        ? attentionFieldsTotal / distinctListings
        : 0,
      totalCostUsd,
      firstSeenAt: sortedByTime[0]?.generatedAt ?? "",
      lastSeenAt: sortedByTime[sortedByTime.length - 1]?.generatedAt ?? "",
      isMostRecent: false,
    };
  });

  rows.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  if (rows.length) rows[0].isMostRecent = true;
  return rows;
}

export function buildEnrichmentRunRows(
  jobs: AiEnrichmentJob[],
  attempts: UsageAttempt[],
): EnrichmentRunRow[] {
  const attemptsByJob = new Map<string, UsageAttempt[]>();
  for (const attempt of attempts) {
    if (!attempt.jobId) continue;
    const list = attemptsByJob.get(attempt.jobId) ?? [];
    list.push(attempt);
    attemptsByJob.set(attempt.jobId, list);
  }

  return jobs.map((job) => {
    const jobAttempts = (attemptsByJob.get(job.id) ?? []).sort((a, b) =>
      a.generatedAt.localeCompare(b.generatedAt),
    );
    const sourceNames = [
      ...new Set(jobAttempts.map((a) => a.sourceName).filter(Boolean)),
    ] as string[];

    const declaredTokens = parseTokenUsage(job.tokenUsage);
    const tokens =
      totalTokenCount(declaredTokens) > 0
        ? declaredTokens
        : sumTokenUsage(jobAttempts.map((a) => a.tokens));

    const summary =
      job.summary && typeof job.summary === "object" && !Array.isArray(job.summary)
        ? (job.summary as Record<string, unknown>)
        : {};
    const summaryCost =
      typeof summary.exact_cost_usd === "number" ? summary.exact_cost_usd : null;
    const costUsd =
      summaryCost ?? calculateUsageCostUsd(job.model, tokens) ?? null;
    const autoAppliedFields =
      typeof summary.auto_applied_fields === "number"
        ? summary.auto_applied_fields
        : jobAttempts.reduce((sum, a) => sum + a.autoAppliedCount, 0);
    const needsAttentionListings =
      typeof summary.needs_attention_listings === "number"
        ? summary.needs_attention_listings
        : new Set(
            jobAttempts.filter((a) => a.needsAttentionCount > 0).map((a) => a.listingId),
          ).size;
    const rejectedFields = jobAttempts.reduce((sum, a) => sum + a.rejectedCount, 0);
    const durationMs =
      job.startedAt && job.completedAt
        ? new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()
        : null;
    const denominator = job.processedCount || jobAttempts.length;

    return {
      id: job.id,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      sourceLabel: sourceNames.length ? sourceNames.join(", ") : null,
      model: job.model,
      promptVersion: job.promptVersion,
      schemaVersion: job.schemaVersion,
      requestedBy: job.requestedBy,
      scopeType: job.scopeType,
      targeted: job.totalListings,
      processed: job.processedCount,
      succeeded: job.succeededCount,
      failed: job.failedCount,
      skipped: job.skippedUnchangedCount,
      autoAppliedFields,
      needsAttentionListings,
      rejectedFields,
      tokens,
      costUsd,
      avgCostPerListingUsd: safeDivide(costUsd ?? 0, denominator),
      durationMs,
      status: job.status,
      attempts: jobAttempts,
    };
  });
}

export const getEnrichmentDashboard = cache(async () => {
  const client = createLabsAdminClient();
  const [
    attempts,
    jobs,
    { count: unreviewedCount, error: unreviewedError },
    { count: needsReviewCount, error: needsReviewError },
    { count: failedCount, error: failedError },
    { count: neverEnrichedCount, error: neverError },
  ] = await Promise.all([
    loadAllAiEnrichmentAttempts(),
    getRecentAiEnrichmentJobs(JOB_HISTORY_LIMIT),
    client
      .from("ai_enrichment_proposals")
      .select("id", { count: "exact", head: true })
      .eq("review_status", "unreviewed"),
    client
      .from("ai_enrichment_proposals")
      .select("id", { count: "exact", head: true })
      .eq("status", "needs_review"),
    client
      .from("ai_enrichment_proposals")
      .select("id", { count: "exact", head: true })
      .in("status", ["failed", "invalid_output"]),
    client
      .from("property_listings")
      .select("id", { count: "exact", head: true })
      .or("enrichment_status.is.null,enrichment_status.eq.not_run"),
  ]);

  if (unreviewedError || needsReviewError || failedError || neverError) {
    throw new Error(
      `Unable to load AI proposals: ${
        unreviewedError?.message ??
        needsReviewError?.message ??
        failedError?.message ??
        neverError?.message
      }`,
    );
  }

  const proposals: ProposalQueueItem[] = attempts
    .slice(0, AUDIT_LIST_LIMIT)
    .map(attemptToProposalQueueItem);

  const retainedAttempts = attempts.filter((a) => a.retained);
  /** Current retained results that still have actionable review work. */
  const attentionQueue = retainedAttempts
    .filter((a) => a.needsAttentionCount > 0)
    .map(attemptToProposalQueueItem);
  const autoAppliedFields = retainedAttempts.reduce(
    (sum, a) => sum + a.autoAppliedCount,
    0,
  );
  const needsAttentionListings = new Set(
    attentionQueue.map((a) => a.listingId),
  ).size;
  const models = new Set(attempts.map((a) => a.model));

  const costSummary = buildEnrichmentCostSummary(attempts, jobs);
  const modelEfficiency = buildModelEfficiencyRows(attempts);
  const runRows = buildEnrichmentRunRows(jobs, attempts);

  return {
    proposals,
    attentionQueue,
    jobs,
    runRows,
    costSummary,
    modelEfficiency,
    unreviewed: unreviewedCount ?? 0,
    needsReview: needsReviewCount ?? 0,
    failed: failedCount ?? 0,
    neverEnriched: neverEnrichedCount ?? 0,
    autoAppliedFields,
    needsAttentionListings,
    models: [...models],
  };
});

export function filterEnrichmentProposals(
  proposals: ProposalQueueItem[],
  filter: EnrichmentAuditFilter | null,
): ProposalQueueItem[] {
  if (!filter || filter === "all") return proposals;
  switch (filter) {
    case "needs_attention":
      // Retained + operational attention only — historical / superseded rows
      // and demoted neighbourhood echoes are not current review work.
      return proposals.filter((p) => p.retained && p.needsAttentionCount > 0);
    case "conflicts":
      return proposals.filter(
        (p) =>
          p.retained &&
          p.attentionFields.some(
            (field) =>
              field.conflict ||
              field.reasons.includes("model_conflict_indicator") ||
              field.reasons.includes("effective_resolver_conflict"),
          ),
      );
    case "low_confidence":
      return proposals.filter(
        (p) => p.confidence !== null && p.confidence < 0.85,
      );
    case "changed_by_ai":
      return proposals.filter((p) => p.autoAppliedCount > 0);
    case "failed":
      return proposals.filter((p) =>
        ["failed", "invalid_output"].includes(p.status),
      );
    case "stale_checksum":
      // Stale means proposal exists but listing may have newer checksum — approximated by needs_review + older runs.
      return proposals.filter((p) => p.status === "needs_review");
    case "never_enriched":
      return [];
    default:
      return proposals;
  }
}
