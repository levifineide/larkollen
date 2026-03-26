# Fase 9B: Ekte assets – Lyd, musikk og 3D-karakterer med animasjoner

## Kontekst
Dette er et GTA-lignende zombie-spill i nettleseren bygget med React Three Fiber + Rapier + Zustand + howler.js. Prosjektet ligger i `/Users/leviaugustfineide/projects/larkollen`. Vi har nettopp implementert Fase 9A (intro, spillflyt, AudioSystem-arkitektur, victory screen), men alle lyder og karaktermodeller er placeholders (synth-toner og capsule-geometri). Nå skal vi fylle inn ekte assets.

---

## DEL 1: Lyd og musikk

### Hva finnes nå
- `src/systems/AudioSystem.jsx` bruker howler.js med genererte synth-toner via OfflineAudioContext
- AudioManager-klasse med sounds: `gunshot`, `zombieGroan`, `reload`, `hit`, `pickup` + `music` (loop)
- Dynamisk musikk-intensitet (calm/tense/intense basert på zombie-tetthet)
- Events lyttes på: `zombie-killed`, `weapon-reload`, `weapon-pickup`

### Hva som trengs — Last ned og integrer ekte lydfiler

**Opprett mappe:** `public/sounds/`

**Lydeffekter (SFX) — bruk Freesound.org (CC0/CC-BY):**
Søk på Freesound.org og last ned EKTE lydfiler. Konverter til .mp3 (liten størrelse for web):

| Lyd | Freesound-søkeord | Filnavn | Bruk |
|-----|-------------------|---------|------|
| Pistolskudd | "pistol shot" "gunshot single" | `gunshot_pistol.mp3` | CombatSystem – avfyring |
| Hagle | "shotgun blast" | `gunshot_shotgun.mp3` | CombatSystem – hagle |
| Rifle/auto | "rifle burst" "automatic fire" | `gunshot_rifle.mp3` | CombatSystem – rifle/AK |
| Reload | "gun reload magazine" | `reload.mp3` | weapon-reload event |
| Tom magasin klikk | "gun empty click" | `empty_click.mp3` | Skyt med tomt magasin |
| Zombie stønn | "zombie groan moan" | `zombie_groan.mp3` | Zombie nær spiller |
| Zombie død | "creature death grunt" | `zombie_death.mp3` | zombie-killed event |
| Zombie angrep | "monster attack bite" | `zombie_attack.mp3` | Zombie treffer spiller |
| Treff på zombie | "flesh hit impact" | `hit_flesh.mp3` | Kule treffer zombie |
| Spiller skadet | "male pain grunt" | `player_hurt.mp3` | Helse reduseres |
| Pickup/plukk opp | "item pickup game" | `pickup.mp3` | weapon-pickup event |
| Fottrinn gress | "footsteps grass walking" | `footsteps_grass.mp3` | Loop under bevegelse |
| Fottrinn asfalt | "footsteps concrete" | `footsteps_road.mp3` | Loop på veier |
| Vind ambient | "wind outdoor ambient" | `wind_ambient.mp3` | Alltid i bakgrunn |
| Regn | "rain heavy outdoor" | `rain_loop.mp3` | Når weather != 'none' |
| Eksplosjon | "explosion grenade" | `explosion.mp3` | Granat/molotov |
| Bilmotor | "car engine idle loop" | `engine_car.mp3` | Kjøring (pitch via playbackRate) |
| Vannplask | "water splash wade" | `water_splash.mp3` | Spiller entrer vann |

**Musikk — bruk Pixabay Music (gratis, royalty-free, ingen konto):**
Søk på pixabay.com/music/ og last ned:

| Musikk | Søkeord | Filnavn | Når |
|--------|---------|---------|-----|
| Rolig ambient | "dark ambient horror calm" | `music_calm.mp3` | Få/ingen zombier |
| Spent/tense | "suspense tension horror" | `music_tense.mp3` | 5-10 zombier nær |
| Intens kamp | "action combat intense dark" | `music_intense.mp3` | 10+ zombier / kamp |
| Intro-musikk | "cinematic post apocalyptic" | `music_intro.mp3` | Dag En-introen |
| Victory | "victory orchestral triumph" | `music_victory.mp3` | Seiersskjermen |

