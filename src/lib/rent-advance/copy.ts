import { PAYMENT_RAIL_MODE, type PaymentRailMode } from "@/lib/pay/mode";

export const SALE_NOT_LOAN =
  "The landlord sells the next few months of rent for cash now. This is not a loan. The yearly comparison is only so they can compare the fee with other ways of getting cash today.";

export const NO_OTHER_CHARGE =
  "No other charge of any kind: no arrangement fee, administration fee, onboarding fee, exit fee, or early-settlement charge.";

export const NON_RECOURSE =
  "If the renter fails to pay, pays late, or leaves early, the landlord keeps the cash already received and owes nothing back.";

export const EFFECTIVE_RATE_PLAIN =
  "The landlord gets the cash once, then gives up those later rent months. The yearly comparison looks higher than the flat fee because of that timing. It is not an interest rate.";

export const PLAIN = {
  listingScore:
    "Also called Listing Score. How strong this listing looks, from 0 to 100. We use this number to set the cash offer.",
  payerScore:
    "Also called Payer Score. How reliably this renter has paid rent, from 0 to 100. We use this number to set the cash offer.",
  propertyScore:
    "Also called Property Score. A simple 0–100 snapshot for holders: listing quality plus how the rent compares to typical rent nearby. This does not change the cash offer.",
  rentVsTypical:
    "This rent compared with what similar homes usually rent for. Below typical is usually stronger for this offer.",
  marketRent:
    "What similar homes nearby usually rent for. Used only to compare with this rent. It does not set the cash offer.",
  relatedParty:
    "Turn this on only when the landlord has a personal or business link to Merkado — for example family or a board seat. That is not a normal arm’s-length sale, so someone independent must approve it. The fee is a little higher because of that extra check, which means slightly less cash to the landlord. It is a fairness rule, not a discount.",
  totalRent:
    "All of the rent for the months being sold. Example: XCG 3,222 × 6 months = XCG 19,332.",
  fee: "The one cost for getting the rent paid now. No extra arrangement or exit charges.",
  sharePaidNow:
    "How much of that future rent is paid to the landlord now. The rest is the fee.",
  yearlyComparison:
    "A comparison figure so the landlord can compare this flat fee with other ways of getting cash today. It is not an interest rate, and it is not a promised return. Anything above 24% is blocked.",
  cashNow:
    "The one-time amount paid automatically to the landlord after this offer is bought. Later rent goes to this listing, then to holders — not back to the landlord. No wallet is needed to request an offer.",
  walletlessRequest:
    "You request this from your Merkado account. After review, Merkado creates one offer for this listing. You do not connect a wallet.",
  claimProceeds:
    "After the offer is bought, enter a fictional demo payout address beginning with 0xDEMO. You do not connect a wallet. Nothing real is sent.",
  landlordProceeds:
    "These are sale proceeds from the purchase. They are not monthly rent and not a loan.",
  mockFundingRecorded: "Mock funding recorded",
  mockClaimDisclosure:
    "No wallet ownership was verified and no on-chain transfer was sent.",
  payoutAddressUnverified:
    "Use a fictional address beginning with 0xDEMO. It is unverified and demo-only. You do not connect a wallet. This address is saved before submission for automatic payout.",
  payoutAddressLocked:
    "This payout address is locked. A retry can only go to this same address. It was never verified as yours.",
  payoutAddressFinal:
    "This payout address is locked and cannot be changed. It was never verified as yours.",
  feeAlreadyIncluded: "It will not be taken again.",
  claimRent:
    "When rent arrives, this listing’s offer holds it. Claim it here. It is not paid back to the landlord.",
  payoutAddress:
    "Enter a fictional payout address beginning with 0xDEMO before submitting. The sale amount is paid there automatically after the whole offer is bought. Bank payout through Girasol is a coming-soon preview.",
  payoutMethod:
    "For this walkthrough, sale proceeds go automatically to a fictional 0xDEMO address saved before submission. You never connect a wallet. Bank payout is later.",
  bankPayoutLater:
    "Bank payout through Girasol is planned after the pilot. It is not available in this walkthrough.",
  longestTerm:
    "The longest number of months this file can sell, based on listing quality and payment history together.",
  paymentHistory:
    "How reliably rent has been paid. Holders never see the renter’s name.",
  amountTaken:
    "The complete price for 100% ownership of this offer. Fractional purchases are not available.",
  holders:
    "People who put money in so the landlord can be paid now. They receive later rent only if the renter pays.",
  usdc:
    "Digital dollars for this demo payment. The amount matches the rent one-to-one. Nothing real is sent.",
  network: "The demo network for this payment. Nothing real is sent.",
} as const;

