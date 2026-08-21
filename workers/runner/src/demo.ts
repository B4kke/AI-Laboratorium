import { runEvolution } from "@ai-lab/evolution";

const result = await runEvolution({
  generationCount: 10,
  onProgress: ({ message }) => console.log(message),
  populationSize: 6,
  seed: "norsk-demo-2026",
  trialsPerCandidate: 4,
});

console.log(
  JSON.stringify(
    {
      besteFitness: result.best.fitness,
      besteGenom: result.best.genome.id,
      dueller: result.totalDuels,
      generasjoner: result.generations.length,
      konfidensintervall: result.best.winRateInterval,
    },
    null,
    2,
  ),
);
