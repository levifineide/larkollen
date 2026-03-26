# Plan: Vannsystem for Larkollen Zombie Apocalypse

## Problemstilling

Vannet er ikke synlig i spillet til tross for at `Water.jsx` finnes og rendres. Spilleren går på bakken der det burde være fjord. Vannet må fungere som et gameplay-system (svømming, drukning), ikke bare en visuell overflate.

---

## Del 1: Gjør vannet synlig

### Problem
Terrenget (GLB) dekker vannet. Mapbox-høydedata har havnivå normalisert til Y=0, men terreng-vertices i sjøområder blir ikke senket under vannflaten fordi `isWaterZone()` ikke dekker kystlinjen korrekt.

### Løsning

**Steg 1.1 — Bak vannsonene inn i terrain.glb (build-pipeline)**

Nåværende tilnærming forsøker å senke terreng-vertices på klientsiden i `Terrain.jsx`, men dette er upålitelig fordi GLB-vertexene allerede er bakt. Flytt vannsonehåndtering til `scripts/build-map.mjs` slik at terrain.glb allerede har senket vertices:

I `buildTerrain()` i `build-map.mjs`, etter at alle vertices er plassert med høydedata:
```javascript
// For hvert vertex: sjekk om det er i et vannområde
// Bruk en kombinasjon av:
// 1. Lav høyde (< 0.5m etter normalisering)
// 2. Eksplisitt vannpolygon-sjekk fra OSM coastline-data
// Hvis ja → sett vertex.y = SEA_FLOOR (-4.0)
```

Bruk OSM coastline-polygonene (110 features i dataen, inkludert "Kollen", "Eldøya", etc.) til å lage en polygon-basert sjekk: er et punkt UTENFOR kystlinjen? Biblioteket `@turf/turf` (allerede installert) har `booleanPointInPolygon()` for dette.

**Steg 1.2 — Bruk coastline-data fra OSM for presis kystlinje**

OSM-dataen inneholder 110 water/coastline-features. De viktigste:
- Coastline "Kollen": X -1248 til -707, Z -799 til -1 (vestkyst nord for hotel)
- Coastline "Eldøya": X -1546 til -471, Z 1 til 1136 (øy sørvest)
- Diverse småøyer og kystlinjesegmenter

Slå sammen alle coastline-segmenter til en "land-polygon" med Turf.js. Alt utenfor = hav.

**Steg 1.3 — Fjern terreng-trimesh-kollisjon i vannområder**

Nåværende terreng har kun en flat `CuboidCollider` på Y=-5. For vannområder trenger vi:
- Fjern/senk kollisjon slik at spilleren synker ned til vannivå
- Legg til en egen usynlig kollisjon-plane på `SEA_LEVEL` (Y=0) som kun aktiveres for svømming

**Steg 1.4 — Øk kontrast mellom vann og terreng**

Water.jsx bruker opacity 0.78 med farge `#1a6b8a`. Vurder:
- Øk opacity til 0.85-0.90
- Legg til `depthWrite: false` for riktig blending
- Sett `renderOrder: 1` for å sikre at vann rendres over terreng

### Filer som endres
- `scripts/build-map.mjs` — Bak vannområder inn i terreng-GLB
- `src/world/terrainHeight.js` — Oppdater `isWaterZone()` med OSM-polygondata
- `src/world/Terrain.jsx` — Fjern klient-side vertex-modifikasjon (bakes i pipeline)
- `src/world/Water.jsx` — Juster material-egenskaper for synlighet

---

## Del 2: Vannsone-deteksjon (gameplay)

### Mål
Spillet må til enhver tid vite: "Er spilleren i vann?" og "Hvor dypt?"

### Løsning

**Steg 2.1 — Legg til vanntilstand i player store**

I `src/stores/usePlayerStore.js`:
```javascript
isInWater: false,
isSwimming: false,    // true når spilleren er dypt nok til å svømme
waterDepth: 0,        // meter under vannflaten
setWaterState: (inWater, swimming, depth) =>
  set({ isInWater: inWater, isSwimming: swimming, waterDepth: depth }),
```