export const HOLDER_NO_PROMISE =
  "Collections depend entirely on rent received. If a month is missed, that month’s collection is zero. Rent stays on this listing’s offer until the holder claims it.";

export const SOLE_HOLDER_GATE =
  "Merkado Direct is unlaunched. The participation right stays in sole-holder mode while the characterisation opinion (M.1.2) and the public-holder licensing question (M.1.4) are outstanding. This surface is not public, is not indexed, and nothing here is an offer or an invitation to subscribe.";

export const PAYER_UNCHANGED = [
  "Rent amount",
  "Lease",
  "Landlord identity",
  "Security deposit",
  "Repairs",
  "Tenant rights",
  "Notice period",
] as const;

export const PAYER_UNCHANGED_BY_LOCALE = {
  en: PAYER_UNCHANGED,
  nl: [
    "Huurbedrag",
    "Huurcontract",
    "Identiteit van de verhuurder",
    "Borg",
    "Reparaties",
    "Huurdersrechten",
    "Opzegtermijn",
  ],
  pap: [
    "Montante di huur",
    "Kontrakt",
    "Identidat di dueño di kas",
    "Depósito",
    "Reparashon",
    "Derechonan di inquilino",
    "Periodo di notifikashon",
  ],
} as const;

export const BANNED_VOCABULARY = [
  "loan",
  "borrow",
  "lend",
  "interest_rate",
  "repayment",
  "principal",
  "debt",
  "apr",
  "yield",
  "return_rate",
  "income",
  "notes",
  "exchange",
  "shares",
  "equity",
  "vault",
  "custody",
  "reserve",
  "guaranteed",
  "savings",
  "deposit_account",
] as const;

