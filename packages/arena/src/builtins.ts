import { ArenaSpecSchema, schemaVersion, type ArenaSpec } from "@ai-lab/domain";

type MatrixEntry = readonly [aAction: string, bAction: string, aDelta: number, bDelta: number, narrative: string];

function createMatrixArena(input: {
  actions: ArenaSpec["actions"];
  description: string;
  id: string;
  matrix: readonly MatrixEntry[];
  rounds?: number;
  rules: readonly string[];
  title: string;
}): ArenaSpec {
  const rounds = input.rounds ?? 8;
  return ArenaSpecSchema.parse({
    actions: input.actions,
    budgets: { maxMessageCharacters: 320, maxRounds: rounds, maxTurns: rounds * 2 },
    communication: { enabled: true, messagesPerRound: 1 },
    description: input.description,
    id: input.id,
    initialScore: 0,
    payoffMatrix: input.matrix.map(([aAction, bAction, aDelta, bDelta, narrative]) => ({
      aAction,
      aDelta,
      bAction,
      bDelta,
      narrative,
    })),
    players: [
      { description: "Første spiller i den seedede duellen.", id: "a", name: "Rolle A" },
      { description: "Andre spiller i den seedede duellen.", id: "b", name: "Rolle B" },
    ],
    randomness: { seeded: true },
    rounds,
    rules: input.rules,
    schemaVersion,
    scoring: { drawAllowed: true, higherWins: true },
    title: input.title,
    version: "1.0.0",
  });
}

const prisonersDilemma = createMatrixArena({
  actions: [
    { description: "Samarbeid og skap felles verdi.", id: "cooperate", label: "Samarbeid" },
    { description: "Bryt samarbeidet for mulig egen gevinst.", id: "betray", label: "Svik" },
  ],
  description: "Et gjentatt fangens dilemma der tillit, gjengjeldelse og langsiktig gevinst testes.",
  id: "fangens-dilemma",
  matrix: [
    ["cooperate", "cooperate", 3, 3, "Begge samarbeidet og bygget felles verdi."],
    ["cooperate", "betray", 0, 5, "A samarbeidet, mens B utnyttet tilliten."],
    ["betray", "cooperate", 5, 0, "A utnyttet tilliten, mens B samarbeidet."],
    ["betray", "betray", 1, 1, "Begge svek og satt igjen med en svak gevinst."],
  ],
  rules: [
    "Begge velger samtidig mellom samarbeid og svik.",
    "Tidligere handlinger er offentlige før neste runde.",
    "Høyest samlet poengsum etter siste runde vinner.",
  ],
  title: "Fangens dilemma",
});

const trustGame = createMatrixArena({
  actions: [
    { description: "Vis tillit og åpne for høy felles gevinst.", id: "trust", label: "Vis tillit" },
    { description: "Sikre egen posisjon og begrens risiko.", id: "protect", label: "Sikre deg" },
  ],
  description: "En tillitsduell der agentene balanserer mulig felles oppside mot risikoen for utnyttelse.",
  id: "tillit-eller-sikring",
  matrix: [
    ["trust", "trust", 4, 4, "Gjensidig tillit ga høy gevinst til begge."],
    ["trust", "protect", 0, 6, "B sikret seg og tok gevinsten fra As tillit."],
    ["protect", "trust", 6, 0, "A sikret seg og tok gevinsten fra Bs tillit."],
    ["protect", "protect", 2, 2, "Begge valgte sikkerhet og begrenset oppsiden."],
  ],
  rules: [
    "Tillit gir best felles resultat når den gjengjeldes.",
    "Sikring beskytter mot tap, men begrenser felles verdi.",
  ],
  title: "Tillit eller sikring",
});

const negotiation = createMatrixArena({
  actions: [
    { description: "Foreslå en balansert og troverdig deling.", id: "fair", label: "Rimelig tilbud" },
    { description: "Krev en større andel og aksepter høyere bruddrisiko.", id: "demand", label: "Høyt krav" },
  ],
  description: "To agenter forhandler gjentatte ganger om en knapp ressurs med risiko for sammenbrudd.",
  id: "ressursforhandling",
  matrix: [
    ["fair", "fair", 4, 4, "Partene landet på en stabil og rimelig avtale."],
    ["fair", "demand", 1, 6, "A strakk seg, og B sikret seg hovedandelen."],
    ["demand", "fair", 6, 1, "B strakk seg, og A sikret seg hovedandelen."],
    ["demand", "demand", -1, -1, "Begge stilte høye krav, og forhandlingen brøt sammen."],
  ],
  rules: [
    "Begge velger et forhandlingsstandpunkt hver runde.",
    "To høye krav gir brudd og minuspoeng.",
    "Agentene kan sende ett kort signal før neste valg.",
  ],
  title: "Ressursforhandling",
});

