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

## Utviklingspraksis

### Inkrementell utvikling
- Gjør små, testbare endringer — ikke skriv hundrevis av linjer før du tester
- Et 3D-spill med fysikk har mange usynlige avhengigheter. En liten endring kan krasje alt
- Etter hver meningsfull endring: verifiser at det fungerer før du går videre

### Ytelse i R3F
- **Aldri** bruk `useState` for data som oppdateres hvert frame — bruk `useRef` + `useFrame`
- Ikke lag nye objekter, arrays eller vektorer inne i `useFrame` — gjenbruk med `useMemo` eller refs
- Bruk instancing (`<Instances>`) når mange like objekter rendres (zombier, trær, kuler)
- Vær bevisst på React re-renders — Zustand selectors skal være spesifikke, ikke hente hele store

### Ikke bryt eksisterende funksjonalitet
- Etter endringer: verifiser at spilleren kan bevege seg, zombier spawner, kamp fungerer — ikke bare den nye featuren
- Hvis en endring påvirker flere systemer, test alle berørte systemer
- Når i tvil, kjør appen og gjør en rask gjennomgang av kjernefunksjonalitet

### Feilhåndtering i R3F
- Hvis én komponent krasjer i R3F, dør hele canvas og spillet er borte
- Bruk `<ErrorBoundary>` rundt nye/eksperimentelle komponenter
- Vær defensiv med asset-lasting — sjekk at GLB/lyd/teksturer finnes, og ha fallback

### Zustand som single source of truth
- Sjekk alltid eksisterende stores (`useGameStore`, `usePlayerStore`) før du oppretter ny state
- Ikke dupliser state mellom stores eller mellom store og komponent-state
- I game loops og `useFrame`: bruk `useXxxStore.getState()`, ikke hooks

### Git
- Commit etter hver fungerende feature eller fix — ikke samle opp store endringer
- Beskrivende commit-meldinger som forklarer hva og hvorfor

## Prosjektkontekst
- GTA-lignende 3D zombie-spill satt i Larkollen, Norge
- Kjører i nettleseren
- React Three Fiber + Rapier fysikk + Zustand state
- Ekte kartdata fra OpenStreetMap og Kartverket
