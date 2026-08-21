import { createMockPaymentProvider } from "@/lib/pay/mock-provider";
import type { PaymentProvider } from "@/lib/pay/provider";
import type { PublicCryptoConfig } from "@/lib/rent-advance/types";

/**
 * Single factory the Pay UI uses. Replace the body with a real adapter
 * after the Product Lead approves the Luis/Luuk integration task.
 * Flip `PAYMENT_RAIL_MODE` in `src/lib/pay/mode.ts` to `"live"` in the
 * same change so mocked Pay labels switch off.
 * Do not install a wallet or Safe SDK before that approval.
 * Read chain, USDC, and explorer from `config` — never hard-code one network.
 */
export function createPaymentProvider(
  config?: PublicCryptoConfig | null,
): PaymentProvider {
  return createMockPaymentProvider({ config });
}
