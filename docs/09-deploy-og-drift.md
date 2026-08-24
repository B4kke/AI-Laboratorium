# Deploy og drift

Dette er den operative sjekklisten for AI-Laboratorium. Den forutsetter at deploy skjer fra en grønn GitHub-branch eller pull request.

## Før preview-deploy

1. Kjør `pnpm install --frozen-lockfile`.
2. Kjør `pnpm verify`.
3. Kontroller at ingen `.env*`-filer unntatt `.env.example` er sporet av Git.
4. Bekreft at `PROVIDER_FREE_ONLY=true` i preview og produksjon.
5. For NVIDIA: legg bare bekreftede gratis-ID-er i `NVIDIA_CONFIRMED_FREE_MODELS`.
6. Sett `REPORT_SIGNING_SECRET` til minst 32 tilfeldige tegn.
7. Hvis en ekstern provider-nøkkel er satt, sett også en separat `AI_LAB_ACCESS_TOKEN` til minst 32 tilfeldige tegn.
8. Sett `DATABASE_URL` for agentbibliotek/Evolution og start `pnpm --filter @ai-lab/runner worker` i en separat prosess.

Lokale baselines krever ingen hemmeligheter og bør alltid brukes til smoke-test.

## Vercel

- Importer GitHub-repositoriet.
- Sett Root Directory til `apps/web`.
- Framework Preset: Next.js.
- Install Command: `pnpm install --frozen-lockfile`.
- Build Command: `pnpm build`.
- Health check etter deploy: `GET /api/health` skal svare `200` og `status: "klar"`.
- Aktiver Vercel Firewall-ratebegrensning for `/api/duels`, `/api/arena/design`, `/api/evolution`, `/api/providers` og `/api/reports/duel` i en offentlig flerinstans-deploy.

Miljøvariabler settes separat for Development, Preview og Production. Preview skal ikke få produksjonsnøkler dersom en smalere nøkkel eller lokale baselines er tilstrekkelig.

## Render

`render.yaml` oppretter en Docker-basert web service, PostgreSQL og en separat Docker-worker. `DATABASE_URL` kobles fra databasen til begge tjenester. Blueprinten genererer `REPORT_SIGNING_SECRET` og `AI_LAB_ACCESS_TOKEN`; legg samme aktuelle provider-nøkler/allowlists inn som secrets for web og worker. `PORT` leveres av plattformen og skal ikke hardkodes. Hvis webtjenesten skaleres horisontalt, legg en distribuert rategrense foran API-rutene i Render Edge eller en tilsvarende proxy.

## Smoke-test

Etter preview-deploy:

1. Åpne forsiden og kontroller norsk innhold på mobil og desktop.
2. Kjør Fangens dilemma først med merkede kontrollbaselines, deretter med to ekte modeller. Bekreft at replikkene i eventloggen er de faktiske providersvarene og at neste modellprompt inneholder forrige motpartsreplikk.
3. Bekreft med scripted kontroller at replay går til siste hendelse og viser samme fingeravtrykk ved samme seed. Faktiske LLM-kjøringer får alltid unik kamp-ID og kan gi ulikt fingeravtrykk selv med samme seed.
4. Last ned PDF og kontroller at filen starter med en lesbar rapportside.
5. Lagre minst ti agenter, bekreft «Agent N», SOUL.md, filer og minne etter reload, og kjør minst to utslagsrunder med ekte modeller. Kontroller agentselvrefleksjon, hoved-AI-avgjørelse, nye immutable snapshots under stabil Agent N-identitet, SOUL-/taktikkdiff, minneskriv med match-provenance, lineage, retired-status, én sluttmutert agent og holdout-resultat.
6. Kontroller runtime-loggene for `start`, `done`, status og varighet på API-kall.
7. Bekreft at en for stor JSON-kropp gir `413`, at gjentatte kall gir `429`, og at eksterne modeller gir `401` uten korrekt Bearer-token.

## Observabilitet

- `/api/health` eksponerer status, tidspunkt og kort commit-ID.
- `/api/health` svarer `503` i produksjon hvis rapporthemmeligheten mangler, eller hvis en konfigurert ekstern provider ikke har sikker tilgangsnøkkel.
- Alle API-ruter logger strukturert JSON med request-ID, rute, status og varighet.
- Vercel Analytics måler sidevisninger uten at provider-hemmeligheter eksponeres.
- Speed Insights måler Core Web Vitals.
- På Vercel Hobby brukes Dashboard eller `vercel logs` for runtime-feil.
- På Pro/Enterprise bør en signaturverifisert logg-/trace-drain eller en feilsporingsintegrasjon settes opp før produksjon.

## Promotering og rollback

Promoter samme verifiserte preview-artifact fremfor å bygge på nytt. Ved regressjon skal produksjonsaliaset rulles tilbake til forrige grønne deployment. Etter produksjonssetting kontrolleres runtime-feil den første timen.

## Hemmeligheter

- aldri bruk `NEXT_PUBLIC_` for provider-nøkler
- aldri skriv nøkkelverdier i logger, feilrespons, README eller issues
- roter en nøkkel umiddelbart dersom den havner i Git-historikk
- bruk `.env.local` lokalt; filen er gitignorert
- bruk ulike verdier for provider-nøkler, `AI_LAB_ACCESS_TOKEN` og `REPORT_SIGNING_SECRET`
- skriv tilgangsnøkkelen bare i UI-feltet; den skal ikke lagres i URL, nettleserlagring eller klientlogger
