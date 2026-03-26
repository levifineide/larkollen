import VehicleController from './VehicleController'
import { getTerrainHeight, SEA_LEVEL } from '../../world/terrainHeight'

// Startposisjoner:
//  - Bil:      20m øst for Støtvig Hotel (origin). Øst = positiv X.
//  - Lastebil: litt lenger sør
//  - Båt:      i bukta (worldZ ≈ -165), på vannoverflaten
const VEHICLES = [
  { id: 'car',   type: 'car',   startPos: [20,   getTerrainHeight(20, 0) + 2,       0]  },
  { id: 'truck', type: 'truck', startPos: [30,   getTerrainHeight(30, 15) + 2,    15]  },
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
