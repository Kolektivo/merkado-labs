export const ARREARS_LADDER = [
  { day: 1, action: "Automated reminder to the payer. Purchaser notified." },
  { day: 3, action: "Telephone contact. Reason for non-payment recorded." },
  { day: 5, action: "Written notice. Landlord informed." },
  {
    day: 10,
    action: "Formal demand. Holders notified of the arrear and expected recovery.",
  },
  {
    day: 15,
    action: "Arrangement offered, or escalation decision recorded.",
  },
  {
    day: 30,
    action: "Formal default declared. Recovery assessment. Legal action considered.",
  },
] as const;

export function arrearsStep(daysLate: number) {
  return [...ARREARS_LADDER].reverse().find((step) => daysLate >= step.day) ?? null;
}

export function sameLadderForRelatedParty(): true {
  return true;
}