export const payerCopy = {
  en: {
    greeting: "Hello",
    allSet: "Your rent is unchanged.",
    payThisMonth: "Pay this month’s rent",
    copyPaymentDetails: "Copy address and amount",
    unchanged:
      "Your rent, your lease, your landlord and where you pay are unchanged.",
    nextPayment: "Next payment",
    due: "Due",
    method: "Payment method",
    payNow: "Pay rent",
    noticeTitle: "Your rent payment is unchanged — your tenancy is not changing",
    weAreNotLandlord:
      "We are not your landlord. We cannot enter, inspect, change the rent, or end your tenancy.",
    optionA:
      "This is a demo payment link. Your rent amount and lease stay the same.",
    afterTerm:
      "After the last assigned month you keep paying as you do now.",
    landlordCountersign:
      "Your landlord will countersign this notice for the file.",
    whatDoesNotChange: "What does not change",
    recentPayments: "Payment history",
    noPaymentsYet: "No payments recorded yet.",
    optionATitle: "Demo-only payment",
    current: "Current",
    paid: "Paid",
    scheduled: "Upcoming",
    confirmPay: "Pay with demo wallet",
    to: "to",
    reference: "Reference",
    connectWallet: "Connect wallet",
    connecting: "Connecting…",
    connected: "Demo wallet connected",
    awaiting: "Awaiting confirmation",
    pending: "Payment submitted",
    successTitle: "Rent paid",
    successBody: "Thank you. Your rent and lease are unchanged.",
    failed: "Payment did not go through",
    retry: "Try again",
    alreadyPaid: "Already paid",
    overdue: "This payment is overdue",
    expired: "This payment link has expired",
    notFound: "We could not find that payment link.",
    partial: "The amount sent did not match the rent due.",
    copyAmount: "Copy amount",
    copyAddress: "Copy address",
    network: "Network",
    receiving: "Receiving address",
    demoOnly:
      "Settlement is mocked here. Do not send real USDC to this address.",
    memoNote:
      "The payment reference is for your records. A plain transfer does not automatically carry this reference on-chain.",
    historyLink: "Payment history",
    myPayments: "My Payments",
    dueStatus: "Due",
    networkUnset: "Network to be confirmed",
    sameAsRent: "Same as {amount} monthly rent",
    usdcTip:
      "Digital dollars. The amount matches your rent.",
    networkTip: "The selected payment network.",
    txRef: "Transaction",
    payEarlierFirst: "Pay {period} first.",
    payEarlierBody: "Earlier rent must be paid before this month.",
    openNextPayment: "Open the next payment",
    payBySendTitle: "Send the exact amount",
    payBySendBody:
      "Copy the address and send the exact USDC amount from your wallet.",
    iveSentPayment: "I’ve sent this payment",
    payByWalletTitle: "Or pay here",
    demoOutcomes: "Demo payment outcomes",
  },
  nl: {
    greeting: "Hallo",
    allSet: "Je huur blijft hetzelfde.",
    payThisMonth: "Betaal deze maand huur",
    copyPaymentDetails: "Kopieer adres en bedrag",
    unchanged:
      "Je huur, je contract, je verhuurder en waar je betaalt blijven hetzelfde.",
    nextPayment: "Volgende betaling",
    due: "Vervaldatum",
    method: "Betaalwijze",
    payNow: "Huur betalen",
    noticeTitle:
      "Je huurbetaling blijft hetzelfde — je huurcontract verandert niet",
    weAreNotLandlord:
      "Wij zijn niet je verhuurder. Wij mogen niet binnenkomen, inspecteren, de huur wijzigen of de huur beëindigen.",
    optionA:
      "Dit is een demo-betaallink. Je huurbedrag en contract blijven hetzelfde.",
    afterTerm:
      "Na de laatste toegewezen maand blijf je betalen zoals nu.",
    landlordCountersign:
      "Je verhuurder mede-ondertekent dit bericht voor het dossier.",
    whatDoesNotChange: "Wat niet verandert",
    recentPayments: "Betalingsgeschiedenis",
    noPaymentsYet: "Nog geen betalingen vastgelegd.",
    optionATitle: "Alleen demo",
    current: "Huidig",
    paid: "Betaald",
    scheduled: "Gepland",
    confirmPay: "Betalen met demowallet",
    to: "aan",
    reference: "Kenmerk",
    connectWallet: "Wallet verbinden",
    connecting: "Verbinden…",
    connected: "Demowallet verbonden",
    awaiting: "Wachten op bevestiging",
    pending: "Betaling verzonden",
    successTitle: "Huur betaald",
    successBody: "Dank je. Je huur en contract blijven hetzelfde.",
    failed: "Betaling is niet gelukt",
    retry: "Opnieuw proberen",
    alreadyPaid: "Al betaald",
    overdue: "Deze betaling is te laat",
    expired: "Deze betaallink is verlopen",
    notFound: "We kunnen deze betaallink niet vinden.",
    partial: "Het verstuurde bedrag komt niet overeen met de huur.",
    copyAmount: "Kopieer bedrag",
    copyAddress: "Kopieer adres",
    network: "Netwerk",
    receiving: "Ontvangstadres",
    demoOnly:
      "Afwikkeling is hier nagebootst. Stuur geen echte USDC naar dit adres.",
    memoNote:
      "Het kenmerk is voor je administratie. Een gewone overboeking zet dit niet automatisch on-chain.",
    historyLink: "Betalingsgeschiedenis",
    myPayments: "Mijn betalingen",
    dueStatus: "Te betalen",
    networkUnset: "Netwerk nog te bevestigen",
    sameAsRent: "Hetzelfde als {amount} maandelijkse huur",
    usdcTip:
      "Digitale dollars voor deze demo. Het bedrag is gelijk aan je huur. Er wordt niets echt verstuurd.",
    networkTip: "Het gekozen betaalnetwerk.",
    txRef: "Transactie",
    payEarlierFirst: "Betaal eerst {period}.",
    payEarlierBody: "Eerdere huur moet eerst betaald zijn.",
    openNextPayment: "Open de volgende betaling",
    payBySendTitle: "Stuur het exacte bedrag",
    payBySendBody:
      "Kopieer het adres en stuur het exacte USDC-bedrag vanuit je wallet.",
    iveSentPayment: "Ik heb deze betaling verstuurd",
    payByWalletTitle: "Of betaal hier",
    demoOutcomes: "Demo-betaaluitkomsten",
  },
  pap: {
    greeting: "Bon dia",
    allSet: "Bo huur no ta kambia.",
    payThisMonth: "Paga e huur di e luna aki",
    copyPaymentDetails: "Kopia adres i montante",
    unchanged:
      "Bo huur, bo kontrakt, bo dueño di kas i unda bo ta paga no ta kambia.",
    nextPayment: "Próksimo pago",
    due: "Fecha",
    method: "Método di pago",
    payNow: "Paga huur",
    noticeTitle:
      "Bo pago di huur no ta kambia — bo kontrakt no ta kambia",
    weAreNotLandlord:
      "Nos no ta bo dueño di kas. Nos no por drenta, inspeksioná, kambia e huur, ni terminá e kontrakt.",
    optionA:
      "Esaki ta un link di pago di demo. Bo montante di huur i kontrakt ta keda igual.",
    afterTerm:
      "Despues di e último luna asigná, bo ta sigui paga manera awor.",
    landlordCountersign:
      "Bo dueño di kas lo firma e karta aki tambe pa e dossier.",
    whatDoesNotChange: "Kiko no ta kambia",
    recentPayments: "Historia di pago",
    noPaymentsYet: "No tin pago registrá ainda.",
    optionATitle: "Demo so",
    current: "Aktual",
    paid: "Pagá",
    scheduled: "Programá",
    confirmPay: "Paga ku wallet di demo",
    to: "na",
    reference: "Referensia",
    connectWallet: "Konektá wallet",
    connecting: "Konektando…",
    connected: "Wallet di demo konektá",
    awaiting: "Sperando konfirmashon",
    pending: "Pago mandá",
    successTitle: "Huur pagá",
    successBody: "Danki. Bo huur i kontrakt no ta kambia.",
    failed: "E pago no a pasa",
    retry: "Purba di nobo",
    alreadyPaid: "Kaba pagá",
    overdue: "E pago aki ta lat",
    expired: "E link di pago a kaduká",
    notFound: "Nos no por a haña e link di pago.",
    partial: "E montante mandá no ta koresponde ku e huur.",
    copyAmount: "Kopia montante",
    copyAddress: "Kopia adres",
    network: "Red",
    receiving: "Adres di resepcion",
    demoOnly:
      "Afwikkeling ta nagebootst aki. No manda USDC real na e adres aki.",
    memoNote:
      "E referensia ta pa bo rekord. Un transferensia simpel no ta hiba e referensia automaticamente on-chain.",
    historyLink: "Historia di pago",
    myPayments: "Mi pagonan",
    dueStatus: "Pa paga",
    networkUnset: "Red ainda pa konfirmá",
    sameAsRent: "Mismo ku {amount} huur mensualmente",
    usdcTip:
      "Dollar digital pa e demo aki. E montante ta koresponde ku bo huur. Nada real ta wordu mandá.",
    networkTip: "E red di pago skohí.",
    txRef: "Transakshon",
    payEarlierFirst: "Paga {period} prome.",
    payEarlierBody: "Bo mester paga e huur anterior prome.",
    openNextPayment: "Habrie e próximo pago",
    payBySendTitle: "Manda e montante eksakto",
    payBySendBody:
      "Kopia e adres i manda e montante eksakto di USDC for di bo wallet.",
    iveSentPayment: "Mi a manda e pago aki",
    payByWalletTitle: "Òf paga akinan",
    demoOutcomes: "Resultadonan di pago di demo",
  },
} as const;

