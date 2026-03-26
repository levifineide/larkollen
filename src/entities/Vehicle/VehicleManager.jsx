import VehicleController from './VehicleController'
import { getTerrainHeight, SEA_LEVEL } from '../../world/terrainHeight'

// Startposisjoner:
//  - Bil:      rett ved spillerstart (godt synlig)
//  - Lastebil: litt lenger unna
//  - Båt:      i bukta (worldZ ≈ -165), på vannoverflaten
const VEHICLES = [
  { id: 'car',   type: 'car',   startPos: [8,    getTerrainHeight(8, 5) + 2,       5]  },
  { id: 'truck', type: 'truck', startPos: [-10,  getTerrainHeight(-10, 15) + 2,   15]  },
  { id: 'boat',  type: 'boat',  startPos: [0,    SEA_LEVEL + 0.1,               -165] },
]

export default function VehicleManager() {
  return (
    <>
      {VEHICLES.map((v) => (
        <VehicleController key={v.id} id={v.id} type={v.type} startPos={v.startPos} />
      ))}
    </>
  )
}
