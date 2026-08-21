export const BASE_SEPOLIA_DEPOSIT_SAFE_ADDRESS =
  "0xfC6ec9718d89d4935594E7DB78399913071FcDc4";
export const DEMO_RECEIVING_ADDRESS = BASE_SEPOLIA_DEPOSIT_SAFE_ADDRESS;
export const DEMO_PAYER_WALLET = "0xDEMO0000RENTER00MERKADOPAY000000000001";
export const CANONICAL_PAYMENT_REQUEST_ID = "payreq-mra-001-202609";
export const RENTER_ACCOUNT_ID = "acc-renter-001";
export const SAFE_ACCOUNT_ID = "safe-demo-001";

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

export function fundingRecordIdFor(reference: string): string {
  return `fund-${slugRef(reference)}`;
}

export function landlordClaimIdFor(reference: string): string {
  return `claim-landlord-${slugRef(reference)}`;
}

export function landlordPayoutTxIdFor(reference: string): string {
  return `tx-claim-${slugRef(reference)}`;
}

/** Fictional demo EOAs only. Never a real personal wallet in this shared demo. */
export const DEMO_LANDLORD_EOA = "0x" + "A1B2C3D4E5F60718293A4B5C6D7E8F90A1B2C3D4".toLowerCase();
export const DEMO_HOLDER_EOA = "0x" + "B2C3D4E5F60718293A4B5C6D7E8F90A1B2C3D4E5".toLowerCase();

/** Accepts only a 20-byte EVM address (no zero, no self/Safe address check here). */
export function isValidEoaAddress(value: string | null | undefined): boolean {
  return Boolean(value && /^0x[a-fA-F0-9]{40}$/.test(value));
}

export function demoTxHash(seed: string): string {
  const padded = seed.replace(/[^a-zA-Z0-9]/g, "").padEnd(40, "0").slice(0, 40);
  return `0xDEMO${padded}`;
}

export function isExplorableTxHash(value: string | null | undefined): boolean {
  return Boolean(value && /^0x[a-fA-F0-9]{64}$/.test(value));
}

export function acceptedPaymentTxHash(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("0xDEMO")) return value;
  if (isExplorableTxHash(value)) return value;
  return null;
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