### Implementering
Skriv om `AudioSystem.jsx`:
- Fjern ALL synth-generering (createToneBlob, audioBufferToWav)
- Last lyder fra `public/sounds/*.mp3` via Howl({ src: ['/sounds/gunshot_pistol.mp3'] })
- Legg til per-våpen lyd (sjekk `activeWeapon` i usePlayerStore for å velge riktig skuddlyd)
- Legg til ambient-lyder (vind alltid, regn når weather != 'none')
- Legg til fottrinn-loop (aktiver når spiller beveger seg, stopp når stille)
- Dynamisk musikkbytte: crossfade mellom calm/tense/intense basert på zombieCount
- Bruk `Howl.volume()` for å ducke musikk under intense SFX

---

## DEL 2: 3D-karakterer fra Mixamo

### Hva finnes nå
- `src/entities/Player/PlayerMesh.jsx` — grå capsule (0.3 radius, 1.0 høyde)
- `src/entities/Zombie/ZombieMesh.jsx` — grønn capsule (0.3 radius, 0.8 høyde)
- `src/entities/Player/RemotePlayer.jsx` — farget capsule for nettverksspillere
- Ingen `public/models/` mappe eksisterer

### Hva som trengs — Last ned fra Mixamo (mixamo.com, gratis Adobe-konto)

**Opprett mappe:** `public/models/`

#### Spiller-karakter
1. Gå til mixamo.com → Characters → Velg "Y Bot" eller "X Bot" (nøytral sci-fi-karakter)
2. Last ned med HVER av disse animasjonene (Format: FBX Binary, Skin: With Skin, 30 fps):

| Animasjon | Mixamo-søk | Filnavn etter konvertering |
|-----------|------------|---------------------------|
| Idle | "Idle" (breathing idle) | Inkludert i `player.glb` |
| Walk | "Walking" | Inkludert i `player.glb` |
| Run | "Running" (standard) | Inkludert i `player.glb` |
| Sprint | "Fast Run" | Inkludert i `player.glb` |
| Jump | "Jump" | Inkludert i `player.glb` |
| Crouch idle | "Crouch Idle" | Inkludert i `player.glb` |
| Crouch walk | "Crouch Walk" | Inkludert i `player.glb` |
| Shoot pistol | "Pistol Shooting" eller "Firing Rifle" | Inkludert i `player.glb` |
| Reload | "Reloading" | Inkludert i `player.glb` |
| Death | "Dying" | Inkludert i `player.glb` |
| Swim | "Swimming" (treading water) | Inkludert i `player.glb` |

3. Konverter alle FBX → én GLB med alle animasjoner. Bruk enten:
   - Online: gltf.pmnd.rs (dra inn FBX, eksporter GLB)
   - CLI: `npx gltfjsx` eller `npx @gltf-transform/cli merge`
4. Resultat: `public/models/player.glb` (~2-5 MB)

#### Zombie-karakter
1. Mixamo → Characters → Velg "Zombie" eller "Mutant" (gratis)
2. Animasjoner:

| Animasjon | Mixamo-søk |
|-----------|------------|
| Zombie walk | "Zombie Walking" |
| Zombie attack | "Zombie Attack" / "Zombie Biting" |
| Zombie idle | "Zombie Idle" |
| Zombie death | "Zombie Dying" |

3. Konverter til: `public/models/zombie.glb`

### Implementering — PlayerMesh.jsx
```jsx
import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, useAnimations } from '@react-three/drei'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { inputState } from '../../systems/InputSystem'

// Preload
useGLTF.preload('/models/player.glb')

export default function PlayerMesh() {
  const group = useRef()
  const { scene, animations } = useGLTF('/models/player.glb')
  const { actions, mixer } = useAnimations(animations, group)
  const currentAction = useRef('Idle')

  useFrame(() => {
    const { isDriving, isReloading, health } = usePlayerStore.getState()

    if (health <= 0) {
      switchAnim('Death')
      return
    }
    if (isDriving) return // skjul mesh eller sett i kjøretøy
    if (isReloading) {
      switchAnim('Reload')
      return
    }

    // Bestem animasjon fra input-state
    const moving = inputState.forward || inputState.backward ||
                   inputState.left || inputState.right
    const sprinting = inputState.sprint && moving
    const crouching = inputState.crouch

    let target = 'Idle'
    if (crouching && moving) target = 'CrouchWalk'
    else if (crouching) target = 'CrouchIdle'
    else if (sprinting) target = 'Sprint'
    else if (moving) target = 'Run'

    switchAnim(target)
  })

  function switchAnim(name) {
    if (currentAction.current === name) return
    const prev = actions[currentAction.current]
    const next = actions[name]
    if (!next) return
    prev?.fadeOut(0.2)
    next.reset().fadeIn(0.2).play()
    currentAction.current = name
  }

  return (
    <group ref={group} scale={[0.01, 0.01, 0.01]}> {/* Mixamo er i cm */}
      <primitive object={scene} castShadow />
    </group>
  )
}
```

