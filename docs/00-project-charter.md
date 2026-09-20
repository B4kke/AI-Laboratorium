# 00 — Project Charter

## Vision

AI-Laboratorium skal være et avansert laboratorium for evolusjonære multi-agent-systemer. Plattformen skal la en bruker definere et miljø, en populasjon av agenter og en seleksjonsmekanisme, og deretter observere hvordan eksplisitte agentstrategier endrer seg gjennom konkurranse, samarbeid, mutasjon og crossover.

Dette er ikke et vanlig chatbot-prosjekt. Produktets kjerne er et eksperiment-system med streng provenance, versjonering, replay, statistisk evaluering og visualisering.

## Forskningsspørsmål plattformen skal kunne undersøke

- Kan persistent `SOUL.md` + memory utvikle robuste strategier uten å endre modellvekter?
- Hvilke strategier oppstår under ulike seleksjonspress?
- Når favoriseres samarbeid fremfor opportunisme?
- Hvordan påvirker persistent omdømme og minne utviklingen?
- Hvordan endrer agentatferd seg når ressursknapphet, økonomi eller skjult informasjon introduseres?
- Kan spesialiserte evolusjonslinjer senere kombineres til en mer generaliserende agent?
- Hvor mye av en forbedring er reell generalisering versus overfitting til en bestemt arena?
- Hvordan påvirker basemodell/provider den evolverte strategien?

## Primære bruksmåter

### 1. Duel arena
To agenter konkurrerer i et enkelt spill med forhandling før handling.

### 2. Population arena
Mange agenter konkurrerer og/eller samarbeider over flere runder.

### 3. Economic world
Agentene forvalter penger, ressurser, kontrakter, gjeld, investeringer og produksjon i en lukket simulert økonomi.

### 4. Survival world
Ressursknapphet, allianser, risiko, skjult informasjon og eliminering.

### 5. Negotiation / social strategy
Forhandling, koalisjonsbygging, troverdighet, reputasjon og strategisk informasjonsdeling innenfor arenaens regler.

### 6. Generalization gauntlet
Champion-agenter møter nye regler, nye seeds, nye motstandere og nye arenaer de ikke har sett under evolusjon.

## Evolverbare komponenter

Første versjon bør støtte:

- `SOUL.md`
- `MEMORY` som strukturert eller dokumentbasert langtidshukommelse
- strategy notes / policies
- prioriterte mål
- risk profile
- kommunikasjonspolicy
- verktøyvalg innenfor sandbox

Basemodellen er normalt låst under en evolusjonslinje slik at forbedring kan tilskrives agentlaget. Senere eksperimenter kan sammenligne eller blande modellfamilier.

## Agent lifecycle

```text
spawn
  -> observe
  -> decide
  -> act
  -> receive outcome
  -> reflect (explicit summary)
  -> propose memory/genome change
  -> validate mutation
  -> persist immutable snapshot
  -> selection
  -> reproduce / retire
```

«Retire» betyr ikke datatap. Alle generasjoner, tapere, vinnere og mutasjoner beholdes i lineage og replay.

## Suksesskriterier

En første seriøs release er vellykket når brukeren kan:

1. åpne webappen fra mobil eller desktop
2. velge arena, provider/modell, population size og generasjoner
3. starte et eksperiment uten å redigere configfiler manuelt
4. følge live agenthandlinger i lesbar tekst
5. se state, score, ratings og lineage oppdatere seg
6. åpne en agent og sammenligne `SOUL.md`/memory mellom generasjoner
7. replaye en kamp
8. sammenligne champion med baseline og tidligere champions
9. se usikkerhet og antall trials, ikke bare én leaderboard-score
10. generere en lesbar analyse og eksportere PDF

## Ikke-mål i første fase

- trening/fine-tuning av modellvekter
- virkelig økonomisk handel
- kobling av manipulasjonsstrategier mot faktiske personer eller kontoer
- fri shell-/internettilgang for arena-agenter
- perfekt generell intelligens
- påstand om at én champion er «superintelligent» basert på én benchmark

## Begreper

- **Base model:** underliggende LLM.
- **Agent:** base model + genome + memory + policy + runtime state.
- **Genome:** versjonert evolverbar strategi (`SOUL.md`, policies osv.).
- **Phenotype:** observerbar atferd i arenaen.
- **Arena:** deterministisk eller stokastisk simulert verden med regler.
- **Generation:** ett seleksjonsintervall.
- **Trial:** én uavhengig kjøring med eksplisitt seed.
- **Fitness vector:** flere mål som beskriver prestasjon.
- **Champion:** agent som består definert seleksjons- og holdout-kriterium.
- **Hall of fame:** immutable snapshots av historisk sterke agenter.

## Prosjektprinsipp

Det mest interessante resultatet er ikke bare «hvem vant», men **hvilke eksplisitte strategier som overlevde, hvorfor de gjorde det, og om de fortsatt virker i en ny verden**.
