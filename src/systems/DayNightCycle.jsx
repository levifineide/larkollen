import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Sky } from '@react-three/drei'
import * as THREE from 'three'
import { useWorldStore } from '../stores/useWorldStore'

/**
 * DayNightCycle – Animerer sol, himmel, fog og ambient lys basert på timeOfDay.
 * Støtter storm-modus med lyn-glimt og mørkere himmel.
 */

const _sunDir = new THREE.Vector3()
const _fogColor = new THREE.Color()
const _stormFog = new THREE.Color('#3a3a4a')

const FOG_COLORS = [
  { t: 0.00, color: new THREE.Color('#0a0a1a') },
  { t: 0.20, color: new THREE.Color('#1a1a2e') },
  { t: 0.25, color: new THREE.Color('#e07040') },
  { t: 0.30, color: new THREE.Color('#c9d6df') },
  { t: 0.50, color: new THREE.Color('#c9d6df') },
  { t: 0.70, color: new THREE.Color('#c9d6df') },
  { t: 0.75, color: new THREE.Color('#d05030') },
  { t: 0.80, color: new THREE.Color('#1a1a2e') },
  { t: 1.00, color: new THREE.Color('#0a0a1a') },
]

function sampleGradient(gradient, t) {
  t = ((t % 1) + 1) % 1
  for (let i = 0; i < gradient.length - 1; i++) {
    const a = gradient[i], b = gradient[i + 1]
    if (t >= a.t && t <= b.t) {
      const f = (t - a.t) / (b.t - a.t)
      _fogColor.copy(a.color).lerp(b.color, f)
      return _fogColor
    }
  }
  return gradient[0].color
}

// Lyn-state
const lightning = {
  nextFlash: 0,
  flashIntensity: 0,
  flashDuration: 0,
  flashTimer: 0,
}

export default function DayNightCycle() {
  const dirLightRef = useRef()
  const ambientRef = useRef()
  const flashLightRef = useRef()
  const { scene } = useThree()

  useFrame((_, delta) => {
    const state = useWorldStore.getState()
    const { timeOfDay, weather } = state
    state.advanceTime(delta)

    const isStorm = weather === 'storm'
    const isRainy = weather === 'heavy' || isStorm
    const isDrizzle = weather === 'drizzle'
    const weatherDim = isStorm ? 0.35 : isRainy ? 0.55 : isDrizzle ? 0.8 : 1.0

    // Sol-vinkel
    const sunAngle = (timeOfDay - 0.25) * Math.PI * 2
    const elevation = Math.sin(sunAngle)
    const azimuth = Math.cos(sunAngle)

    _sunDir.set(azimuth * 80, Math.max(elevation * 80, -20), 30)

    if (dirLightRef.current) {
      dirLightRef.current.position.copy(_sunDir)
      const sunUp = Math.max(0, elevation)
      dirLightRef.current.intensity = THREE.MathUtils.lerp(0.1, 1.8, sunUp) * weatherDim

      const horizonFactor = 1 - Math.abs(elevation)
      dirLightRef.current.color.setRGB(
        1,
        THREE.MathUtils.lerp(0.95, 0.6, horizonFactor * 0.7),
        THREE.MathUtils.lerp(0.9, 0.3, horizonFactor * 0.7)
      )
    }

    if (ambientRef.current) {
      const sunUp = Math.max(0, elevation)
      ambientRef.current.intensity = THREE.MathUtils.lerp(0.08, 0.5, sunUp) * weatherDim
    }

    // Fog
    const fogCol = sampleGradient(FOG_COLORS, timeOfDay)
    if (scene.fog) {
      if (isStorm) {
        scene.fog.color.copy(_stormFog)
        scene.fog.near = 10
        scene.fog.far = 100
      } else if (isRainy) {
        scene.fog.color.lerpColors(fogCol, _stormFog, 0.4)
        scene.fog.near = 20
        scene.fog.far = 150
      } else {
        scene.fog.color.copy(fogCol)
        const sunUp = Math.max(0, elevation)
        scene.fog.near = THREE.MathUtils.lerp(20, 50, sunUp)
        scene.fog.far = THREE.MathUtils.lerp(120, 300, sunUp)
      }
    }

    // ── Lyn-glimt (kun storm) ──────────────────────────────────────────
    if (isStorm) {
      lightning.flashTimer -= delta
      if (lightning.flashTimer <= 0) {
        // Ny lyn-sekvens
        lightning.nextFlash -= delta
        if (lightning.nextFlash <= 0) {
          // Start et glimt
          lightning.flashIntensity = 2.0 + Math.random() * 4.0
          lightning.flashDuration = 0.05 + Math.random() * 0.1
          lightning.flashTimer = lightning.flashDuration
          // Neste lyn: 2–8 sekunder, av og til dobbelt-glimt
          lightning.nextFlash = Math.random() < 0.3 ? 0.1 + Math.random() * 0.2 : 2 + Math.random() * 6
        }
      }

      // Fade lyn-lys
      const flashFade = Math.max(0, lightning.flashTimer / lightning.flashDuration)
      const flashBrightness = lightning.flashIntensity * flashFade

      if (flashLightRef.current) {
        flashLightRef.current.intensity = flashBrightness
        flashLightRef.current.visible = flashBrightness > 0.01
      }
    } else {
      if (flashLightRef.current) {
        flashLightRef.current.intensity = 0
        flashLightRef.current.visible = false
      }
    }
  })

  // Sky-parametere
  const timeOfDay = useWorldStore(s => s.timeOfDay)
  const weather = useWorldStore(s => s.weather)
  const sunAngle = (timeOfDay - 0.25) * Math.PI * 2
  const elevation = Math.sin(sunAngle)
  const azimuth = Math.cos(sunAngle)
  const sunPosition = [azimuth * 100, Math.max(elevation * 100, -10), 30]

  const sunUp = Math.max(0, elevation)
  const isStorm = weather === 'storm'
  const isRainy = weather === 'heavy' || isStorm

  // Mørkere, mer turbid himmel under storm
  const turbidity = isStorm ? 40 : isRainy ? 25 : THREE.MathUtils.lerp(20, 2, sunUp)
  const rayleigh = isStorm ? 0.1 : isRainy ? 0.3 : THREE.MathUtils.lerp(0.5, 1.5, sunUp)
  const mieCoefficient = isStorm ? 0.5 : isRainy ? 0.2 : THREE.MathUtils.lerp(0.1, 0.005, sunUp)

  return (
    <>
      <Sky
        sunPosition={sunPosition}
        turbidity={turbidity}
        rayleigh={rayleigh}
        mieCoefficient={mieCoefficient}
        mieDirectionalG={0.8}
      />

      <ambientLight ref={ambientRef} intensity={0.7} />

      <directionalLight
        ref={dirLightRef}
        position={[50, 80, 30]}
        intensity={1.8}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.002}
        shadow-normalBias={0.05}
        shadow-camera-far={200}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
      />

      {/* Lyn-lys – kraftig punktlys som blinker ved storm */}
      <directionalLight
        ref={flashLightRef}
        position={[0, 100, 0]}
        intensity={0}
        color="#d0d8ff"
      />
    </>
  )
}