**Steg 2.2 — Vanndeteksjonslogikk i PlayerPhysics**

I `src/entities/Player/PlayerPhysics.jsx`, i `useFrame`-loopen:
```javascript
// Etter posisjon er beregnet:
const playerFeetY = pos.y - CAPSULE_OFFSET
const inWaterZone = isWaterZone(pos.x, pos.z)
const waterDepth = inWaterZone ? Math.max(0, SEA_LEVEL - playerFeetY) : 0
const isInWater = waterDepth > 0.1       // føttene er i vannet
const isSwimming = waterDepth > 1.2      // dypt nok til å svømme

usePlayerStore.getState().setWaterState(isInWater, isSwimming, waterDepth)
```

### Filer som endres
- `src/stores/usePlayerStore.js` — Ny vanntilstand
- `src/entities/Player/PlayerPhysics.jsx` — Vanndeteksjonslogikk

---

## Del 3: Svømmefysikk

### Mål
Spilleren skal bevege seg annerledes i vann: tregere, med oppdrift, ingen hopping.

### Nåværende bevegelses-system (referanse)
- Bevegelseskonstanter i `PlayerPhysics.jsx` (linje 13-22):
  - `WALK_SPEED = 4.5`, `SPRINT_SPEED = 9.0`, `CROUCH_SPEED = 2.0`
  - `JUMP_FORCE = 8.0`, `GRAVITY = 22`
- Spilleren bruker Rapier `CharacterController` med `kinematicPosition`
- Bakke-deteksjon: `ctrl.computedGrounded()` + terreng-høyde-sjekk
- Vertikal hastighet styres manuelt med `vertVel` ref

### Nye svømmekonstanter
```javascript
const SWIM_SPEED     = 2.5   // m/s – tregere enn gange
const SWIM_SPRINT    = 4.0   // m/s – raskere svømming
const SWIM_VERTICAL  = 2.0   // m/s – opp/ned i vannet
const BUOYANCY       = 5.0   // m/s² – kraft som dytter spilleren opp
const WATER_DRAG     = 3.0   // demping av vertikal bevegelse
const SWIM_STAMINA_DRAIN = 8 // per sekund (kontinuerlig)
const SWIM_SPRINT_DRAIN  = 25 // per sekund (sprint-svømming)
```

### Svømmelogikk (i PlayerPhysics.jsx useFrame)

```
HVIS isSwimming:
  1. Ignorer normal gravitasjon
  2. Bruk oppdrift: vertikal kraft oppover mot SEA_LEVEL
     vertVel += (BUOYANCY - WATER_DRAG * vertVel) * delta
  3. Begrens oppdrift: spilleren flyter ved SEA_LEVEL, synker ikke over
     HVIS pos.y > SEA_LEVEL - 0.3: vertVel = min(vertVel, 0)
  4. Jump-knapp = svøm oppover (mot overflaten)
  5. Crouch-knapp = dykk nedover
  6. Hastighet = SWIM_SPEED (eller SWIM_SPRINT med shift)
  7. Ingen hopping på overflaten

HVIS isInWater MEN IKKE isSwimming (vading):
  1. Normal bevegelse men tregere (70% hastighet)
  2. Sprut-partikkeleffekt
  3. Ingen gravitasjonsendring
```

### Overgang land → vann
- Gradvis hastighetsreduksjon basert på `waterDepth`
- Når `waterDepth > 1.2m`: bytt til svømmemodus
- Når `waterDepth < 0.8m`: bytt tilbake til gange (hysterese for å unngå flimring)

### Filer som endres
- `src/entities/Player/PlayerPhysics.jsx` — Svømmefysikk

---

## Del 4: Drukning

### Mål
Spilleren taper helse hvis de er under vann for lenge uten stamina.

### Mekanikk
```
HVIS isSwimming:
  - Stamina synker med SWIM_STAMINA_DRAIN per sekund (8/s)
  - Med sprint: SWIM_SPRINT_DRAIN per sekund (25/s)

HVIS isSwimming OG stamina <= 0:
  - Spilleren synker sakte (negativ oppdrift)
  - Helse synker med 10 HP/sekund
  - Visuell effekt: skjerm-fade til blått

HVIS spilleren drukner (helse = 0):
  - Vanlig game-over
```

