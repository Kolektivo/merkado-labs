import "server-only";

import { createLabsAdminClient } from "@/lib/supabase/admin";

export type ChainEpochRow = {
  id: string;
  label: string;
  active: boolean;
  created_at: string;
};

export type ChainOfferRow = {
  offer_key: string;
  chain_id: number;
  contract_address: string;
  token_id: string;
  payout_address: string;
  purchase_price: string;
  rent_installment_amount: string;
  mint_tx_hash: string | null;
  mint_block_number: number | null;
  purchased: boolean;
  purchase_tx_hash: string | null;
  purchase_block_number: number | null;
  purchaser_address: string | null;
  purchased_at: string | null;
  epoch_id: string;
  created_at: string;
};

export type ChainEventRow = {
  id: string;
  epoch_id: string;
  chain_id: number;
  contract_address: string;
  tx_hash: string;
  log_index: number;
  block_number: number;
  block_hash: string;
  event_name: string;
  event_args: Record<string, unknown>;
  created_at: string;
};

export type PaymentAttemptRow = {
  attempt_id: string;
  epoch_id: string;
  chain_id: number;
  contract_address: string;
  token_id: string;
  payment_request_id: string;
  opaque_payment_id: string;
  expected_amount: string;
  status: "pending" | "confirmed" | "failed" | "replaced";
  created_at: string;
};

export type DepositVerificationRow = {
  id: string;
  chain_id: number;
  tx_hash: string;
  log_index: number;
  block_number: number;
  token_id: string;
  opaque_payment_id: string;
  amount: string;
  payer_address: string;
  payment_request_id: string;
  epoch_id: string;
  status: string;
  confirmed_at: string;
};

export type ClaimVerificationRow = {
  id: string;
  chain_id: number;
  tx_hash: string;
  log_index: number;
  block_number: number;
  contract_address: string;
  token_id: string;
  owner_address: string;
  amount: string;
  epoch_id: string;
  confirmed_at: string;
};

export type ChainOfferInsert = {
  offerKey: string;
  chainId: number;
  contractAddress: string;
  tokenId: bigint | number | string;
  payoutAddress: string;
  purchasePrice: bigint | number | string;
  rentInstallmentAmount: bigint | number | string;
  mintTxHash?: string | null;
  mintBlockNumber?: number | null;
  epochId: string;
};

export type OfferPurchasedInput = {
  chainId: number;
  contractAddress: string;
  tokenId: bigint | number | string;
  purchaseTxHash: string;
  purchaseBlockNumber: number;
  purchaserAddress: string;
};

export type ChainEventInsert = {
  epochId: string;
  chainId: number;
  contractAddress: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockHash: string;
  eventName: string;
  eventArgs: Record<string, unknown>;
};

export type PaymentAttemptInput = {
  epochId: string;
  chainId: number;
  contractAddress: string;
  tokenId: bigint | number | string;
  paymentRequestId: string;
  opaquePaymentId: string;
  expectedAmount: bigint | number | string;
  status: "pending" | "confirmed" | "failed" | "replaced";
};

export type DepositVerificationInput = {
  chainId: number;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  tokenId: bigint | number | string;
  opaquePaymentId: string;
  amount: bigint | number | string;
  payerAddress: string;
  paymentRequestId: string;
  epochId: string;
};

export type ClaimVerificationInput = {
  chainId: number;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  contractAddress: string;
  tokenId: bigint | number | string;
  ownerAddress: string;
  amount: bigint | number | string;
  epochId: string;
};

export type WriteResult<T> = { recorded: boolean; row: T };

function toDecimalString(value: bigint | number | string): string {
  return typeof value === "bigint" ? value.toString() : String(value);
}

function toTokenId(value: bigint | number | string): string {
  return toDecimalString(value);
}

function normalizeOfferRow(row: Record<string, unknown>): ChainOfferRow {
  return {
    ...(row as unknown as ChainOfferRow),
    token_id: toTokenId(row.token_id as bigint | number | string),
    purchase_price: toDecimalString(row.purchase_price as bigint | number | string),
    rent_installment_amount: toDecimalString(
      row.rent_installment_amount as bigint | number | string,
    ),
  };
}

function normalizeDepositRow(row: Record<string, unknown>): DepositVerificationRow {
  return {
    ...(row as unknown as DepositVerificationRow),
    token_id: toTokenId(row.token_id as bigint | number | string),
    amount: toDecimalString(row.amount as bigint | number | string),
  };
}

function normalizeClaimRow(row: Record<string, unknown>): ClaimVerificationRow {
  return {
    ...(row as unknown as ClaimVerificationRow),
    token_id: toTokenId(row.token_id as bigint | number | string),
    amount: toDecimalString(row.amount as bigint | number | string),
  };
}

export async function ensureActiveEpoch(): Promise<ChainEpochRow> {
  const supabase = createLabsAdminClient();
  const { data, error } = await supabase
    .from("ra_chain_epochs")
    .select("id,label,active,created_at")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;
  return newEpoch("default");
}

