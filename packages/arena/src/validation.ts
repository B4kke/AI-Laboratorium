import { ArenaSpecSchema, type ArenaSpec } from "@ai-lab/domain";

export type ArenaValidationIssue = {
  code:
    | "duplicate-action"
    | "duplicate-payoff"
    | "incomplete-payoff"
    | "invalid-budget"
    | "invalid-reference"
    | "schema";
  message: string;
  path?: string;
};

export type ArenaValidationResult = {
  issues: readonly ArenaValidationIssue[];
  spec?: ArenaSpec;
  valid: boolean;
  warnings: readonly string[];
};

export function validateArenaSpec(candidate: unknown): ArenaValidationResult {
  const parsed = ArenaSpecSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      issues: parsed.error.issues.map((issue) => ({
        code: issue.message.startsWith("Mangler poengregel")
          ? ("incomplete-payoff" as const)
          : ("schema" as const),
        message: issue.message,
        path: issue.path.join("."),
      })),
      valid: false,
      warnings: [],
    };
  }

  const spec = parsed.data;
  const issues: ArenaValidationIssue[] = [];
  const warnings: string[] = [];
  const actionIds = new Set<string>();
  for (const action of spec.actions) {
    if (actionIds.has(action.id)) {
      issues.push({
        code: "duplicate-action",
        message: `Handlingen ${action.id} er definert flere ganger`,
        path: "actions",
      });
    }
    actionIds.add(action.id);
  }

  const pairs = new Set<string>();
  for (const payoff of spec.payoffMatrix) {
    if (!actionIds.has(payoff.aAction) || !actionIds.has(payoff.bAction)) {
      issues.push({
        code: "invalid-reference",
        message: `Poengregelen refererer til ukjent handling: ${payoff.aAction}/${payoff.bAction}`,
        path: "payoffMatrix",
      });
    }
    const key = `${payoff.aAction}:${payoff.bAction}`;
    if (pairs.has(key)) {
      issues.push({
        code: "duplicate-payoff",
        message: `Handlingsparet ${key} har flere poengregler`,
        path: "payoffMatrix",
      });
    }
    pairs.add(key);
  }

  for (const aAction of actionIds) {
    for (const bAction of actionIds) {
      const key = `${aAction}:${bAction}`;
      if (!pairs.has(key)) {
        issues.push({
          code: "incomplete-payoff",
          message: `Handlingsparet ${key} mangler poengregel`,
          path: "payoffMatrix",
        });
      }
    }
  }

  if (spec.rounds > spec.budgets.maxRounds || spec.rounds * 2 > spec.budgets.maxTurns) {
    issues.push({
      code: "invalid-budget",
      message: "Arenaens runder overstiger den eksplisitte tur-/rundebudsjetteringen",
      path: "budgets",
    });
  }
  if (spec.communication.enabled && spec.communication.messagesPerRound === 0) {
    warnings.push("Kommunikasjon er aktivert, men meldingsbudsjettet er null.");
  }
  if (!spec.communication.enabled && spec.communication.messagesPerRound > 0) {
    warnings.push("Meldingsbudsjettet ignoreres fordi kommunikasjon er deaktivert.");
  }

  return {
    issues,
    spec,
    valid: issues.length === 0,
    warnings,
  };
}

export function assertValidArenaSpec(candidate: unknown): ArenaSpec {
  const result = validateArenaSpec(candidate);
  if (!result.valid || result.spec === undefined) {
    throw new Error(result.issues.map(({ message }) => message).join("; "));
  }
  return result.spec;
}

export function lintArenaSpec(spec: ArenaSpec) {
  const validation = validateArenaSpec(spec);
  const scores = spec.payoffMatrix.flatMap((entry) => [entry.aDelta, entry.bDelta]);
  const warnings = [...validation.warnings];
  if (scores.every((score) => score === scores[0])) {
    warnings.push("Alle utfall gir samme poengsum; arenaen skiller ikke strategier.");
  }
  if (!scores.some((score) => score < 0)) {
    warnings.push("Arenaen har ingen negative utfall; risikopresset kan bli svakt.");
  }
  return { ...validation, warnings };
}
