export const SALE_NOT_LOAN =
  "This is a sale of rent receivables, not a loan. The annualised figure is only so a landlord can compare the flat fee with other ways of getting cash today.";

export const NO_OTHER_CHARGE =
  "No other charge of any kind: no arrangement fee, administration fee, onboarding fee, exit fee, or early-settlement charge.";

export const NON_RECOURSE =
  "If the payer fails to pay, pays late, or leaves early, the landlord keeps the purchase price in full and owes nothing.";

export const EFFECTIVE_RATE_PLAIN =
  "The landlord receives the cash once but forgoes rent month by month, so the average amount outstanding is roughly half the face amount. That is why the effective annualised figure is higher than the flat fee.";

export const HOLDER_NO_PROMISE =
  "Distributions depend entirely on collections received. If a month is missed, that month’s distribution is zero.";

export const SOLE_HOLDER_GATE =
  "Merkado Direct is unlaunched. The participation right stays in sole-holder mode while the characterisation opinion (M.1.2) and the investor-funds licensing question (M.1.4) are outstanding. This surface is not public, is not indexed, and nothing here is an offer or an invitation to subscribe.";

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
    demoOnly: "Demo only. No real wallet, signature, or transfer.",
    memoNote:
      "The payment reference is for your records. A plain transfer does not automatically carry this reference on-chain.",
    historyLink: "Payment history",
    myPayments: "My Payments",
    dueStatus: "Due",
    networkUnset: "Network to be confirmed",
    txRef: "Transaction",
    payEarlierFirst: "Pay {period} first.",
    payEarlierBody: "Earlier rent must be paid before this month.",
    openNextPayment: "Open the next payment",
  },
  nl: {
    greeting: "Hallo",
    allSet: "Je huur blijft hetzelfde.",
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
    demoOnly: "Alleen demo. Geen echte wallet, handtekening of overboeking.",
    memoNote:
      "Het kenmerk is voor je administratie. Een gewone overboeking zet dit niet automatisch on-chain.",
    historyLink: "Betalingsgeschiedenis",
    myPayments: "Mijn betalingen",
    dueStatus: "Te betalen",
    networkUnset: "Netwerk nog te bevestigen",
    txRef: "Transactie",
    payEarlierFirst: "Betaal eerst {period}.",
    payEarlierBody: "Eerdere huur moet eerst betaald zijn.",
    openNextPayment: "Open de volgende betaling",
  },
  pap: {
    greeting: "Bon dia",
    allSet: "Bo huur no ta kambia.",
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
    demoOnly: "Demo so. No tin wallet, firma ni transferensia real.",
    memoNote:
      "E referensia ta pa bo rekord. Un transferensia simpel no ta hiba e referensia automaticamente on-chain.",
    historyLink: "Historia di pago",
    myPayments: "Mi pagonan",
    dueStatus: "Pa paga",
    networkUnset: "Red ainda pa konfirmá",
    txRef: "Transakshon",
    payEarlierFirst: "Paga {period} prome.",
    payEarlierBody: "Bo mester paga e huur anterior prome.",
    openNextPayment: "Habrie e próximo pago",
  },
} as const;

export type PayerLocale = keyof typeof payerCopy;
