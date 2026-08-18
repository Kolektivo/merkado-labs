import { DEMO_PAYER_WALLET } from "@/lib/rent-advance/ids";
import type {
  PaymentProvider,
  PaymentSubmitInput,
  SubmittedPayment,
  WalletSession,
} from "@/lib/pay/provider";

type MockOptions = {
  failNext?: boolean;
  partialNext?: boolean;
};

let session: WalletSession | null = null;
let failNext = false;
let partialNext = false;

export function createMockPaymentProvider(options: MockOptions = {}): PaymentProvider {
  failNext = Boolean(options.failNext);
  partialNext = Boolean(options.partialNext);

  return {
    async connect() {
      session = {
        address: DEMO_PAYER_WALLET,
        connected: true,
        chainId: null,
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
          chainId: null,
          from: "",
          to: input.recipient,
          tokenContract: null,
          atomicAmount: input.expectedAtomicAmount,
          status: "failed",
          errorCode: "wallet_disconnected",
          errorMessage: "Connect the demo wallet first.",
        };
      }
      if (failNext) {
        failNext = false;
        return {
          transactionId: `tx-pay-${input.paymentRequestId}`,
          txHash: null,
          chainId: null,
          from: session.address,
          to: input.recipient,
          tokenContract: null,
          atomicAmount: input.expectedAtomicAmount,
          status: "failed",
          errorCode: "mock_failed",
          errorMessage: "The demo payment did not go through. You can try again.",
        };
      }
      if (partialNext) {
        partialNext = false;
        return {
          transactionId: `tx-pay-${input.paymentRequestId}`,
          txHash: `0xDEMO${input.paymentRequestId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 34)}`,
          chainId: null,
          from: session.address,
          to: input.recipient,
          tokenContract: null,
          atomicAmount: Math.max(1, Math.round(input.expectedAtomicAmount * 0.5)),
          status: "failed",
          errorCode: "amount_mismatch",
          errorMessage: "The amount sent did not match the rent due.",
        };
      }
      return {
        transactionId: `tx-pay-${input.paymentRequestId}`,
        txHash: `0xDEMO${input.paymentRequestId.replace(/[^a-zA-Z0-9]/g, "").padEnd(34, "0").slice(0, 34)}`,
        chainId: null,
        from: session.address,
        to: input.recipient,
        tokenContract: null,
        atomicAmount: input.expectedAtomicAmount,
        status: "submitted",
      };
    },
    async getStatus(transactionId: string) {
      if (!session) return null;
      return {
        transactionId,
        txHash: null,
        chainId: null,
        from: session.address,
        to: "",
        tokenContract: null,
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
