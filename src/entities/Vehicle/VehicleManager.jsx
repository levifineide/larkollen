import { useMemo } from 'react'
import VehicleController from './VehicleController'
import { getTerrainHeight, SEA_LEVEL, isWaterZone } from '../../world/terrainHeight'

// Bilmodeller vi har tilgjengelig
const CAR_MODELS = ['car', 'suv', 'police', 'taxi']

// Seed-basert pseudo-random for konsistente posisjoner
function seededRandom(seed) {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

// Generer bilposisjoner rundt kartet
function generateVehicleSpawns() {
  const rng = seededRandom(42)
  const vehicles = []

  // 1) Alltid en bil 20m øst for Støtvig Hotel (origin)
  vehicles.push({
    id: 'car-hotel',
    type: 'car',
    model: 'car',
    startPos: [20, 0, 0],
  })

  // 2) En bil RETT foran spillerstart (spiller starter på [0, 2, 48])
  vehicles.push({
    id: 'car-front',
    type: 'car',
    model: 'taxi',
    startPos: [3, 0, 44],
  })

  // 3) Alltid en SUV nær spillerstart
  vehicles.push({
    id: 'suv-start',
    type: 'car',
    model: 'suv',
    startPos: [30, 0, 15],
  })

  // 3) Båten i bukta
  vehicles.push({
    id: 'boat-0',
    type: 'boat',
    model: null,
    startPos: [0, SEA_LEVEL + 0.1, -165],
  })

  // 4) Generer ekstra biler spredt rundt bebyggelsen
  // Mer tetthet nær spillerstart (0, 48) og hotell (0, 0)
  const spawnZones = [
    // Tett rundt spillerstart/hotell – mange biler
    { cx: 0, cz: 30, radius: 40, count: 5 },
    // Nær sentrum (origin ± 100m)
    { cx: 0, cz: 0, radius: 100, count: 4 },
    // Langs kysten nordover
    { cx: -50, cz: -200, radius: 80, count: 3 },
    // Sørover mot Larkollen sentrum
    { cx: 50, cz: 200, radius: 120, count: 3 },
    // Østover innover
    { cx: 150, cz: 50, radius: 100, count: 3 },
    // Nord-vest
    { cx: -100, cz: -400, radius: 80, count: 2 },
  ]

  let carIndex = 0
  for (const zone of spawnZones) {
    for (let i = 0; i < zone.count; i++) {
      const angle = rng() * Math.PI * 2
      const dist = rng() * zone.radius
      const x = zone.cx + Math.cos(angle) * dist
      const z = zone.cz + Math.sin(angle) * dist

      // Sjekk at vi ikke er i vann
      if (isWaterZone(x, z)) continue

      const modelName = CAR_MODELS[carIndex % CAR_MODELS.length]
      vehicles.push({
        id: `car-${vehicles.length}`,
        type: 'car',
        model: modelName,
        startPos: [x, 0, z], // Y settes dynamisk
      })
      carIndex++
    }
  }

  return vehicles
}

const VEHICLE_SPAWNS = generateVehicleSpawns()

export default function VehicleManager() {
  // Start biler høyt oppe – de faller ned med gravitasjon og lander på terrenget.
  // Dette unngår problemer med terrenhøyde som ikke er lastet ennå.
  const vehicles = useMemo(() => {
    console.log(`[VehicleManager] Spawner ${VEHICLE_SPAWNS.length} kjøretøy`)
    return VEHICLE_SPAWNS.map(v => {
      if (v.type === 'boat') return v
      return {
        ...v,
        startPos: [v.startPos[0], 15, v.startPos[2]],
      }
    })
  }, [])

  return (
    <>
      {vehicles.map((v) => (
        <VehicleController
          key={v.id}
          id={v.id}
          type={v.type}
          model={v.model}
          startPos={v.startPos}
        />
      ))}
    </>
  )
}
