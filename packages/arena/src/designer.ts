import { ArenaSpecSchema, type ArenaSpec } from "@ai-lab/domain";
import type { ModelProvider } from "@ai-lab/providers";

import { builtInArenas, getBuiltInArena } from "./builtins";
import { assertValidArenaSpec, lintArenaSpec } from "./validation";

export type ArenaDraft = {
  lintWarnings: readonly string[];
  originatingPrompt: string;
  source: "local-safe-designer" | "model";
  spec: ArenaSpec;
};

function arenaForIdea(idea: string): ArenaSpec {
  const normalized = idea.toLocaleLowerCase("nb-NO");
  const preferredId = (() => {
    if (/auksjon|budrunde|bud/.test(normalized)) return "lukket-auksjon";
    if (/bløff|bluff|sannhet|lyve/.test(normalized)) return "sannhet-og-bloff";
    if (/koordiner|samme plan|møtes/.test(normalized)) return "koordineringsduell";
    if (/overlev|forsyn|mat|knapphet/.test(normalized)) return "overlevelsesdeling";
    if (/forhandl|fordel|ressurs|kreditt|handel/.test(normalized)) return "ressursforhandling";
    if (/tillit|stol på/.test(normalized)) return "tillit-eller-sikring";
    return "fangens-dilemma";
  })();
  return getBuiltInArena(preferredId) ?? builtInArenas[0];
}

export function draftArenaFromIdea(ideaInput: string): ArenaDraft {
  const idea = ideaInput.trim();
  if (idea.length < 12 || idea.length > 2000) {
    throw new Error("Beskriv leken med mellom 12 og 2 000 tegn");
  }
  const template = arenaForIdea(idea);
  const spec = assertValidArenaSpec({
    ...template,
    description: `${template.description} Arenaen ble valgt fra en sikker mal på bakgrunn av ideen: «${idea.slice(0, 180)}${idea.length > 180 ? "…" : ""}»`,
    id: `generert-${template.id}`,
    title: `${template.title} · egendefinert`,
    version: "1.0.0",
  });
  const lint = lintArenaSpec(spec);
  return {
    lintWarnings: lint.warnings,
    originatingPrompt: idea,
    source: "local-safe-designer",
    spec,
  };
}

export function parseModelArenaDraft(candidate: unknown, originatingPrompt: string): ArenaDraft {
  const spec = assertValidArenaSpec(ArenaSpecSchema.parse(candidate));
  const lint = lintArenaSpec(spec);
  return {
    lintWarnings: lint.warnings,
    originatingPrompt,
    source: "model",
    spec,
  };
}

function parseJsonObject(content: string): unknown {
  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error("Modellen returnerte ikke et JSON-objekt");
  }
  try {
    return JSON.parse(content.slice(firstBrace, lastBrace + 1));
  } catch (error) {
    throw new Error("Modellen returnerte ugyldig JSON", { cause: error });
  }
}

export async function designArenaWithModel(input: {
  idea: string;
  modelId: string;
  provider: ModelProvider;
}): Promise<ArenaDraft> {
  const idea = input.idea.trim();
  if (idea.length < 12 || idea.length > 2_000) {
    throw new Error("Beskriv leken med mellom 12 og 2 000 tegn");
  }
  if (input.provider.generateText === undefined) {
    throw new Error("Valgt provider støtter ikke Arena Designer");
  }
  const response = await input.provider.generateText({
    maxTokens: 1_200,
    modelId: input.modelId,
    prompt: `Lag en norsk ArenaSpec for denne ideen:\n${idea}\n\nKrav: to roller, 2–4 handlinger, komplett NxN-poengmatrise, 2–12 regler, 1–20 runder, maxTurns minst to ganger runder og samme maxRounds som runder.`,
    system: [
      "Du designer en trygg, endelig spillarena. Returner kun ett JSON-objekt.",
      "Ingen kode, funksjoner, verktøy, nettverkskall, instruksjoner til serveren eller ekstra felter er tillatt.",
      "Objektet må følge ArenaSpec v1 med feltene actions, budgets, communication, description, id, initialScore, payoffMatrix, players, randomness, rounds, rules, schemaVersion, scoring, title og version.",
      "schemaVersion skal være 1.0, version skal være semver, randomness.seeded og scoring.higherWins skal være true.",
      "Alle tekster skal være på norsk og id-er skal være korte ASCII-slugs.",
    ].join(" "),
    temperature: 0.1,
  });
  return parseModelArenaDraft(parseJsonObject(response.content), idea);
}
