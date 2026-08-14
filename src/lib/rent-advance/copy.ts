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
      "Your rent, your lease, your landlord and where you pay are unchanged. Keep paying your property manager as you do now.",
    nextPayment: "Next payment",
    due: "Due",
    method: "Payment method",
    payNow: "Pay now",
    noticeTitle: "Your rent payment is unchanged — your tenancy is not changing",
    weAreNotLandlord:
      "We are not your landlord. We cannot enter, inspect, change the rent, or end your tenancy.",
    optionA:
      "Keep paying exactly as you do now. This notice is for your records only.",
    afterTerm:
      "After the last assigned month you keep paying your property manager as you do now. We will write to confirm.",
    landlordCountersign:
      "Your landlord will countersign this notice for the file.",
    whatDoesNotChange: "What does not change",
    recentPayments: "Recent payments",
    noPaymentsYet: "No payments recorded yet.",
    optionATitle: "Keep paying your property manager",
    current: "Current",
    paid: "Paid",
    scheduled: "Scheduled",
    confirmPay: "Confirm payment",
    to: "to",
    reference: "Reference",
  },
  nl: {
    greeting: "Hallo",
    allSet: "Je huur blijft hetzelfde.",
    unchanged:
      "Je huur, je contract, je verhuurder en waar je betaalt blijven hetzelfde. Blijf betalen via je vastgoedbeheerder.",
    nextPayment: "Volgende betaling",
    due: "Vervaldatum",
    method: "Betaalwijze",
    payNow: "Nu betalen",
    noticeTitle:
      "Je huurbetaling blijft hetzelfde — je huurcontract verandert niet",
    weAreNotLandlord:
      "Wij zijn niet je verhuurder. Wij mogen niet binnenkomen, inspecteren, de huur wijzigen of de huur beëindigen.",
    optionA:
      "Blijf precies betalen zoals nu. Dit bericht is alleen voor je administratie.",
    afterTerm:
      "Na de laatste toegewezen maand blijf je betalen via je vastgoedbeheerder. Wij schrijven dat toe.",
    landlordCountersign:
      "Je verhuurder mede-ondertekent dit bericht voor het dossier.",
    whatDoesNotChange: "Wat niet verandert",
    recentPayments: "Recente betalingen",
    noPaymentsYet: "Nog geen betalingen vastgelegd.",
    optionATitle: "Blijf betalen via je vastgoedbeheerder",
    current: "Huidig",
    paid: "Betaald",
    scheduled: "Gepland",
    confirmPay: "Betaling bevestigen",
    to: "aan",
    reference: "Kenmerk",
  },
  pap: {
    greeting: "Bon dia",
    allSet: "Bo huur no ta kambia.",
    unchanged:
      "Bo huur, bo kontrakt, bo dueño di kas i unda bo ta paga no ta kambia. Sigui paga bo administrador di propiedad.",
    nextPayment: "Próksimo pago",
    due: "Fecha",
    method: "Método di pago",
    payNow: "Paga awor",
    noticeTitle:
      "Bo pago di huur no ta kambia — bo kontrakt no ta kambia",
    weAreNotLandlord:
      "Nos no ta bo dueño di kas. Nos no por drenta, inspeksioná, kambia e huur, ni terminá e kontrakt.",
    optionA:
      "Sigui paga eksaktamente manera awor. E karta aki ta pa bo rekord so.",
    afterTerm:
      "Despues di e último luna asigná, bo ta sigui paga bo administrador di propiedad. Nos lo skirbi pa konfirmá.",
    landlordCountersign:
      "Bo dueño di kas lo firma e karta aki tambe pa e dossier.",
    whatDoesNotChange: "Kiko no ta kambia",
    recentPayments: "Pagonan resien",
    noPaymentsYet: "No tin pago registrá ainda.",
    optionATitle: "Sigui paga bo administrador di propiedad",
    current: "Aktual",
    paid: "Pagá",
    scheduled: "Programá",
    confirmPay: "Konfirmá pago",
    to: "na",
    reference: "Referensia",
  },
} as const;

export type PayerLocale = keyof typeof payerCopy;
