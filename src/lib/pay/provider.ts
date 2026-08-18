export type WalletSession = {
  address: string;
  connected: boolean;
  chainId: number | null;
};

export type PaymentSubmitInput = {
  paymentRequestId: string;
  expectedAtomicAmount: number;
  recipient: string;
  offerReference: string;
  receivableId: string;
};

export type SubmittedPayment = {
  transactionId: string;
  txHash: string | null;
  chainId: number | null;
  from: string;
  to: string;
  tokenContract: string | null;
  atomicAmount: number;
  status: "submitted" | "pending" | "confirmed" | "failed" | "replaced";
  errorCode?: string;
  errorMessage?: string;
};

export type PaymentProvider = {
  connect(): Promise<WalletSession>;
  disconnect(): Promise<void>;
  session(): WalletSession | null;
  submitPayment(input: PaymentSubmitInput): Promise<SubmittedPayment>;
  getStatus(transactionId: string): Promise<SubmittedPayment | null>;
};
