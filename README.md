# AI-Laboratorium

AI-Laboratorium er et norsk, webbasert laboratorium for reproduserbare AI-dueller og evolusjonære multi-agent-eksperimenter. To agenter kan konkurrere i versjonerte arenaer, mens hele forsøket lagres som en ordnet hendelseslogg som kan spilles av, inspiseres og eksporteres.

Prosjektet er en deployklar vertikal MVP. Det kan kjøres helt uten API-nøkler med deterministiske, lokale referanseagenter. NVIDIA NIM og OpenCode Zen kan aktiveres som valgfrie serverbaserte modelltilbydere.

## Dette virker nå

- norsk, mobiltilpasset laboratorium for hurtigduell
- sju innebygde arenaer: fangens dilemma, ressursforhandling, auksjon, tillit, bløff, overlevelse og koordinering
- sikker Arenadesigner fra norsk fritekst, med lokal mal eller valgfri språkmodell
- streng og versjonert `ArenaSpec` uten modellgenerert kode
- append-only hendelseslogg, deterministisk replay og stabilt fingeravtrykk
- strukturert decision trace med handling, observasjon, mål, kort begrunnelse og sikkerhet – aldri skjult tankerekke
- provider-abstraksjon for lokale baselines, NVIDIA NIM og OpenCode Zen
- eksplisitt «kun gratis»-policy med dynamisk modelloppdagelse
- ti-generasjons evolusjonsløp med elitisme, mutasjon, fitness, lineage og 95 % Wilson-intervall
- nedlastbare rapporter som PDF, HTML og JSON, beskyttet av kortlevde serverbevis
- helseendepunkt, strukturerte runtime-logger, Vercel Analytics og Speed Insights
- strømbegrenset input, kostvektet ratebegrensning og samtidighetsvern på dyre API-er
- CI med lint, streng TypeScript, automatiserte tester og produksjonsbygg
- selvstendig Docker-image for Render eller annen containerplattform

## Kom i gang

Krav: Node.js 24 og pnpm 11.19.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Åpne `http://localhost:3000`. Lokale baselines er tilgjengelige med én gang.

Kopier `.env.example` til `.env.local` hvis du vil bruke eksterne modeller. Hemmeligheter skal aldri legges i Git.

```bash
cp .env.example .env.local
```

## Providers og gratispolicy

| Provider | Miljøvariabel | Gratispolicy |
|---|---|---|
| Lokale baselines | ingen | alltid lokal og gratis |
| OpenCode Zen | `OPENCODE_ZEN_API_KEY` | bare katalog-ID-er som ender på `-free` vises i free-only-modus |
| NVIDIA NIM | `NVIDIA_API_KEY` | modell-ID må også stå i `NVIDIA_CONFIRMED_FREE_MODELS` |

NVIDIA sitt `/models`-endepunkt oppgir ikke pris. Derfor behandles ingen NIM-modell som gratis uten en eksplisitt, kommaseparert allowlist i runtime-miljøet. Vanlig `deepseek-v4-flash` hos OpenCode Zen behandles ikke som gratis; den eksplisitte `-free`-varianten gjør det.

Alle API-nøkler leses kun på serveren. Nettleseren mottar bare providerstatus og bekreftede gratis-modeller. Når en ekstern provider-nøkkel er konfigurert, må `AI_LAB_ACCESS_TOKEN` også settes til en tilfeldig verdi på minst 32 tegn. Godkjente brukere skriver denne i feltet «Tilgang til eksterne modeller»; verdien holdes bare i fanens minne og sendes som Bearer-header.

`REPORT_SIGNING_SECRET` er påkrevd i produksjon, også når bare lokale baselines brukes. Den signerer en kortlevd digest av det eksakte serverresultatet, slik at rapportendepunktet ikke kan produsere en offisiell rapport fra et fabrikert klientresultat.

## Kvalitetssperrer

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Kjør alt i samme rekkefølge med:

```bash
pnpm verify
```

Et komplett lokalt evolusjonsløp kan også kjøres uten webgrensesnitt:

```bash
pnpm evolve:demo
```

## Arkitektur

