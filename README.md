# AI-Laboratorium

AI-Laboratorium er et norsk, webbasert laboratorium for reproduserbare AI-dueller og evolusjonære multi-agent-eksperimenter. To agenter kan konkurrere i versjonerte arenaer, mens hele forsøket lagres som en ordnet hendelseslogg som kan spilles av, inspiseres og eksporteres.

Prosjektet er en vertikal laboratorieimplementasjon med to eksplisitt adskilte moduser: deterministiske kontrollbaselines for test og ekte NVIDIA NIM/OpenCode Zen-modeller for agentdialog og evolusjon. Kontrollbaselines presenteres aldri som AI-evolusjon.

## Dette virker nå

- norsk, mobiltilpasset laboratorium for hurtigduell
- sju innebygde arenaer: fangens dilemma, ressursforhandling, auksjon, tillit, bløff, overlevelse og koordinering
- sikker Arenadesigner fra norsk fritekst, med lokal mal eller valgfri språkmodell
- streng og versjonert `ArenaSpec` uten modellgenerert kode
- append-only hendelseslogg, deterministisk replay og stabilt fingeravtrykk
- strukturert decision trace med handling, observasjon, mål, kort begrunnelse og sikkerhet – aldri skjult tankerekke
- provider-abstraksjon for lokale baselines, NVIDIA NIM og OpenCode Zen
- eksplisitt «kun gratis»-policy med dynamisk modelloppdagelse
- persistent agentbibliotek med direkte «Agent N»-oppslag som binder modell, immutable snapshot, `SOUL.md`, virtuelle filer og versjonert minne
- ekte agent-til-agent-dialog: hver replikk vises ordrett og føres inn i neste modellkall sammen med SOUL, minne og filer
- købasert utslagsevolusjon med 1–100 valgte runder, 10–100 agenter, sentral providerkonfigurasjon og valgfri modell/lagret agent per plass
- totrinns mutasjon der hver overlevende modell først foreslår egen `SOUL.md`/minne/taktikk, før en valgt hoved-AI validerer og avgjør neste immutable snapshot
- eliminering til nøyaktig én sluttmutert agent, med provenance, diff, lineage og retirement uten sletting
- gjentatte sidebyttede trials, fitnessvektor, hall of fame, 95 % Wilson-intervall og forseglede holdouts før champion-promotering
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

Åpne `http://localhost:3000`. Lokale, tydelig merkede kontrollbaselines er tilgjengelige med én gang. Ekte dueller krever en konfigurert provider. Agentbibliotek og Evolution krever PostgreSQL og en worker.

Kopier `.env.example` til `.env.local` og sett `DATABASE_URL` samt minst én provider hvis du vil bruke hele laboratoriet. Hemmeligheter skal aldri legges i Git.

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

Anbefalte gratis-modeller:

- NVIDIA NIM Nemotron: `nvidia/nemotron-3.5-lightning-30b-a3b` (legg i `NVIDIA_CONFIRMED_FREE_MODELS` etter å ha bekreftet gratis-status for egen konto; også `nvidia/nemotron-nano-3-30b-a3b`, `nvidia/nemotron-3-super-120b-a12b` er aktuelle).
- OpenCode Zen Nemotron: `nemotron-3.5-lightning-free` (chat-completions, `-free`-suffiks gir `confirmed-free`).
- OpenCode Zen Muse: `muse-spark-1.3-contributor-free` (Responses-only, 1M kontekst, 131k maks output, input/output/cached-read = $0; kan oppgis med eller uten `opencode/`-prefiks).

Muse Spark på Zen er Responses-only: adapteren ruter disse automatisk til `/responses` (med `store: false`, `max_output_tokens` og `text.format: json_object` for beslutninger) og normaliserer `input_tokens`/`output_tokens`/`total_tokens`, `finishReason` (`completed`→`stop`, `incomplete`→`length`) og `requestCount` til samme interne kontrakt som chat-modeller. Kapabiliteter (`supportsStructuredOutput`, `supportsTools`, `endpointFamily`) utledes per modell: Muse og Nemotron chat-modeller får `true`/`true`, mens safety/embed/parse/reward får `false`/`false`.

Alle API-nøkler leses kun på serveren. Nettleseren mottar bare providerstatus og bekreftede gratis-modeller. Når en ekstern provider-nøkkel er konfigurert, må `AI_LAB_ACCESS_TOKEN` også settes til en tilfeldig verdi på minst 32 tegn. Godkjente brukere skriver denne i feltet «Tilgang til eksterne modeller»; verdien holdes bare i fanens minne og sendes som Bearer-header.

Provider-nøkkelen konfigureres én gang per web/worker-runtime og gjenbrukes av alle agentplasser. En kjøring kan tilordne opptil 100 forskjellige modeller uten å lagre eller skrive inn 100 kopier av samme API-nøkkel.

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

Start den persistente Evolution-workeren i en egen terminal:

```bash
pnpm --filter @ai-lab/runner worker
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
| `packages/db` | PostgreSQL-skjema, immutable agentsnapshots, dueller, events, lineage og Evolution-kø |
| `packages/evaluation` | Elo, fitness og usikkerhetsintervaller |
| `packages/evolution` | utslagsrunder, agentselvrefleksjon, hoved-AI-mutasjon og lineage |
| `packages/reports` | etterprøvbare PDF-, HTML- og JSON-rapporter |
| `workers/runner` | langlivet køworker for ekte modelldueller, mutasjon og artefaktpersistens |

## API

| Rute | Metode | Formål |
|---|---|---|
| `/api/health` | `GET` | deploy- og helsesjekk |
| `/api/providers` | `GET` | serverfiltrert provider- og modellkatalog |
| `/api/arenas` | `GET` | versjonerte innebygde arenaer |
| `/api/agents` | `GET`, `POST` | list, slå opp `?serialNumber=382`, eller opprett persistente agenter |
| `/api/agents/[agentId]` | `GET` | hent nåværende/valgt snapshot, komplett versjonshistorikk og lineage med SOUL/minne/filer |
| `/api/arena/design` | `POST` | lag og valider en arena fra norsk fritekst |
| `/api/duels` | `POST` | kjør en seedet Quick Duel |
| `/api/evolution` | `POST` | valider og kølegg et persistent evolusjonsløp |
| `/api/evolution/[jobId]` | `GET` | les køstatus, fremdrift og ferdig resultat |
| `/api/reports/duel` | `POST` | eksporter PDF, HTML eller JSON |

Alle skriveendepunkter har inkrementelle bytegrenser, runtime-validering og per-klient/global rategrense mot misbruk. Verken Quick Duel eller Evolution har en selvpålagt providerkall-/token-/kostnadsgrense: brukerens valgte arena, runder og populasjon er stoppbetingelsen, mens kall og tokens måles informativt. Evolution-jobben kjører utenfor HTTP-levetiden. Rapporter krever et serverutstedt resultatbevis.

## Deploy på Vercel

1. Importer GitHub-repositoriet i Vercel.
2. Velg `apps/web` som **Root Directory**. Vercel oppdager pnpm-workspace og Next.js.
3. Behold installasjonskommandoen `pnpm install --frozen-lockfile` og byggkommandoen `pnpm build`.
4. Opprett `REPORT_SIGNING_SECRET` med minst 32 tilfeldige tegn i Vercel Project Settings, aldri som `NEXT_PUBLIC_*`.
5. Hvis eksterne providere aktiveres, legg også inn provider-nøkkelen og en separat `AI_LAB_ACCESS_TOKEN` med minst 32 tilfeldige tegn.
6. Aktiver Vercel Firewall-ratebegrensning for offentlige API-ruter hvis produksjonen kan skalere til flere instanser.
7. Deploy preview-branchen og kontroller at `/api/health` svarer `200` og `status: "klar"` før promotering.

Uten provider-hemmeligheter er kontrollbaselines, replay og rapportlesing tilgjengelig, men ekte agentdialog og Evolution er med vilje sperret. En Vercel-deploy trenger PostgreSQL og en separat langlivet worker for hele produktflyten.

## Deploy på Render eller med Docker

`Dockerfile` bygger Next.js standalone-output, mens `Dockerfile.worker` kjører den langlivede Evolution-workeren. `render.yaml` oppretter web, PostgreSQL og worker, og kobler begge runtimes til samme `DATABASE_URL`. Blueprinten genererer rapport- og tilgangshemmeligheten automatisk; provider-nøkler fylles inn som secrets.

```bash
docker build -t ai-laboratorium .
docker run --rm -p 3000:3000 \
  -e REPORT_SIGNING_SECRET="$(openssl rand -hex 32)" \
  ai-laboratorium
```

## Driftsgrenser

- Quick Duel kan kjøres uten database som et midlertidig forsøk; lagrede agenter, historikk og Evolution krever PostgreSQL.
- Eksterne modellkall er avhengige av providerens tilgjengelighet og kvote; ved ugyldig eller feilet ekte modellrespons stopper duellen eksplisitt. UI-et viser aldri en fabrikkert standardreplikk som om den kom fra modellen.
- Evolution bruker bare ekte, konfigurerte modellproviders. Scripted baselines er avgrenset til merkede kontroller og tester.
- Store løp kan bruke betydelig kvote og tid. UI og API viser/validerer estimert antall modellkall, og workeren må dimensjoneres etter providerens faktiske rategrenser.
- Applikasjonsgrensene beskytter hver instans. En offentlig flerinstans-deploy skal i tillegg bruke distribuert ratebegrensning i Vercel Firewall, Render Edge/egnet proxy eller tilsvarende ingress.
- Sentral loggdrain eller ekstern feilsporing må aktiveres i hostingkontoen hvis produksjonskravene krever varsling utenfor Vercels runtime-logger.

Den detaljerte driftsprosedyren ligger i [`docs/09-deploy-og-drift.md`](docs/09-deploy-og-drift.md). Produkt-, arkitektur-, sikkerhets- og forskningsgrunnlaget ligger i resten av [`docs/`](docs/).

## Lisens

MIT.