### Implementering — ZombieMesh.jsx
Samme mønster med useGLTF + useAnimations. Animasjoner styres av `entity.animState` ('idle' | 'walking' | 'attacking' | 'dead'). ZombieEntity.jsx (Yuka) setter `animState` basert på AI-tilstand.

### Implementering — RemotePlayer.jsx
Oppdater til å bruke samme player.glb. Synk animasjon via nettverk (send `animState` i player-update).

---

## DEL 3: Viktige tekniske detaljer

### Filstruktur etter endringene
```
public/
  models/
    player.glb        (~3 MB, Y Bot + 11 animasjoner)
    zombie.glb         (~2 MB, Zombie + 4 animasjoner)
  sounds/
    gunshot_pistol.mp3
    gunshot_shotgun.mp3
    gunshot_rifle.mp3
    reload.mp3
    empty_click.mp3
    zombie_groan.mp3
    zombie_death.mp3
    zombie_attack.mp3
    hit_flesh.mp3
    player_hurt.mp3
    pickup.mp3
    footsteps_grass.mp3
    footsteps_road.mp3
    wind_ambient.mp3
    rain_loop.mp3
    explosion.mp3
    engine_car.mp3
    water_splash.mp3
    music_calm.mp3
    music_tense.mp3
    music_intense.mp3
    music_intro.mp3
    music_victory.mp3
```

### Filer som skal endres
- `src/systems/AudioSystem.jsx` — Fjern synth, bruk ekte filer
- `src/entities/Player/PlayerMesh.jsx` — GLB + animasjoner
- `src/entities/Zombie/ZombieMesh.jsx` — GLB + animasjoner
- `src/entities/Zombie/ZombieEntity.jsx` — Legg til `animState` property
- `src/entities/Zombie/ZombieInstance.jsx` — Pass `animState` til mesh
- `src/entities/Player/RemotePlayer.jsx` — GLB + netverkssynkronisert animasjon
- `src/ui/IntroSequence.jsx` — Spill music_intro.mp3 under intro
- `src/ui/VictoryScreen.jsx` — Spill music_victory.mp3

### Viktig: Mixamo GLB-skalering
Mixamo-modeller er i centimeter (1 enhet = 1 cm). Three.js bruker meter. Skaler med `scale={[0.01, 0.01, 0.01]}` eller bruk gltf-transform for å skalere GLB-en permanent.

### Viktig: Collider-størrelse
Rapier-kapslene (0.3 radius, 0.5 halfHeight) forblir uendret. Bare det visuelle meshet endres. Collider og mesh er separate.

### Viktig: Preloading
Bruk `useGLTF.preload('/models/player.glb')` øverst i modulen for å starte lasting tidlig. Suspense-grensen i GameApp fanger lasting og viser "Laster...".

### Eksisterende tech stack
- React 18 + Three.js 0.183 + R3F 8.18 + Rapier 1.5 + drei 9.122
- Zustand 5 + howler (nettopp installert) + Yuka 0.7
- Socket.io for multiplayer
- Vite 5 for bygging

### VIKTIG: Nedlasting
Du MÅ faktisk laste ned filene. Bruk `curl` eller `wget` for å hente fra Freesound API / Pixabay / Mixamo. Ikke generer placeholders. Hvis du ikke kan laste ned direkte, gi meg eksakte URLer jeg kan klikke på, med instruksjoner for filnavn og plassering.