### Filer som endres
- `src/entities/Player/PlayerPhysics.jsx` — Drukning/stamina-logikk
- `src/ui/HUD.jsx` — Visuell indikator for oksygen/drukning (valgfritt)

---

## Del 5: Visuell feedback

### Undervannssyn
Når kameraet er under `SEA_LEVEL`:
- Blågrønn fargetone (post-processing)
- Redusert siktavstand (tettere tåke)
- Partikler (bobler)

### Vannlinje-effekt
Når spilleren er delvis i vann:
- Sprut ved bevegelse
- Våt-effekt på skjermen etter å ha kommet opp

### HUD-endringer
- Vis en oksygen/luft-bar når spilleren er under vann
- Blink rød når drukning starter

### Filer som endres
- `src/systems/DayNightCycle.jsx` — Undervannståke
- `src/ui/HUD.jsx` — Oksygenbar
- `src/world/Water.jsx` — Eventuelt post-processing

---

## Implementeringsrekkefølge

| Steg | Beskrivelse | Prioritet | Kompleksitet |
|------|-------------|-----------|--------------|
| 1.1  | Bak vannområder inn i terrain.glb | KRITISK | Middels |
| 1.2  | Bruk OSM coastline for presis kystlinje | KRITISK | Middels |
| 1.3  | Fjern terrengkollisjon i vannområder | KRITISK | Enkel |
| 1.4  | Juster vannmaterial for synlighet | KRITISK | Enkel |
| 2.1  | Vanntilstand i player store | HØY | Enkel |
| 2.2  | Vanndeteksjonslogikk | HØY | Enkel |
| 3    | Svømmefysikk | HØY | Middels-høy |
| 4    | Drukning | MIDDELS | Enkel |
| 5    | Visuell feedback | LAV | Middels |

**Start med steg 1.1–1.4 (gjør vannet synlig), deretter 2.1–2.2 + 3 (svømming).**

---

## Nøkkelfiler og linjenummer

| Fil | Hva | Viktige linjer |
|-----|-----|----------------|
| `scripts/build-map.mjs` | Terreng-GLB generering | L299-420 (buildTerrain), L430-549 (buildBuildings) |
| `src/world/terrainHeight.js` | SEA_LEVEL, isWaterZone, heightmap | L10-12 (konstanter), L18-36 (isWaterZone), L167-209 (getTerrainHeight) |
| `src/world/Terrain.jsx` | Terreng-rendering + kollisjon | L56-109 (GLBTerrain), L80 (vannsjekk) |
| `src/world/Water.jsx` | Vannflate + Gerstner-bølger | L23-154 (komponent), L161-170 (sampleWaterHeight) |
| `src/world/LarkollenWorld.jsx` | World-oppsett | L80 (Water inkludert) |
| `src/entities/Player/PlayerPhysics.jsx` | Spillerbevegelse | L13-22 (konstanter), L94-117 (bakke), L137-145 (hastighet), L162-181 (gravitasjon) |
| `src/stores/usePlayerStore.js` | Spillertilstand | L3-11 (state), L28-30 (setters) |
| `src/core/GameApp.jsx` | Fysikk-oppsett | L169 (gravity -9.81) |

---

## Tekniske notater

- **Rapier-fysikk**: Spilleren bruker `kinematicPosition` RigidBody med `CharacterController`. Svømmefysikk må implementeres manuelt i `useFrame` (ikke via Rapier forces).
- **sampleWaterHeight()** i `Water.jsx` linje 161-170 gir CPU-side vannhøyde med bølger — bruk denne for presis deteksjon.
- **@turf/turf** er allerede installert — bruk `booleanPointInPolygon` for coastline-sjekk.
- **Stamina-systemet** eksisterer allerede (drain/regen i PlayerPhysics) men brukes kun for sprint. Utvid til svømming.
- **Kart-koordinater**: Origo = Støtvig Hotel (59.3289°N, 10.6682°E). Oslofjorden er VEST (negativ X). Positiv Z = sør.