export async function newEpoch(label: string): Promise<ChainEpochRow> {
  const supabase = createLabsAdminClient();
  // Deactivate every prior active epoch first, then insert the new row, so
  // exactly one active epoch exists after the write. Ordering matters: a
  // stale active epoch must never be picked up as the current one.
  const { error: deactivateError } = await supabase
    .from("ra_chain_epochs")
    .update({ active: false })
    .eq("active", true);
  if (deactivateError) throw deactivateError;
  const { data, error } = await supabase
    .from("ra_chain_epochs")
    .insert({ label })
    .select("id,label,active,created_at")
    .single();
  if (error) throw error;
  return data;
}

async function fetchOffer(
  chainId: number,
  contractAddress: string,
  tokenId: bigint | number | string,
): Promise<ChainOfferRow | null> {
  const supabase = createLabsAdminClient();
  const { data, error } = await supabase
    .from("ra_chain_offers")
    .select()
    .eq("chain_id", chainId)
    .eq("contract_address", contractAddress)
    .eq("token_id", toTokenId(tokenId))
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeOfferRow(data) : null;
}

export async function recordOffer(row: ChainOfferInsert): Promise<ChainOfferRow> {
  const supabase = createLabsAdminClient();
  const dbRow = {
    offer_key: row.offerKey,
    chain_id: row.chainId,
    contract_address: row.contractAddress,
    token_id: toTokenId(row.tokenId),
    payout_address: row.payoutAddress,
    purchase_price: toDecimalString(row.purchasePrice),
    rent_installment_amount: toDecimalString(row.rentInstallmentAmount),
    mint_tx_hash: row.mintTxHash ?? null,
    mint_block_number: row.mintBlockNumber ?? null,
    epoch_id: row.epochId,
  };
  const { data, error } = await supabase
    .from("ra_chain_offers")
    .upsert(dbRow, {
      onConflict: "chain_id,contract_address,token_id",
      ignoreDuplicates: true,
    })
    .select();
  if (error) throw error;
  if (data && data.length > 0) return normalizeOfferRow(data[0]);
  const existing = await fetchOffer(row.chainId, row.contractAddress, row.tokenId);
  if (!existing) throw new Error("recordOffer: chain offer still missing after upsert");
  return existing;
}

