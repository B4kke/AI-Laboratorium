# AGENTS.md — AI-Laboratorium

Denne filen er prosjektets arbeidskontrakt for GPT Work, Codex og andre kodeagenter.

## Start alltid med

1. `README.md`
2. `docs/00-project-charter.md`
3. `docs/01-system-architecture.md`
4. `docs/02-evolution-and-evaluation.md`
5. `docs/03-product-ui-and-observability.md`
6. `docs/04-providers-runtime-and-deployment.md`
7. `docs/05-reporting-and-analysis.md`
8. `docs/06-security-and-experiment-integrity.md`
9. `docs/07-roadmap-and-task-queue.md`
10. `docs/08-playground-and-ai-arena-builder.md`
11. denne filen på nytt før større arkitekturvalg

## Prosjektmål

Bygg et avansert evolusjonært multi-agent-laboratorium der agenters eksplisitte strategi, `SOUL.md`, memory-arkitektur og verktøypolicy kan selekteres og muteres over generasjoner. Plattformen skal være forskningsmessig etterprøvbar, visuelt forståelig og brukbar fra mobil.

Samtidig skal produktet ha en lavterskel Playground: brukeren skal kunne velge to modeller og en ferdig duell, eller beskrive en «lek» med vanlig språk og få AI-en til å lage en validert arena som kan kjøres umiddelbart. En enkel duell skal kunne oppgraderes til Best-of-N, benchmark eller full evolusjon uten å bytte motor.

## Ufravikelige designregler

- Ikke hardkod domenelogikk til én LLM-provider.
- Agenten skal aldri få direkte skriveadgang til host-filsystem, evaluator, andre agenters state eller secrets.
- `SOUL.md` og memory er virtuelle, versjonerte artefakter i database/object storage.
- Tapere elimineres fra aktiv populasjon, men snapshots slettes ikke; lineage og replay må kunne rekonstrueres.
- Ikke lagre eller eksponer privat chain-of-thought. Lagre bare eksplisitt genererte, brukerrettede decision traces: observasjon, valgt handling, kort begrunnelse, confidence, verktøybruk og relevante state-diffs.
- Alle score-/fitness-resultater skal knyttes til arena-versjon, seed, evaluator-versjon, provider/model og genome-version.
- Champion-status krever holdout-evaluering og gjentatte trials; én heldig kamp er aldri nok.
- UI skal aldri kreve at brukeren leser JSON for å forstå hva som skjer.
- Mobil er en first-class target, ikke en senere nedskalering.
- AI-genererte arenaer skal beskrives gjennom en begrenset, versjonert `ArenaSpec`/DSL. Modellgenerert kode skal aldri `eval`-es eller kjøres direkte som serverkode.
- En Playground-duell og et evolusjonseksperiment skal bruke samme arena-, event- og replay-primitiver slik at «idea -> duel -> benchmark -> evolution» er en ekte produktflyt.

## Teknisk retning

Foretrukket startstack:

- TypeScript
- Next.js App Router
- React
- shadcn/ui
- AI Elements for AI-generert tekst, streaming og tool/event rendering
- Postgres som kanonisk metadata/state store
- objektlagring for store rapporter/replays ved behov
- typed event stream for live observability
- separat worker-runtime for lange eksperimenter

Ikke bind worker-arkitekturen til Vercel Functions før langvarige løp, timeout, concurrency og kostnadsmodell er eksplisitt verifisert. Web og workers skal kunne deployes sammen eller hver for seg.

## Skills som skal brukes når relevante

Bruk faktiske skills fremfor å improvisere mønstre fra minnet.

### Frontend / produkt

- `vercel/nextjs`
- `vercel/ai-elements`
- `vercel/ai-sdk`
- `vercel/shadcn`
- `vercel/react-best-practices`
- `vercel/observability`
- `vercel/verification`
- `vercel/agent-browser-verify`

### Analyse / matematikk / måling

