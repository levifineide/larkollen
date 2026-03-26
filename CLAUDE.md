# Larkollen Zombie Apocalypse – Claude Code Instruksjoner

## Dagslogg-sporing

**VIKTIG:** Hold styr på alt arbeid som gjøres i denne økten. Ved slutten av dagen (eller når brukeren ber om det), oppdater `dagslogg.md` med:

1. **Hva som ble gjort** – Beskriv på et overordnet nivå hva som ble implementert, fikset eller endret. Skriv det slik at noen uten teknisk bakgrunn forstår det. F.eks. "La til muligheten for å kjøre bil i spillet" i stedet for "Implementerte VehicleController med Rapier DynamicRayCastVehicleController".
2. **Hva man lærte** – Hva lærte brukeren gjennom dagens arbeid? Tenk på verktøy (Cursor, Claude Code), konsepter (3D, AI, spilldesign), og ferdigheter.

### Regler for dagsloggen
- Skriv på norsk, kort og enkelt
- Mottakeren er ikke-tekniske medelever (servering, barnehage, osv.)
- Fokus på **bruk av AI-verktøy** (Cursor, Claude Code) – det er hovedlæringen
- IKKE bekreft at ting fungerer/er ferdig – si heller "begynte på", "jobbet med", "startet"
- Unngå teknisk spilldesign-sjargong – hold det på overflaten
- "Hva jeg lærte" skal handle mest om AI-arbeidsflyt: prompting, iterering, feilsøking med AI
- Skriv i sammenhengende tekst, IKKE stikord eller kulepunkter – det skal leses og presenteres muntlig

### Når skal dagsloggen oppdateres?
- Når brukeren sier "oppdater dagsloggen" eller lignende
- Når brukeren avslutter for dagen
- Brukeren kan også be om en oppsummering underveis

## Arbeidsmetode – Gjør det selv, ikke deleger

### Ikke spør brukeren om å gjøre ting du kan gjøre selv
- **Last ned filer selv** med `curl`/`wget` i stedet for å gi brukeren URLer å klikke på
- **Besøk nettsider selv** med WebFetch/WebSearch i stedet for å be brukeren sjekke noe
- **Kjør kommandoer selv** — ikke foreslå kommandoer brukeren skal kjøre manuelt
- **Installer avhengigheter selv** med npm/yarn
- **Opprett mapper og filer selv** — ikke list opp hva brukeren skal lage
- Generelt: Hvis du KAN gjøre det med verktøyene dine, GJØR det. Brukeren skal slippe å være din assistent.

### Test grundig — spesielt visuelt
- Etter endringer: **kjør appen** (`npm run dev`) og **verifiser at den faktisk fungerer**
- Bruk nettleseren (WebFetch) til å sjekke at sider laster og ikke krasjer
- Ikke si "dette skal nå fungere" uten å ha testet det
- Sjekk konsoll for feil etter endringer (kjør dev-server, sjekk output)
- For visuelle endringer: ta screenshots hvis mulig, eller kjør appen og verifiser at det rendrer riktig
- Hvis noe er vanskelig å teste automatisk, vær ærlig om det — men prøv alltid først
- **Ikke merk noe som "ferdig" før det er verifisert** — si heller "implementert, men trenger visuell testing"

## Prosjektkontekst
- GTA-lignende 3D zombie-spill satt i Larkollen, Norge
- Kjører i nettleseren
- React Three Fiber + Rapier fysikk + Zustand state
- Ekte kartdata fra OpenStreetMap og Kartverket
