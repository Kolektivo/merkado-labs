import "server-only";

import { createLabsAdminClient } from "@/lib/supabase/admin";

export type PaymentVerificationRecord = {
  paymentRequestId: string;
  chainId: number;
  txHash: string;
  logIndex: number;
  senderAddress: string;
  recipientAddress: string;
  tokenContract: string;
  atomicAmount: number;
  blockNumber: bigint;
  confirmations: number;
  status: "pending" | "confirmed" | "failed";
};

export type VerificationWriteResult = {
  recorded: boolean;
  firstConfirmed: boolean;
};

/**
 * Persist a server-side live payment verification into
 * `ra_payment_verifications`, idempotently.
 *
 * Guarantees come from the database:
 *  - unique (chain_id, tx_hash, log_index): one row per on-chain transfer log;
 *  - partial unique index on (payment_request_id) where status = 'confirmed':
 *    at most one confirmed verification per payment request.
 *
 * `firstConfirmed` is true only when THIS write created the confirmed row for
 * that payment request, so the caller can apply the book outcome exactly once.
 * A second, different transfer for the same request is accepted without
 * throwing (the confirmed-once constraint keeps the first row authoritative).
 */
export async function recordPaymentVerification(
  input: PaymentVerificationRecord,
): Promise<VerificationWriteResult> {
  const supabase = createLabsAdminClient();
  const row = {
    payment_request_id: input.paymentRequestId,
    chain_id: input.chainId,
    tx_hash: input.txHash,
    log_index: input.logIndex,
    sender_address: input.senderAddress,
    recipient_address: input.recipientAddress,
    token_contract: input.tokenContract,
    atomic_amount: input.atomicAmount,
    block_number: input.blockNumber.toString(),
    confirmations: input.confirmations,
    status: input.status,
    verified_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("ra_payment_verifications")
    .upsert(row, { onConflict: "chain_id,tx_hash,log_index", ignoreDuplicates: true })
    .select("id,status");
  if (error && error.code !== "23505") throw error;

  if (data?.length) {
    return {
      recorded: true,
      firstConfirmed: data[0].status === "confirmed",
    };
  }

  const { data: existing } = await supabase
    .from("ra_payment_verifications")
    .select("id,status")
    .eq("chain_id", input.chainId)
    .eq("tx_hash", input.txHash)
    .eq("log_index", input.logIndex)
    .maybeSingle();

  if (existing?.status === "confirmed") {
    return { recorded: false, firstConfirmed: false };
  }

  const { error: updateError } = await supabase
    .from("ra_payment_verifications")
    .update({ ...row, status: "confirmed", verified_at: new Date().toISOString() })
    .eq("chain_id", input.chainId)
    .eq("tx_hash", input.txHash)
    .eq("log_index", input.logIndex);
  if (updateError && updateError.code !== "23505") throw updateError;
  return { recorded: true, firstConfirmed: true };
}