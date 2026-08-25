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
    "The one-time amount the buyer pays to your payout address once this offer NFT is purchased. Later rent goes to the offer contract, then to the NFT owner — not back to the landlord. You do not connect a wallet to request an offer.",
  walletlessRequest:
    "You request this from your Merkado account. After review, Merkado mints the offer NFT automatically after approval. You do not connect a wallet.",
  claimProceeds:
    "After the offer NFT is purchased, the sale amount is paid to the payout address locked at mint. It is not sent again.",
  landlordProceeds:
    "These are sale proceeds from the purchase. They are not monthly rent and not a loan.",
  payoutAddress:
    "Enter the Base Sepolia address the buyer pays once this offer NFT is purchased. It is locked at mint by the backend. Bank payout through Girasol is a coming-soon preview.",
  payoutAddressUnverified:
    "Use a real Base Sepolia 0x address. It is locked at mint and not verified as yours by this demo. It is never shown on payer or purchaser screens.",
  payoutAddressLocked:
    "This payout address is locked at mint. It cannot be changed after the offer NFT is minted.",
  feeAlreadyIncluded: "It will not be taken again.",
  claimRent:
    "When rent arrives, the offer contract holds it. The current NFT owner claims it from Portfolio. It is not paid back to the landlord.",
  payoutMethod:
    "For this walkthrough, the buyer pays the sale amount to the Base Sepolia payout address locked at mint. Bank payout is later.",
  bankPayoutLater:
    "Bank payout through Girasol is planned after the pilot. It is not available in this walkthrough.",
  longestTerm:
    "The longest number of months this file can sell, based on listing quality and payment history together.",
  paymentHistory:
    "How reliably rent has been paid. Holders never see the renter’s name.",
  amountTaken:
    "The complete price for the whole offer NFT. Fractional purchases are not available.",
  holders:
    "The current owner of the offer NFT. They receive later rent only if the renter pays.",
  usdc:
    "Digital dollars. The amount matches the rent one-to-one and settles on Base Sepolia.",
  network: "The network the USDC payment settles on.",
} as const;

export const HOLDER_NO_PROMISE =
  "Collections depend entirely on rent received. If a month is missed, that month’s collection is zero. Rent stays pooled in the offer contract until the current NFT owner claims it.";

export const SOLE_HOLDER_GATE =
  "Merkado Direct is unlaunched. The participation right stays in sole-holder mode while the characterisation opinion (M.1.2) and the public-holder licensing question (M.1.4) are outstanding. This surface is not public, is not indexed, and nothing here is an offer or an invitation to subscribe.";

export const NOT_CONFIGURED = {
  title: "The live contract is not configured yet",
  body: "NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS is not set. Once the Merkado Rent Offer contract is deployed on Base Sepolia and configured, this screen becomes active. Nothing was sent and nothing was recorded.",
  action: "Not configured",
} as const;

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

type PayCopyEntry = {
  greeting: string;
  allSet: string;
  payThisMonth: string;
  unchanged: string;
  nextPayment: string;
  due: string;
  method: string;
  payNow: string;
  noticeTitle: string;
  weAreNotLandlord: string;
  optionA: string;
  afterTerm: string;
  landlordCountersign: string;
  whatDoesNotChange: string;
  recentPayments: string;
  noPaymentsYet: string;
  optionATitle: string;
  current: string;
  paid: string;
  scheduled: string;
  confirmPay: string;
  to: string;
  reference: string;
  connectWallet: string;
  connecting: string;
  connected: string;
  awaiting: string;
  pending: string;
  successTitle: string;
  successBody: string;
  failed: string;
  reverted: string;
  retry: string;
  alreadyPaid: string;
  overdue: string;
  expired: string;
  notFound: string;
  partial: string;
  network: string;
  receiving: string;
  memoNote: string;
  historyLink: string;
  myPayments: string;
  dueStatus: string;
  networkUnset: string;
  sameAsRent: string;
  usdcTip: string;
  networkTip: string;
  txRef: string;
  payEarlierFirst: string;
  payEarlierBody: string;
  openNextPayment: string;
  approveUsdc: string;
  payByWalletTitle: string;
  payByWalletBody: string;
  payByStablecoinTitle: string;
  bankPaymentComingSoon: string;
  approved: string;
  notMinted: string;
  notConfiguredTitle: string;
  notConfiguredBody: string;
};