export async function markOfferPurchased(input: OfferPurchasedInput): Promise<ChainOfferRow> {
  const existing = await fetchOffer(input.chainId, input.contractAddress, input.tokenId);
  if (!existing) throw new Error("markOfferPurchased: chain offer not found");
  if (existing.purchased) return existing;
  const supabase = createLabsAdminClient();
  const updated = {
    ...existing,
    purchased: true,
    purchase_tx_hash: input.purchaseTxHash,
    purchase_block_number: input.purchaseBlockNumber,
    purchaser_address: input.purchaserAddress,
    purchased_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("ra_chain_offers")
    .upsert(updated, {
      onConflict: "chain_id,contract_address,token_id",
    })
    .select();
  if (error) throw error;
  if (data && data.length > 0) return normalizeOfferRow(data[0]);
  const refreshed = await fetchOffer(input.chainId, input.contractAddress, input.tokenId);
  if (!refreshed) throw new Error("markOfferPurchased: chain offer missing after upsert");
  return refreshed;
}

export async function recordChainEvent(row: ChainEventInsert): Promise<WriteResult<ChainEventRow>> {
  const supabase = createLabsAdminClient();
  const dbRow = {
    epoch_id: row.epochId,
    chain_id: row.chainId,
    contract_address: row.contractAddress,
    tx_hash: row.txHash,
    log_index: row.logIndex,
    block_number: row.blockNumber,
    block_hash: row.blockHash,
    event_name: row.eventName,
    event_args: row.eventArgs,
  };
  const { data, error } = await supabase
    .from("ra_chain_events")
    .upsert(dbRow, {
      onConflict: "chain_id,tx_hash,log_index",
      ignoreDuplicates: true,
    })
    .select();
  if (error) throw error;
  if (data && data.length > 0) return { recorded: true, row: data[0] as ChainEventRow };
  const existing = await fetchChainEvent(row.chainId, row.txHash, row.logIndex);
  if (!existing) throw new Error("recordChainEvent: chain event missing after upsert");
  return { recorded: false, row: existing };
}

async function fetchChainEvent(
  chainId: number,
  txHash: string,
  logIndex: number,
): Promise<ChainEventRow | null> {
  const supabase = createLabsAdminClient();
  const { data, error } = await supabase
    .from("ra_chain_events")
    .select()
    .eq("chain_id", chainId)
    .eq("tx_hash", txHash)
    .eq("log_index", logIndex)
    .maybeSingle();
  if (error) throw error;
  return data ? (data as ChainEventRow) : null;
}

export async function createPaymentAttempt(
  input: PaymentAttemptInput,
): Promise<WriteResult<PaymentAttemptRow>> {
  const supabase = createLabsAdminClient();
  const dbRow = {
    epoch_id: input.epochId,
    chain_id: input.chainId,
    contract_address: input.contractAddress,
    token_id: toTokenId(input.tokenId),
    payment_request_id: input.paymentRequestId,
    opaque_payment_id: input.opaquePaymentId,
    expected_amount: toDecimalString(input.expectedAmount),
    status: input.status,
  };
  const { data, error } = await supabase
    .from("ra_rent_payment_attempts")
    .insert(dbRow)
    .select();
  if (!error && data && data.length > 0) {
    return { recorded: true, row: data[0] as PaymentAttemptRow };
  }
  if (error && error.code !== "23505") throw error;
  const existing = await fetchPaymentAttempt(input.opaquePaymentId);
  if (!existing) throw new Error("createPaymentAttempt: attempt missing after insert");
  return { recorded: false, row: existing };
}

async function fetchPaymentAttempt(opaquePaymentId: string): Promise<PaymentAttemptRow | null> {
  const supabase = createLabsAdminClient();
  const { data, error } = await supabase
    .from("ra_rent_payment_attempts")
    .select()
    .eq("opaque_payment_id", opaquePaymentId)
    .maybeSingle();
  if (error) throw error;
  return data ? (data as PaymentAttemptRow) : null;
}

async function fetchDepositByLog(
  chainId: number,
  txHash: string,
  logIndex: number,
): Promise<DepositVerificationRow | null> {
  const supabase = createLabsAdminClient();
  const { data, error } = await supabase
    .from("ra_rent_deposit_verifications")
    .select()
    .eq("chain_id", chainId)
    .eq("tx_hash", txHash)
    .eq("log_index", logIndex)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeDepositRow(data) : null;
}

async function fetchDepositByOpaqueId(
  opaquePaymentId: string,
): Promise<DepositVerificationRow | null> {
  const supabase = createLabsAdminClient();
  const { data, error } = await supabase
    .from("ra_rent_deposit_verifications")
    .select()
    .eq("opaque_payment_id", opaquePaymentId)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeDepositRow(data) : null;
}

async function fetchConfirmedDepositByPaymentRequest(
  paymentRequestId: string,
): Promise<DepositVerificationRow | null> {
  const supabase = createLabsAdminClient();
  const { data, error } = await supabase
    .from("ra_rent_deposit_verifications")
    .select()
    .eq("payment_request_id", paymentRequestId)
    .eq("status", "confirmed")
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeDepositRow(data) : null;
}

export async function recordDepositVerification(
  input: DepositVerificationInput,
): Promise<WriteResult<DepositVerificationRow>> {
  const supabase = createLabsAdminClient();
  const dbRow = {
    chain_id: input.chainId,
    tx_hash: input.txHash,
    log_index: input.logIndex,
    block_number: input.blockNumber,
    token_id: toTokenId(input.tokenId),
    opaque_payment_id: input.opaquePaymentId,
    amount: toDecimalString(input.amount),
    payer_address: input.payerAddress,
    payment_request_id: input.paymentRequestId,
    epoch_id: input.epochId,
    status: "confirmed",
  };
  const { data, error } = await supabase.from("ra_rent_deposit_verifications").insert(dbRow).select();
  if (!error && data && data.length > 0) {
    return { recorded: true, row: normalizeDepositRow(data[0]) };
  }
  if (error && error.code !== "23505") throw error;
  const existing =
    (await fetchDepositByLog(input.chainId, input.txHash, input.logIndex)) ??
    (await fetchDepositByOpaqueId(input.opaquePaymentId)) ??
    (await fetchConfirmedDepositByPaymentRequest(input.paymentRequestId));
  if (!existing) throw new Error("recordDepositVerification: verification missing after conflict");
  return { recorded: false, row: existing };
}

async function fetchClaimByLog(
  chainId: number,
  txHash: string,
  logIndex: number,
): Promise<ClaimVerificationRow | null> {
  const supabase = createLabsAdminClient();
  const { data, error } = await supabase
    .from("ra_rent_claim_verifications")
    .select()
    .eq("chain_id", chainId)
    .eq("tx_hash", txHash)
    .eq("log_index", logIndex)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeClaimRow(data) : null;
}

export async function recordClaimVerification(
  input: ClaimVerificationInput,
): Promise<WriteResult<ClaimVerificationRow>> {
  const supabase = createLabsAdminClient();
  const dbRow = {
    chain_id: input.chainId,
    tx_hash: input.txHash,
    log_index: input.logIndex,
    block_number: input.blockNumber,
    contract_address: input.contractAddress,
    token_id: toTokenId(input.tokenId),
    owner_address: input.ownerAddress,
    amount: toDecimalString(input.amount),
    epoch_id: input.epochId,
  };
  const { data, error } = await supabase.from("ra_rent_claim_verifications").insert(dbRow).select();
  if (!error && data && data.length > 0) {
    return { recorded: true, row: normalizeClaimRow(data[0]) };
  }
  if (error && error.code !== "23505") throw error;
  const existing = await fetchClaimByLog(input.chainId, input.txHash, input.logIndex);
  if (!existing) throw new Error("recordClaimVerification: verification missing after conflict");
  return { recorded: false, row: existing };
}