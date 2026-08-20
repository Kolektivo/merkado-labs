/**
 * Single switch for mock vs live Pay copy and labels.
 * Flip this to `"live"` in the same change that points
 * `createPaymentProvider` at the real wallet adapter.
 */
export type PaymentRailMode = "mock" | "live";

export const PAYMENT_RAIL_MODE: PaymentRailMode = "mock";

export function isMockPaymentRail(mode: PaymentRailMode = PAYMENT_RAIL_MODE): boolean {
  return mode === "mock";
}

export function showDemoPaymentOutcomes(mode: PaymentRailMode = PAYMENT_RAIL_MODE): boolean {
  return isMockPaymentRail(mode);
}

export function renterWalletLedgerLabel(mode: PaymentRailMode = PAYMENT_RAIL_MODE): string {
  return isMockPaymentRail(mode) ? "Renter demo wallet" : "Renter wallet";
}

export function receivingLedgerLabel(mode: PaymentRailMode = PAYMENT_RAIL_MODE): string {
  return isMockPaymentRail(mode) ? "Demo receiving address" : "Receiving Safe";
}

export function overviewPrototypeBody(mode: PaymentRailMode = PAYMENT_RAIL_MODE): string {
  return isMockPaymentRail(mode)
    ? "Labs walkthrough. Not live on merkado.cw. No public offering. Wallet and USDC payments are mocked."
    : "Labs walkthrough. Not live on merkado.cw. No public offering. Pay sends USDC on the selected network.";
}

export function overviewPayCardBody(mode: PaymentRailMode = PAYMENT_RAIL_MODE): string {
  return isMockPaymentRail(mode)
    ? "The renter payment page. Same rent, same lease. Demo only — nothing real is sent."
    : "The renter payment page. Same rent, same lease. Pays in USDC on the selected network.";
}

export function paymentNetworkHelp(mode: PaymentRailMode = PAYMENT_RAIL_MODE): string {
  return isMockPaymentRail(mode)
    ? "Luis uses this when he connects a real wallet. Stay on Base Sepolia. Base Mainnet stays off until we turn it on for real USDC."
    : "Choose the network Pay uses. Stay on Base Sepolia until the Product Lead turns on Base Mainnet.";
}

export function paymentNetworkBody(
  networkLabel: string,
  mode: PaymentRailMode = PAYMENT_RAIL_MODE,
): string {
  return isMockPaymentRail(mode)
    ? `Pay will show ${networkLabel}. The demo wallet still does not send real money.`
    : `Pay will show ${networkLabel}. A connected wallet sends USDC on this network.`;
}

export function walletConnectError(mode: PaymentRailMode = PAYMENT_RAIL_MODE): string {
  return isMockPaymentRail(mode)
    ? "The demo wallet could not connect. Try again."
    : "The wallet could not connect. Check the network and try again.";
}