const EN: PayCopyEntry = {
  greeting: "Hello",
  allSet: "Your rent is unchanged.",
  payThisMonth: "Pay this month’s rent",
  unchanged: "Your rent, your lease, your landlord and where you pay are unchanged.",
  nextPayment: "Next payment",
  due: "Due",
  method: "Payment method",
  payNow: "Pay rent",
  noticeTitle: "Your rent payment is unchanged — your tenancy is not changing",
  weAreNotLandlord:
    "We are not your landlord. We cannot enter, inspect, change the rent, or end your tenancy.",
  optionA: "Pay the exact USDC amount. Your rent amount and lease stay the same.",
  afterTerm: "After the last assigned month you keep paying as you do now.",
  landlordCountersign: "Your landlord will countersign this notice for the file.",
  whatDoesNotChange: "What does not change",
  recentPayments: "Payment history",
  noPaymentsYet: "No payments recorded yet.",
  optionATitle: "USDC rent payment",
  current: "Current",
  paid: "Paid",
  scheduled: "Upcoming",
  confirmPay: "Pay rent",
  to: "to",
  reference: "Reference",
  connectWallet: "Connect wallet",
  connecting: "Connecting…",
  connected: "Wallet connected",
  awaiting: "Awaiting confirmation",
  pending: "Payment submitted",
  successTitle: "Rent paid",
  successBody: "Thank you. Your rent and lease are unchanged.",
  failed: "Payment did not go through",
  reverted: "The transaction reverted on chain",
  retry: "Try again",
  alreadyPaid: "Already paid",
  overdue: "This payment is overdue",
  expired: "This payment link has expired",
  notFound: "We could not find that payment link.",
  partial: "The amount sent did not match the rent due.",
  network: "Network",
  receiving: "Pays to the offer contract",
  memoNote:
    "The payment reference is for your records. The on-chain payment id is opaque and never contains it.",
  historyLink: "Payment history",
  myPayments: "My Payments",
  dueStatus: "Due",
  networkUnset: "Network to be confirmed",
  sameAsRent: "Same as {amount} monthly rent",
  usdcTip: "Digital dollars. The amount matches your rent one-to-one.",
  networkTip: "Payments settle on the selected network.",
  txRef: "Transaction",
  payEarlierFirst: "Pay {period} first.",
  payEarlierBody: "Earlier rent must be paid before this month.",
  openNextPayment: "Open the next payment",
  approveUsdc: "Approve USDC",
  payByWalletTitle: "Pay with your wallet",
  payByWalletBody:
    "Connect a wallet on Base Sepolia, approve the exact USDC amount, then pay the rent.",
  payByStablecoinTitle: "Pay with stablecoin",
  bankPaymentComingSoon: "Bank payment · Coming soon",
  approved: "USDC approved",
  notMinted: "This listing is not minted yet. It becomes payable once the offer NFT exists.",
  notConfiguredTitle: "Pay is not configured yet",
  notConfiguredBody:
    "The Merkado contract is not deployed or configured. Nothing can be sent until NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS is set.",
};

const NL: PayCopyEntry = {
  greeting: "Hallo",
  allSet: "Je huur blijft hetzelfde.",
  payThisMonth: "Betaal deze maand huur",
  unchanged:
    "Je huur, je contract, je verhuurder en waar je betaalt blijven hetzelfde.",
  nextPayment: "Volgende betaling",
  due: "Vervaldatum",
  method: "Betaalwijze",
  payNow: "Huur betalen",
  noticeTitle: "Je huurbetaling blijft hetzelfde — je huurcontract verandert niet",
  weAreNotLandlord:
    "Wij zijn niet je verhuurder. Wij mogen niet binnenkomen, inspecteren, de huur wijzigen of de huur beëindigen.",
  optionA: "Betaal het exacte USDC-bedrag. Je huurbedrag en contract blijven hetzelfde.",
  afterTerm: "Na de laatste toegewezen maand blijf je betalen zoals nu.",
  landlordCountersign: "Je verhuurder mede-ondertekent dit bericht voor het dossier.",
  whatDoesNotChange: "Wat niet verandert",
  recentPayments: "Betalingsgeschiedenis",
  noPaymentsYet: "Nog geen betalingen vastgelegd.",
  optionATitle: "USDC-huurbetaling",
  current: "Huidig",
  paid: "Betaald",
  scheduled: "Gepland",
  confirmPay: "Huur betalen",
  to: "aan",
  reference: "Kenmerk",
  connectWallet: "Wallet verbinden",
  connecting: "Verbinden…",
  connected: "Wallet verbonden",
  awaiting: "Wachten op bevestiging",
  pending: "Betaling verzonden",
  successTitle: "Huur betaald",
  successBody: "Dank je. Je huur en contract blijven hetzelfde.",
  failed: "Betaling is niet gelukt",
  reverted: "De transactie is ongedaan gemaakt op de chain",
  retry: "Opnieuw proberen",
  alreadyPaid: "Al betaald",
  overdue: "Deze betaling is te laat",
  expired: "Deze betaallink is verlopen",
  notFound: "We kunnen deze betaallink niet vinden.",
  partial: "Het verstuurde bedrag komt niet overeen met de huur.",
  network: "Netwerk",
  receiving: "Betaalt aan het offercontract",
  memoNote:
    "Het kenmerk is voor je administratie. Het on-chain betaal-id is opake en bevat het nooit.",
  historyLink: "Betalingsgeschiedenis",
  myPayments: "Mijn betalingen",
  dueStatus: "Te betalen",
  networkUnset: "Netwerk nog te bevestigen",
  sameAsRent: "Hetzelfde als {amount} maandelijkse huur",
  usdcTip: "Digitale dollars. Het bedrag is gelijk aan je huur.",
  networkTip: "Betalingen worden afgehandeld op het gekozen netwerk.",
  txRef: "Transactie",
  payEarlierFirst: "Betaal eerst {period}.",
  payEarlierBody: "Eerdere huur moet eerst betaald zijn.",
  openNextPayment: "Open de volgende betaling",
  approveUsdc: "USDC goedkeuren",
  payByWalletTitle: "Betaal met je wallet",
  payByWalletBody:
    "Verbind een wallet op Base Sepolia, keur het exacte USDC-bedrag goed en betaal dan de huur.",
  payByStablecoinTitle: "Betaal met stablecoin",
  bankPaymentComingSoon: "Bankbetaling · Binnenkort",
  approved: "USDC goedgekeurd",
  notMinted: "Deze listing is nog niet gemunt. Hij wordt betaalbaar zodra de offer NFT bestaat.",
  notConfiguredTitle: "Betalen is nog niet geconfigureerd",
  notConfiguredBody:
    "Het Merkado-contract is nog niet geactiveerd. Er kan niets worden verstuurd tot NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS is ingesteld.",
};

