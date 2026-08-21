export type ConfidenceInterval = {
  confidence: 0.95;
  lower: number;
  upper: number;
};

export function wilsonInterval(successes: number, trials: number): ConfidenceInterval {
  if (!Number.isInteger(successes) || !Number.isInteger(trials) || trials <= 0) {
    throw new Error("Wilson-intervallet krever et positivt heltallsutvalg");
  }
  if (successes < 0 || successes > trials) {
    throw new Error("Antall suksesser må ligge mellom null og utvalgsstørrelsen");
  }
  const z = 1.959963984540054;
  const probability = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const centre = probability + (z * z) / (2 * trials);
  const margin =
    z * Math.sqrt((probability * (1 - probability)) / trials + (z * z) / (4 * trials * trials));
  return {
    confidence: 0.95,
    lower: Math.max(0, (centre - margin) / denominator),
    upper: Math.min(1, (centre + margin) / denominator),
  };
}

export function updateElo(
  ratingA: number,
  ratingB: number,
  outcomeA: 0 | 0.5 | 1,
  kFactor = 24,
): { a: number; b: number } {
  const expectedA = 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
  const delta = kFactor * (outcomeA - expectedA);
  return { a: ratingA + delta, b: ratingB - delta };
}
