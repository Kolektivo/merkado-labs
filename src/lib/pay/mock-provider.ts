import { DEMO_PAYER_WALLET } from "@/lib/rent-advance/ids";
import type {
  PaymentMethod,
  PaymentProvider,
  PaymentSubmitInput,
  SubmittedPayment,
  WalletSession,
} from "@/lib/pay/provider";
import type { CryptoConfig } from "@/lib/rent-advance/types";

type MockOptions = {
  failNext?: boolean;
  partialNext?: boolean;
  config?: CryptoConfig | null;
};

let session: WalletSession | null = null;
let failNext = false;
let partialNext = false;
let activeConfig: CryptoConfig | null = null;

function demoHash(paymentRequestId: string) {
  return `0xDEMO${paymentRequestId.replace(/[^a-zA-Z0-9]/g, "").padEnd(34, "0").slice(0, 34)}`;
}

function mockOutcome(
  input: PaymentSubmitInput,
  from: string,
  method: PaymentMethod,
): SubmittedPayment {
  const prefix = method === "external" ? "tx-ext" : "tx-pay";
  if (failNext) {
    failNext = false;
    return {
      transactionId: `${prefix}-${input.paymentRequestId}`,
      txHash: null,
      chainId: activeConfig?.chainId ?? null,
      from,
      to: input.recipient,
      tokenContract: activeConfig?.usdcContract ?? null,
      atomicAmount: input.expectedAtomicAmount,
      status: "failed",
      errorCode: "mock_failed",
      errorMessage: "The demo payment did not go through. You can try again.",
    };
  }
  if (partialNext) {
    partialNext = false;
    return {
      transactionId: `${prefix}-${input.paymentRequestId}`,
      txHash: demoHash(input.paymentRequestId),
      chainId: activeConfig?.chainId ?? null,
      from,
      to: input.recipient,
      tokenContract: activeConfig?.usdcContract ?? null,
      atomicAmount: Math.max(1, Math.round(input.expectedAtomicAmount * 0.5)),
      status: "failed",
      errorCode: "amount_mismatch",
      errorMessage: "The amount sent did not match the rent due.",
    };
  }
  return {
    transactionId: `${prefix}-${input.paymentRequestId}`,
    txHash: demoHash(
      method === "external" ? `ext-${input.paymentRequestId}` : input.paymentRequestId,
    ),
    chainId: activeConfig?.chainId ?? null,
    from,
    to: input.recipient,
    tokenContract: activeConfig?.usdcContract ?? null,
    atomicAmount: input.expectedAtomicAmount,
    status: "submitted",
  };
}

export function createMockPaymentProvider(options: MockOptions = {}): PaymentProvider {
  failNext = Boolean(options.failNext);
  partialNext = Boolean(options.partialNext);
  activeConfig = options.config ?? null;

  return {
    async connect() {
      session = {
        address: DEMO_PAYER_WALLET,
        connected: true,
        chainId: activeConfig?.chainId ?? null,
      };
      return session;
    },
    async disconnect() {
      session = null;
    },
    session() {
      return session;
    },
    async submitPayment(input: PaymentSubmitInput): Promise<SubmittedPayment> {
      if (!session) {
        return {
          transactionId: `tx-pay-${input.paymentRequestId}`,
          txHash: null,
          chainId: activeConfig?.chainId ?? null,
          from: "",
          to: input.recipient,
          tokenContract: activeConfig?.usdcContract ?? null,
          atomicAmount: input.expectedAtomicAmount,
          status: "failed",
          errorCode: "wallet_disconnected",
          errorMessage: "Connect the demo wallet first.",
        };
      }
      return mockOutcome(input, session.address, "wallet");
    },
    async reportExternalTransfer(input: PaymentSubmitInput): Promise<SubmittedPayment> {
      return mockOutcome(input, "", "external");
    },
    async getStatus(transactionId: string) {
      if (!session) return null;
      return {
        transactionId,
        txHash: null,
        chainId: activeConfig?.chainId ?? null,
        from: session.address,
        to: "",
        tokenContract: activeConfig?.usdcContract ?? null,
        atomicAmount: 0,
        status: "pending",
      };
    },
  };
}

export function armMockPaymentFailure() {
  failNext = true;
}

export function armMockPaymentPartial() {
  partialNext = true;
}