const PAP: PayCopyEntry = {
  greeting: "Bon dia",
  allSet: "Bo huur no ta kambia.",
  payThisMonth: "Paga e huur di e luna aki",
  unchanged: "Bo huur, bo kontrakt, bo dueño di kas i unda bo ta paga no ta kambia.",
  nextPayment: "Próksimo pago",
  due: "Fecha",
  method: "Método di pago",
  payNow: "Paga huur",
  noticeTitle: "Bo pago di huur no ta kambia — bo kontrakt no ta kambia",
  weAreNotLandlord:
    "Nos no ta bo dueño di kas. Nos no por drenta, inspeksioná, kambia e huur, ni terminá e kontrakt.",
  optionA: "Paga e montante eksakto di USDC. Bo montante di huur i kontrakt ta keda igual.",
  afterTerm: "Despues di e último luna asigná, bo ta sigui paga manera awor.",
  landlordCountersign: "Bo dueño di kas lo firma e karta aki tambe pa e dossier.",
  whatDoesNotChange: "Kiko no ta kambia",
  recentPayments: "Historia di pago",
  noPaymentsYet: "No tin pago registrá ainda.",
  optionATitle: "Pago di huur den USDC",
  current: "Aktual",
  paid: "Pagá",
  scheduled: "Programá",
  confirmPay: "Paga huur",
  to: "na",
  reference: "Referensia",
  connectWallet: "Konektá wallet",
  connecting: "Konektando…",
  connected: "Wallet konektá",
  awaiting: "Sperando konfirmashon",
  pending: "Pago mandá",
  successTitle: "Huur pagá",
  successBody: "Danki. Bo huur i kontrakt no ta kambia.",
  failed: "E pago no a pasa",
  reverted: "E transashon a rebolbé riba e chain",
  retry: "Purba di nobo",
  alreadyPaid: "Kaba pagá",
  overdue: "E pago aki ta lat",
  expired: "E link di pago a kaduká",
  notFound: "Nos no por a haña e link di pago.",
  partial: "E montante mandá no ta koresponde ku e huur.",
  network: "Red",
  receiving: "Ta paga na e kontrakt di offer",
  memoNote:
    "E referensia ta pa bo rekord. E id di pago on-chain ta opako i no ta kontené esaki.",
  historyLink: "Historia di pago",
  myPayments: "Mi pagonan",
  dueStatus: "Pa paga",
  networkUnset: "Red ainda pa konfirmá",
  sameAsRent: "Mismo ku {amount} huur mensualmente",
  usdcTip: "Dollar digital. E montante ta koresponde ku bo huur.",
  networkTip: "Pagonan ta keda na e red skohí.",
  txRef: "Transakshon",
  payEarlierFirst: "Paga {period} prome.",
  payEarlierBody: "Bo mester paga e huur anterior prome.",
  openNextPayment: "Habrie e próximo pago",
  approveUsdc: "Aproba USDC",
  payByWalletTitle: "Paga ku bo wallet",
  payByWalletBody:
    "Konektá un wallet na Base Sepolia, aproba e montante eksakto di USDC i paga e huur.",
  payByStablecoinTitle: "Paga ku stablecoin",
  bankPaymentComingSoon: "Pago di banko · Pronto",
  approved: "USDC aprobá",
  notMinted: "E listing aki no ta mint ainda. E ta bira pagable ora e offer NFT existí.",
  notConfiguredTitle: "Pago no ta konfigurá ainda",
  notConfiguredBody:
    "E kontrakt di Merkado no ta aktivá ainda. Nada no por wòrdu mandá te ku NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS ta stipá.",
};

export const payerCopy = {
  en: EN,
  nl: NL,
  pap: PAP,
} as const;

export type PayerLocale = keyof typeof payerCopy;
export type PayerCopy = {
  [K in keyof (typeof payerCopy)["en"]]: string;
};