import { createMockPaymentProvider } from "@/lib/pay/mock-provider";
import type { PaymentProvider } from "@/lib/pay/provider";
import type { CryptoConfig } from "@/lib/rent-advance/types";

/**
 * Single factory the Pay UI uses. Replace the body with a real adapter
 * after the Product Lead approves the Luis/Luuk integration task.
 * Do not install a wallet or Safe SDK before that approval.
 * Read chain, USDC, and explorer from `config` — never hard-code one network.
 */
export function createPaymentProvider(config?: CryptoConfig | null): PaymentProvider {
  return createMockPaymentProvider({ config });
}