export type PayerLocale = keyof typeof payerCopy;
export type PayerCopy = {
  [K in keyof (typeof payerCopy)["en"]]: string;
};

type LivePayCopy = {
  confirmPay: string;
  connected: string;
  optionA: string;
  optionATitle: string;
  usdcTip: string;
  networkTip: string;
  demoOnly: string;
  demoOnlyTestnet: string;
  networkTipTestnet: string;
};

const LIVE_PAY_COPY: Record<PayerLocale, LivePayCopy> = {
  en: {
    confirmPay: "Pay with wallet",
    connected: "Wallet connected",
    optionATitle: "USDC rent payment",
    optionA: "Pay the exact USDC amount. Your rent amount and lease stay the same.",
    usdcTip: "Digital dollars. The amount matches your rent one-to-one.",
    networkTip: "Payments settle on the selected network.",
    networkTipTestnet: "Payments settle on {network}, a test network.",
    demoOnly:
      "This sends real USDC. Check the amount and network before you confirm.",
    demoOnlyTestnet:
      "This sends test USDC on {network}. It is not mainnet money. Double-check the network in your wallet.",
  },
  nl: {
    confirmPay: "Betalen met wallet",
    connected: "Wallet verbonden",
    optionATitle: "USDC-huurbetaling",
    optionA: "Betaal het exacte USDC-bedrag. Je huurbedrag en contract blijven hetzelfde.",
    usdcTip: "Digitale dollars. Het bedrag is gelijk aan je huur.",
    networkTip: "Betalingen worden afgehandeld op het gekozen netwerk.",
    networkTipTestnet: "Betalingen worden afgehandeld op {network}, een testnetwerk.",
    demoOnly:
      "Dit stuurt echte USDC. Controleer bedrag en netwerk voordat je bevestigt.",
    demoOnlyTestnet:
      "Dit stuurt test-USDC op {network}. Dit is geen mainnet-geld. Controleer het netwerk in je wallet.",
  },
  pap: {
    confirmPay: "Paga ku wallet",
    connected: "Wallet konektá",
    optionATitle: "Pago di huur den USDC",
    optionA: "Paga e montante eksakto di USDC. Bo montante di huur i kontrakt ta keda igual.",
    usdcTip: "Dollar digital. E montante ta koresponde ku bo huur.",
    networkTip: "Pagonan ta keda na e red skohí.",
    networkTipTestnet: "Pagonan ta keda na {network}, un red di prueba.",
    demoOnly: "Esaki ta manda USDC real. Kontrolá montante i red prome ku bo konfirmá.",
    demoOnlyTestnet:
      "Esaki ta manda USDC di prueba na {network}. Esaki no ta sèn di mainnet. Kontrolá e red den bo wallet.",
  },
};

/**
 * When Luis flips `PAYMENT_RAIL_MODE` to `"live"`, Pay labels stop saying
 * the wallet is a demo. Pass the selected network so testnet copy stays honest.
 */
export function applyPaymentRailCopy(
  copy: PayerCopy,
  options: {
    locale?: PayerLocale;
    mode?: PaymentRailMode;
    isTestnet?: boolean;
    networkLabel?: string | null;
  } = {},
): PayerCopy {
  const mode = options.mode ?? PAYMENT_RAIL_MODE;
  if (mode === "mock") return copy;

  const locale = options.locale ?? "en";
  const live = LIVE_PAY_COPY[locale];
  const network = options.networkLabel?.trim() || "the selected network";
  const testnet = options.isTestnet ?? true;

  return {
    ...copy,
    confirmPay: live.confirmPay,
    connected: live.connected,
    optionATitle: live.optionATitle,
    optionA: live.optionA,
    usdcTip: live.usdcTip,
    networkTip: testnet
      ? live.networkTipTestnet.replace("{network}", network)
      : live.networkTip,
    demoOnly: testnet
      ? live.demoOnlyTestnet.replace("{network}", network)
      : live.demoOnly,
  };
}
