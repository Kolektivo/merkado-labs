export type ApproveThenSendOutcome =
  | { status: "confirmed" }
  | { status: "pending"; reason?: string }
  | { status: "error"; message: string };

export type ApproveThenSendStep = "idle" | "approve" | "send" | "verify" | "done";

export function settledApproveThenSendState(outcome: ApproveThenSendOutcome): {
  step: ApproveThenSendStep;
  submitted: boolean;
  error: string | null;
  pendingReason: string | null;
} {
  if (outcome.status === "confirmed") {
    return { step: "done", submitted: false, error: null, pendingReason: null };
  }
  if (outcome.status === "pending") {
    return {
      step: "verify",
      submitted: true,
      error: null,
      pendingReason: outcome.reason ?? null,
    };
  }
  return { step: "idle", submitted: false, error: outcome.message, pendingReason: null };
}
