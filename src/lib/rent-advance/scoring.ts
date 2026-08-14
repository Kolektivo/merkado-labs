export type ScoreBand = "A" | "B" | "C" | "D";

export function scoreBand(score: number): ScoreBand {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  return "D";
}

export function bandAdjustment(score: number): number {
  const band = scoreBand(score);
  if (band === "A") return -0.0025;
  if (band === "B") return 0;
  if (band === "C") return 0.0025;
  return 0.005;
}

export function bandLabel(score: number): string {
  const band = scoreBand(score);
  if (band === "A") return "Great deal";
  if (band === "B") return "Strong";
  if (band === "C") return "Fair";
  return "Weak";
}

export function payerBandLabel(score: number): string {
  return `Band ${scoreBand(score)}`;
}

export function compositeScore(passportScore: number, payerScore: number): number {
  return passportScore * 0.45 + payerScore * 0.55;
}

export function maxTermMonths(composite: number): number {
  if (composite >= 85) return 12;
  if (composite >= 70) return 9;
  return 6;
}
