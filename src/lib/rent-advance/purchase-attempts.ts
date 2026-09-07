import type {
  OnchainOfferState,
  PurchaseAttempt,
  PurchaseAttemptStatus,
} from "@/lib/rent-advance/types";

export function isTransactionHash(value: string): boolean {
  return /^0x[0-9a-f]{64}$/i.test(value);
}

export function purchaseAttemptsFor(
  onchain: OnchainOfferState,
): PurchaseAttempt[] {
  const attempts = Array.isArray(onchain.purchaseAttempts)
    ? onchain.purchaseAttempts.filter(
        (attempt) =>
          isTransactionHash(attempt.txHash) &&
          /^0x[0-9a-f]{40}$/i.test(attempt.buyerAddress),
      )
    : [];
  const legacyHash = onchain.submittedPurchaseTxHash;
  const legacyBuyer = onchain.submittedPurchaseBuyer;
  if (
    legacyHash &&
    legacyBuyer &&
    isTransactionHash(legacyHash) &&
    !attempts.some(
      (attempt) => attempt.txHash.toLowerCase() === legacyHash.toLowerCase(),
    )
  ) {
    attempts.push({
      txHash: legacyHash,
      buyerAddress: legacyBuyer,
      accountId: null,
      submittedAt: null,
      status: "pending",
    });
  }
  return attempts;
}

function withLatestPending(
  onchain: OnchainOfferState,
  attempts: PurchaseAttempt[],
): OnchainOfferState {
  let latest: PurchaseAttempt | undefined;
  for (const attempt of attempts) {
    if (attempt.status !== "pending") continue;
    if (!latest || (attempt.submittedAt ?? "") >= (latest.submittedAt ?? "")) {
      latest = attempt;
    }
  }
  return {
    ...onchain,
    purchaseAttempts: attempts,
    submittedPurchaseTxHash: latest?.txHash ?? null,
    submittedPurchaseBuyer: latest?.buyerAddress ?? null,
  };
}

export function appendPurchaseAttempt(
  onchain: OnchainOfferState,
  attempt: Omit<PurchaseAttempt, "status">,
): OnchainOfferState {
  const attempts = purchaseAttemptsFor(onchain);
  const existing = attempts.findIndex(
    (row) => row.txHash.toLowerCase() === attempt.txHash.toLowerCase(),
  );
  const pending: PurchaseAttempt = { ...attempt, status: "pending" };
  if (existing >= 0) attempts[existing] = pending;
  else attempts.push(pending);
  return withLatestPending(onchain, attempts);
}

export function settlePurchaseAttempt(
  onchain: OnchainOfferState,
  txHash: string,
  status: Exclude<PurchaseAttemptStatus, "pending">,
  failureReason?: string | null,
): OnchainOfferState {
  const attempts = purchaseAttemptsFor(onchain).map((attempt) => {
    if (
      status === "confirmed" &&
      attempt.txHash.toLowerCase() !== txHash.toLowerCase()
    ) {
      return attempt.status === "pending"
        ? { ...attempt, status: "superseded" as const }
        : attempt;
    }
    if (attempt.txHash.toLowerCase() !== txHash.toLowerCase()) return attempt;
    return { ...attempt, status, failureReason: failureReason ?? null };
  });
  return withLatestPending(onchain, attempts);
}

export function hasPendingPurchaseAttempt(onchain: OnchainOfferState): boolean {
  if (
    purchaseAttemptsFor(onchain).some(
      (attempt) => attempt.status === "pending",
    )
  ) {
    return true;
  }
  // Backward-compatible: a legacy submitted hash without a recorded buyer
  // still represents an unresolved purchase.
  return Boolean(onchain.submittedPurchaseTxHash);
}