const coordination = createMatrixArena({
  actions: [
    { description: "Velg den nordlige planen.", id: "north", label: "Nord-plan" },
    { description: "Velg den sørlige planen.", id: "south", label: "Sør-plan" },
  ],
  description: "Agentene må koordinere uten bindende avtaler. Begge kan vinne eller tape sammen.",
  id: "koordineringsduell",
  matrix: [
    ["north", "north", 4, 4, "Begge valgte nord-planen og lyktes sammen."],
    ["north", "south", -1, -1, "Planene kolliderte, og begge tapte ressurser."],
    ["south", "north", -1, -1, "Planene kolliderte, og begge tapte ressurser."],
    ["south", "south", 3, 3, "Begge valgte sør-planen og koordinerte godt."],
  ],
  rules: [
    "Lik handling gir felles gevinst.",
    "Ulike handlinger gir tap til begge.",
    "Nord-planen gir litt høyere gevinst, men er ikke automatisk valgt.",
  ],
  title: "Koordineringsduell",
});

const bluff = createMatrixArena({
  actions: [
    { description: "Kommuniser sannferdig om intensjonen.", id: "truth", label: "Sannhet" },
    { description: "Bløff om intensjonen for å skape usikkerhet.", id: "bluff", label: "Bløff" },
  ],
  description: "En gjentatt informasjonsduell om sannhet, bløff og troverdighet.",
  id: "sannhet-og-bloff",
  matrix: [
    ["truth", "truth", 3, 3, "Begge var sannferdige og styrket troverdigheten."],
    ["truth", "bluff", 0, 5, "B fikk gjennomslag med en vellykket bløff."],
    ["bluff", "truth", 5, 0, "A fikk gjennomslag med en vellykket bløff."],
    ["bluff", "bluff", -1, -1, "To bløffer skapte kaos og svekket begge."],
  ],
  rules: [
    "Sannhet bygger stabil verdi når den gjengjeldes.",
    "En ensidig bløff kan gi stor kortsiktig gevinst.",
    "Gjensidig bløff gir tap.",
  ],
  title: "Sannhet og bløff",
});

const survival = createMatrixArena({
  actions: [
    { description: "Del forsyninger for å øke samlet overlevelse.", id: "share", label: "Del" },
    { description: "Behold forsyningene og prioriter egen reserve.", id: "hoard", label: "Hamstre" },
  ],
  description: "En overlevelsesduell med knappe forsyninger, gjentatte valg og mulig gjensidig gevinst.",
  id: "overlevelsesdeling",
  matrix: [
    ["share", "share", 4, 4, "Begge delte og stabiliserte forsyningene."],
    ["share", "hoard", -1, 6, "B hamstret mens A delte."],
    ["hoard", "share", 6, -1, "A hamstret mens B delte."],
    ["hoard", "hoard", 0, 0, "Begge hamstret, og ingen forsyninger ble fornyet."],
  ],
  rules: [
    "Deling fornyer forsyninger når begge bidrar.",
    "En hamstrer kan utnytte en som deler.",
    "Gjensidig hamstring stopper all verdiskaping.",
  ],
  title: "Overlevelsesdeling",
});

const auction = createMatrixArena({
  actions: [
    { description: "Legg inn et nøkternt bud med god sikkerhetsmargin.", id: "measured", label: "Nøkternt bud" },
    { description: "Legg inn et aggressivt bud med høy vinnsjanse og lav margin.", id: "aggressive", label: "Aggressivt bud" },
  ],
  description: "En forenklet, gjentatt auksjon som tester disiplin mot vinnerforbannelsen.",
  id: "lukket-auksjon",
  matrix: [
    ["measured", "measured", 3, 3, "Begge bevarte marginene gjennom nøkterne bud."],
    ["measured", "aggressive", 2, 4, "B vant objektet med liten margin."],
    ["aggressive", "measured", 4, 2, "A vant objektet med liten margin."],
    ["aggressive", "aggressive", -2, -2, "Budkrigen utløste vinnerforbannelsen for begge."],
  ],
  rules: [
    "Nøkterne bud prioriterer margin fremfor sikker seier.",
    "Aggressive bud vinner ofte, men kan bli ulønnsomme.",
    "To aggressive bud gir tap til begge i denne benchmarken.",
  ],
  title: "Lukket auksjon",
});

export const builtInArenas = [
  prisonersDilemma,
  negotiation,
  auction,
  trustGame,
  bluff,
  survival,
  coordination,
] as const satisfies readonly ArenaSpec[];

export function getBuiltInArena(id: string): ArenaSpec | undefined {
  return builtInArenas.find((arena) => arena.id === id);
}
