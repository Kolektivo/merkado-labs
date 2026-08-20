export const DEMO_RECEIVING_ADDRESS =
  "0x1726cf86DA996BC4B2F393E713f6F8ef83f2e4f6";
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

export function settlementTxIdFor(reference: string): string {
  return `tx-settle-${slugRef(reference)}`;
}

export function paymentTxIdFor(paymentRequestId: string): string {
  return `tx-pay-${paymentRequestId}`;
}

export function distributionTxIdFor(reference: string, n: number): string {
  return `tx-dist-${slugRef(reference)}-${n}`;
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
