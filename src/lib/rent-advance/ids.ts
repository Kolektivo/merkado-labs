/**
 * Stable demo ids and address helpers. Real on-chain addresses come from
 * the network/contract config, never from fabricated 0xDEMO constants.
 */

/** Verified Base Sepolia test EOA used as the seeded demo landlord payout. */
export const DEMO_LANDLORD_EOA = "0x351a767a5Bbfe0EE9ca3aA246c2b6732Dc4e43D8";

export const CANONICAL_PAYMENT_REQUEST_ID = "payreq-mra-001-202609";
export const RENTER_ACCOUNT_ID = "acc-renter-001";
export const SAFE_ACCOUNT_ID = "safe-demo-001";
export const COMPANY_SAFE_ACCOUNT_ID = "safe-demo-company";

/**
 * Normalize a configured address value. Returns the trimmed value when
 * present, otherwise the fallback. Never fabricates a value.
 */
export function configAddress(
  value: string | null | undefined,
  fallback: string | null = null,
): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function slugRef(reference: string): string {
  return reference.toLowerCase();
}

export function offerIdFromReference(reference: string): string {
  return `offer-${slugRef(reference)}`;
}

export function receivableIdFor(reference: string, n: number): string {
  return `rec-${slugRef(reference)}-${n}`;
}

export function collectionIdFor(reference: string, n: number): string {
  return `col-${reference}-${n}`;
}

export function positionIdFor(reference: string): string {
  return `pos-${slugRef(reference)}`;
}

export function distributionIdFor(reference: string, n: number): string {
  return `dist-${slugRef(reference)}-${n}`;
}

export function paymentTxIdFor(paymentRequestId: string): string {
  return `tx-pay-${paymentRequestId}`;
}

export function distributionTxIdFor(reference: string, n: number): string {
  return `tx-dist-${slugRef(reference)}-${n}`;
}

export function isExplorableTxHash(
  value: string | null | undefined,
): value is string {
  return Boolean(value && /^0x[a-fA-F0-9]{64}$/.test(value));
}

/** Accept a tx hash only when it is a real 64-hex value. No demo hashes. */
export function acceptedLiveTxHash(value: string | null | undefined): string | null {
  return isExplorableTxHash(value) ? value : null;
}

export function periodLabelFromDueDate(dueDate: string): string {
  const [year, month] = dueDate.slice(0, 10).split("-").map(Number);
  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${names[month - 1]} ${year}`;
}

export function truncateHash(value: string, lead = 6, tail = 4): string {
  if (value.length <= lead + tail + 1) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}