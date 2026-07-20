/**
 * AI enrichment cost math for the dashboard, mirrored from
 * `src/merkado_labs/enrichment/pricing.py` so Labs never shows a number the
 * Python pipeline could not reproduce. Estimates only — never an OpenAI
 * invoice total and never converted to XCG.
 */

export const PRICING_AS_OF = "2026-07-17";
export const PRICING_SOURCE = "labs_configured_model_rates_v1";

/** Shown next to every displayed cost figure on this dashboard. */
export const COST_ESTIMATE_LABEL =
  "Estimated from recorded token usage and configured model pricing.";

export type TokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
};

export const ZERO_TOKEN_USAGE: TokenUsage = {
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
};

type ModelRate = {
  input: number;
  cachedInput: number;
  output: number;
};

/** USD per 1M tokens. Keep in lockstep with MODEL_PRICES_USD_PER_1M in pricing.py. */
export const MODEL_RATES_USD_PER_1M: Record<string, ModelRate> = {
  "gpt-4.1-mini": { input: 0.4, cachedInput: 0.1, output: 1.6 },
  "gpt-4.1": { input: 2.0, cachedInput: 0.5, output: 8.0 },
  "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.6 },
  "gpt-5.6-terra": { input: 2.5, cachedInput: 0.25, output: 15.0 },
};

export function modelRate(model: string | null | undefined): ModelRate | null {
  if (!model) return null;
  return MODEL_RATES_USD_PER_1M[model] ?? null;
}

export function isKnownModel(model: string | null | undefined): boolean {
  return modelRate(model) !== null;
}

function positiveInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.trunc(n);
}

/** Normalize a stored `token_usage` JSON blob (proposal or job row) into a typed shape. */
export function parseTokenUsage(raw: unknown): TokenUsage {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...ZERO_TOKEN_USAGE };
  }
  const record = raw as Record<string, unknown>;
  return {
    inputTokens: positiveInt(record.input_tokens),
    cachedInputTokens: positiveInt(
      record.cached_input_tokens ?? record.input_tokens_cached,
    ),
    outputTokens: positiveInt(record.output_tokens),
    reasoningTokens: positiveInt(record.reasoning_tokens),
  };
}

export function addTokenUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    reasoningTokens: a.reasoningTokens + b.reasoningTokens,
  };
}

export function sumTokenUsage(list: TokenUsage[]): TokenUsage {
  return list.reduce(addTokenUsage, { ...ZERO_TOKEN_USAGE });
}

/** Reasoning tokens are billed as part of output by the Responses API; do not double-count. */
export function totalTokenCount(usage: TokenUsage): number {
  return usage.inputTokens + usage.outputTokens;
}

/**
 * Exact cost from observed token categories for one model. Mirrors
 * `calculate_usage_cost_usd` in pricing.py line for line. Returns null when
 * the model has no configured rate — never borrow another model's price.
 */
export function calculateUsageCostUsd(
  model: string | null | undefined,
  tokens: TokenUsage,
): number | null {
  const rate = modelRate(model);
  if (!rate) return null;

  let billableInput = Math.max(tokens.inputTokens - tokens.cachedInputTokens, 0);
  let cachedTokens = tokens.cachedInputTokens;
  if (
    tokens.cachedInputTokens > 0 &&
    tokens.inputTokens > 0 &&
    tokens.cachedInputTokens > tokens.inputTokens
  ) {
    // Provider reported cached > input; bill all input at the cached rate.
    billableInput = 0;
    cachedTokens = tokens.inputTokens;
  }

  const cost =
    (billableInput / 1_000_000) * rate.input +
    (cachedTokens / 1_000_000) * rate.cachedInput +
    (tokens.outputTokens / 1_000_000) * rate.output;

  return Math.round(cost * 10_000) / 10_000;
}

export function sumCostUsd(values: Array<number | null>): number {
  return values.reduce((sum: number, value) => sum + (value ?? 0), 0);
}

/** USD amounts here are cents-scale; keep enough precision to not round to zero. */
export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  const digits = Math.abs(value) < 1 ? 4 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatUsdPerUnit(
  value: number | null | undefined,
  unit: string,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return `— / ${unit}`;
  }
  return `${formatUsd(value)} / ${unit}`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return `${Math.round(value * 1000) / 10}%`;
}

/** Mirrors the `ai_enrichment_proposals.status` values that count as a usable result. */
export function isSuccessfulProposalStatus(status: string | null | undefined): boolean {
  return status === "succeeded" || status === "needs_review";
}

/** The model's response could not be parsed into the expected schema. */
export function isStructuredOutputFailureStatus(
  status: string | null | undefined,
): boolean {
  return status === "invalid_output";
}

export function safeDivide(
  numerator: number,
  denominator: number,
): number | null {
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}