| Område | Ansvar |
|---|---|
| `apps/web` | Next.js App Router, norsk UI, API-ruter og observabilitet |
| `packages/domain` | versjonerte Zod-kontrakter og entitets-ID-er |
| `packages/arena` | arenaer, semantisk validering, designer og duellmotor |
| `packages/events` | typede hendelser, append-only store og lesbar replay-projeksjon |
| `packages/providers` | provider-policy, modelloppdagelse, retries og circuit breaker |
| `packages/agents` | uforanderlige genomer, mutasjoner, diff og begrenset minne |
| `packages/evaluation` | Elo, fitness og usikkerhetsintervaller |
| `packages/evolution` | generasjoner, elitisme, mutasjon og lineage |
| `packages/reports` | etterprøvbare PDF-, HTML- og JSON-rapporter |
| `workers/runner` | kjørbar ti-generasjons demo |

## API

| Rute | Metode | Formål |
|---|---|---|
| `/api/health` | `GET` | deploy- og helsesjekk |
| `/api/providers` | `GET` | serverfiltrert provider- og modellkatalog |
| `/api/arenas` | `GET` | versjonerte innebygde arenaer |
| `/api/arena/design` | `POST` | lag og valider en arena fra norsk fritekst |
| `/api/duels` | `POST` | kjør en seedet Quick Duel |
| `/api/evolution` | `POST` | kjør et avgrenset evolusjonsløp |
| `/api/reports/duel` | `POST` | eksporter PDF, HTML eller JSON |

Alle skriveendepunkter har inkrementelle bytegrenser, runtime-validering, per-klient/global rategrense og samtidighetsvern. Eksterne dueller har i tillegg et hardt budsjett på 16 modellbeslutninger per kjøring. Evolusjon er begrenset til 120 dueller per synkron jobb, og rapporter krever et serverutstedt resultatbevis.

## Deploy på Vercel

1. Importer GitHub-repositoriet i Vercel.
2. Velg `apps/web` som **Root Directory**. Vercel oppdager pnpm-workspace og Next.js.
3. Behold installasjonskommandoen `pnpm install --frozen-lockfile` og byggkommandoen `pnpm build`.
4. Opprett `REPORT_SIGNING_SECRET` med minst 32 tilfeldige tegn i Vercel Project Settings, aldri som `NEXT_PUBLIC_*`.
5. Hvis eksterne providere aktiveres, legg også inn provider-nøkkelen og en separat `AI_LAB_ACCESS_TOKEN` med minst 32 tilfeldige tegn.
6. Aktiver Vercel Firewall-ratebegrensning for offentlige API-ruter hvis produksjonen kan skalere til flere instanser.
7. Deploy preview-branchen og kontroller at `/api/health` svarer `200` og `status: "klar"` før promotering.

Appen er fullt funksjonell uten provider-hemmeligheter. Git-integrasjon oppretter automatisk preview-deploy for pull requests, mens `.github/workflows/ci.yml` må være grønn før merge.

## Deploy på Render eller med Docker

`Dockerfile` bygger Next.js standalone-output. På Render kan `render.yaml` brukes som Blueprint; Blueprinten genererer både rapport- og tilgangshemmeligheten automatisk. Containeren lytter på `PORT` og bruker `/api/health` som helsesjekk.

```bash
docker build -t ai-laboratorium .
docker run --rm -p 3000:3000 \
  -e REPORT_SIGNING_SECRET="$(openssl rand -hex 32)" \
  ai-laboratorium
```

## Driftsgrenser i denne MVP-en

- Quick Duel og evolusjon returnerer komplette, eksporterbare snapshots, men historikk er ikke koblet til en permanent database ennå.
- Eksterne modellkall er avhengige av providerens tilgjengelighet og kvote; motoren har total timeout, begrenset response-body, redirect-blokkering, retry, circuit breaker og en validert standardhandling ved beslutningsfeil.
- Evolusjonspanelet bruker lokale baselines for å være raskt, gratis og reproduserbart i en serverless deploy.
- Applikasjonsgrensene beskytter hver instans. En offentlig flerinstans-deploy skal i tillegg bruke distribuert ratebegrensning i Vercel Firewall, Render Edge/egnet proxy eller tilsvarende ingress.
- Sentral loggdrain eller ekstern feilsporing må aktiveres i hostingkontoen hvis produksjonskravene krever varsling utenfor Vercels runtime-logger.

Den detaljerte driftsprosedyren ligger i [`docs/09-deploy-og-drift.md`](docs/09-deploy-og-drift.md). Produkt-, arkitektur-, sikkerhets- og forskningsgrunnlaget ligger i resten av [`docs/`](docs/).

## Lisens

MIT.
