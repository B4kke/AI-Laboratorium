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

`render.yaml` oppretter en Docker-basert web service og genererer `REPORT_SIGNING_SECRET` og `AI_LAB_ACCESS_TOKEN`. Legg eventuelle provider-nøkler inn som secrets i Render Dashboard. `PORT` leveres av plattformen og skal ikke hardkodes. Hvis tjenesten skaleres horisontalt, legg en distribuert rategrense foran API-rutene i Render Edge eller en tilsvarende proxy.

## Smoke-test

Etter preview-deploy:

1. Åpne forsiden og kontroller norsk innhold på mobil og desktop.
2. Kjør Fangens dilemma med Astra og Nova i demomodus.
3. Bekreft at replay går til siste hendelse og viser samme fingeravtrykk ved samme seed.
4. Last ned PDF og kontroller at filen starter med en lesbar rapportside.
5. Kjør ti generasjoner og kontroller 10 generasjonsrader, 120 dueller og lineage.
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