- `data-analytics/design-kpis`
- `data-analytics/validate-data`
- `data-analytics/visualize-data`
- `data-analytics/build-dashboard`
- `data-analytics/build-report`
- `data-analytics/analyze-data-quality` når metrikker eller data ikke kan stoles på uten kontroll

Det finnes ikke behov for å late som en generell «math skill» finnes. Statistiske metoder i prosjektet skal implementeres eksplisitt, testes numerisk og dokumenteres med antakelser.

### Kodekvalitet

- `codex-engineering-guardrails/code-work`
- `codex-engineering-guardrails/code-verification`

## LLM-provider policy

Primær målprovider: NVIDIA NIM hosted API.

Sekundær/fallback: OpenCode Zen, særlig modeller som eksplisitt er merket free når eksperimentet kan kjøres uten kostnad.

Providerlaget skal:

- gjøre model discovery ved runtime eller via cachet provider metadata
- støtte OpenAI-kompatible Chat Completions/Responses der leverandøren tilbyr det
- normalisere usage, latency, finish reason, tool support og eventuelle reasoning-felt til egen intern kontrakt
- aldri anta at en modell som var gratis i går fortsatt er gratis
- logge provider/model snapshot per run
- ha rate limiting, retry med jitter, circuit breaker og quota-aware scheduling

Secrets lagres bare i hostingplattformens secret/env-system og skal aldri inn i repo, logg eller rapport.

## Arbeidsmetode

For hver oppgave:

1. Identifiser hvilken P0/P1 den støtter.
2. Les relevante kontrakter før kode.
3. Lag minst mulig endring som etablerer en stabil primitive.
4. Legg til test eller verifiserbar evidence samtidig.
5. Oppdater task queue/worklog når en milepæl faktisk er bevist.
6. Skill mellom «implementert», «testet» og «produksjonsklar».

Ikke bygg ti UI-skjermer før eventmodellen og domenekontraktene er stabile.

## Testing

Minimumskrav etter hvert som kode kommer inn:

- unit tests for deterministic arena rules, selection, mutation og scoring
- property-based tests for invariants i evolution/arena-state der egnet
- seeded simulation tests
- integration tests for provider adapters med mocked responses
- schema/semantic tests for AI-generated `ArenaSpec`
- scripted/random-policy lint runs for generated arenas before real LLM execution
- end-to-end smoke for create experiment -> run -> live events -> result -> report
- end-to-end smoke for natural-language game -> rules preview -> duel -> replay
- mobile/narrow viewport browser verification
- statistical regression tests med toleranser, ikke skjøre eksakte floats

## Datamodell-prinsipp

Skill mellom:

- immutable facts/events
- derived projections/views
- current mutable experiment state

Eventloggen skal kunne brukes til replay og til å gjenbygge lesbare projections. Ikke gjør UI-komponenter til systemets source of truth.

## Definisjon av «agent thinking» i produktet

Brukeren ønsker å følge hva agentene «tenker og foretar seg». Implementasjonen skal vise en **decision trace**, ikke intern skjult resonnering.

Eksempel på lesbar trace:

- Observasjon: «Energi steg 37 % denne runden.»
- Mål: «Overlev med minst 20 % likvid reserve.»
- Handling: «Kjøper 12 energienheter og reduserer lån.»
- Begrunnelse: «Prisrisikoen vurderes høyere enn kortsiktig avkastning.»
- Confidence: 0.71
- Memory write: «Tidlig energimangel straffer høy gearing.»
- SOUL diff: «Prioriter robusthet over maksimal avkastning ved ukjent regime.»

Dette er eksplisitt brukerrettet output og audit trail. Ikke be modellen returnere eller lagre privat chain-of-thought.

## Scope guardrails

Prosjektet kan studere bedrag, allianser, konkurranse, forhandling og manipulasjonsstrategier **inne i syntetiske spillmiljøer**. Ikke koble slike arena-strategier til automatisert påvirkning av virkelige personer, kontoer eller tjenester.