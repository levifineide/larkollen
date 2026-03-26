// Delt terrenghøyde-funksjon – brukes av Terrain.jsx og spawn-logikk.
//
// Når GLB-terreng er aktivt bygges en heightmap-cache fra vertex-data.
// Oppslag skjer via rask bilineær interpolasjon i cachen – ingen raycasts.
// Ellers faller den tilbake til prosedyrelt terreng.

import * as THREE from 'three'

// Sjønivå-konstanter
export const SEA_LEVEL = 0.0        // vannflatens Y-posisjon
export const SEA_THRESHOLD = 0.3    // terreng under dette → garantert hav
export const SEA_FLOOR = -4.0       // havbunn-Y (godt under vannflaten)

// ─── Kjente vannområder (game-koordinater) ────────────────────────
// Definert basert på kartdata – brukes for å tvinge terreng under vann

/** Sjekk om et punkt i game-verden er i et vannområde.
 *  Bruker heightmap-cachen fra GLB-terrenget: vannområder er bakt inn som SEA_FLOOR.
 *  Fallback til hardkodede soner når heightmap ikke er lastet.
 */
export function isWaterZone(gameX, gameZ) {
  // Bruk heightmap-cache når tilgjengelig (vannområder er bakt inn i GLB)
  if (_heightmap) {
    const fx = (gameX - _hmMinX) / _hmCellW
    const fz = (gameZ - _hmMinZ) / _hmCellH
    const ix = Math.round(fx)
    const iz = Math.round(fz)
    if (ix >= 0 && ix < _hmResX && iz >= 0 && iz < _hmResZ) {
      return _heightmap[iz * _hmResX + ix] < SEA_THRESHOLD
    }
  }

  // Hardkodet fallback (prosedyrell modus)
  if (gameX < -500) return true
  if (gameZ > 2500) return true
  if (gameZ < -3000) return true
  if (gameX < -200 && gameZ > -500 && gameZ < 500) return true

  return false
}

let _terrainMesh = null
let _expectingGLB = false

// Heightmap-cache
let _heightmap = null   // Float32Array
let _hmResX = 0         // antall celler i X
let _hmResZ = 0         // antall celler i Z
let _hmMinX = 0
let _hmMinZ = 0
let _hmMaxX = 0
let _hmMaxZ = 0
let _hmCellW = 0        // cellebredde i world-units
let _hmCellH = 0        // cellehøyde i world-units

const HEIGHTMAP_RES = 512 // grid-oppløsning (512×512 = 262K oppslag)

/** Bygg heightmap fra vertex-data – mye raskere enn raycasts */
function _buildHeightmapFromVertices(mesh) {
  const box = new THREE.Box3().setFromObject(mesh)
  _hmMinX = box.min.x
  _hmMinZ = box.min.z
  _hmMaxX = box.max.x
  _hmMaxZ = box.max.z

  _hmResX = HEIGHTMAP_RES
  _hmResZ = HEIGHTMAP_RES
  _hmCellW = (_hmMaxX - _hmMinX) / (_hmResX - 1)
  _hmCellH = (_hmMaxZ - _hmMinZ) / (_hmResZ - 1)

  const hm = new Float32Array(_hmResX * _hmResZ)

  // Samle alle vertices fra alle meshes i scenen
  const _pos = new THREE.Vector3()
  mesh.traverse(child => {
    if (!child.isMesh || !child.geometry) return
    const geo = child.geometry
    const posAttr = geo.attributes.position
    if (!posAttr) return

    // Hent world-transform for denne meshen
    child.updateWorldMatrix(true, false)
    const mat = child.matrixWorld

    for (let i = 0; i < posAttr.count; i++) {
      _pos.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i))
      _pos.applyMatrix4(mat)

      // Map vertex til heightmap-grid
      const fx = (_pos.x - _hmMinX) / _hmCellW
      const fz = (_pos.z - _hmMinZ) / _hmCellH

      const ix = Math.round(fx)
      const iz = Math.round(fz)
      if (ix < 0 || ix >= _hmResX || iz < 0 || iz >= _hmResZ) continue

      const idx = iz * _hmResX + ix
      // Behold høyeste Y-verdi for denne cellen
      if (_pos.y > hm[idx]) {
        hm[idx] = _pos.y
      }
    }
  })

  // Fyll hull (celler uten vertices) med interpolasjon fra naboer
  _fillGaps(hm, _hmResX, _hmResZ)

  // Senk vannområder under vannflaten
  let seaCells = 0
  for (let iz = 0; iz < _hmResZ; iz++) {
    for (let ix = 0; ix < _hmResX; ix++) {
      const idx = iz * _hmResX + ix
      const worldX = _hmMinX + ix * _hmCellW
      const worldZ = _hmMinZ + iz * _hmCellH

      // Sjekk om dette er et vannområde (enten lav høyde eller kjent vannsone)
      if (hm[idx] < SEA_THRESHOLD || isWaterZone(worldX, worldZ)) {
        hm[idx] = SEA_FLOOR
        seaCells++
      }
    }
  }

  _heightmap = hm
  console.log(`[Terreng] Heightmap-cache bygd fra vertices: ${_hmResX}x${_hmResZ} (${(_hmMaxX - _hmMinX).toFixed(0)}x${(_hmMaxZ - _hmMinZ).toFixed(0)}m), ${seaCells} sjø-celler`)
}

/** Fyll tomme celler med gjennomsnitt av naboer */
function _fillGaps(hm, resX, resZ) {
  for (let pass = 0; pass < 3; pass++) {
    for (let iz = 0; iz < resZ; iz++) {
      for (let ix = 0; ix < resX; ix++) {
        const idx = iz * resX + ix
        if (hm[idx] !== 0) continue

        let sum = 0, count = 0
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dz === 0) continue
            const nx = ix + dx, nz = iz + dz
            if (nx < 0 || nx >= resX || nz < 0 || nz >= resZ) continue
            const nv = hm[nz * resX + nx]
            if (nv !== 0) { sum += nv; count++ }
          }
        }
        if (count > 0) hm[idx] = sum / count
      }
    }
  }
}

/** Registrer terreng-mesh og bygg heightmap-cache */
export function setTerrainMesh(mesh) {
  _terrainMesh = mesh
  _heightmap = null
  if (mesh) {
    mesh.updateMatrixWorld(true)
    mesh.traverse(child => {
      if (child.isMesh) {
        if (child.material) child.material.side = THREE.DoubleSide
      }
    })
    _buildHeightmapFromVertices(mesh)
  }
}

/** Signaliser at GLB-terreng forventes (satt fra LarkollenWorld) */
export function setExpectingGLBTerrain(expecting) {
  _expectingGLB = expecting
}

/** Returnerer true hvis høydedata er klart (enten prosedyrell modus eller GLB lastet) */
export function isTerrainReady() {
  return !_expectingGLB || _terrainMesh !== null
}

export function getTerrainHeight(worldX, worldZ) {
  // Rask bilineær oppslag i heightmap-cache
  if (_heightmap) {
    // Clamp til grid-grenser
    const fx = (worldX - _hmMinX) / _hmCellW
    const fz = (worldZ - _hmMinZ) / _hmCellH

    const ix0 = Math.max(0, Math.min(_hmResX - 2, Math.floor(fx)))
    const iz0 = Math.max(0, Math.min(_hmResZ - 2, Math.floor(fz)))
    const ix1 = ix0 + 1
    const iz1 = iz0 + 1

    const tx = Math.max(0, Math.min(1, fx - ix0))
    const tz = Math.max(0, Math.min(1, fz - iz0))

    const h00 = _heightmap[iz0 * _hmResX + ix0]
    const h10 = _heightmap[iz0 * _hmResX + ix1]
    const h01 = _heightmap[iz1 * _hmResX + ix0]
    const h11 = _heightmap[iz1 * _hmResX + ix1]

    return h00 * (1 - tx) * (1 - tz) +
           h10 * tx * (1 - tz) +
           h01 * (1 - tx) * tz +
           h11 * tx * tz
  }

  // Prosedyrell fallback
  const x = worldX
  const z = -worldZ // PlaneGeometry localY = -worldZ etter rotasjon

  // Sjekk kjente vannområder først
  if (isWaterZone(worldX, worldZ)) return SEA_FLOOR

  const hills =
    Math.sin(x * 0.002) * Math.cos(z * 0.003) * 8 +
    Math.sin(x * 0.005 + 1.3) * Math.cos(z * 0.007 + 0.7) * 4 +
    Math.sin(x * 0.013 + 2.1) * Math.cos(z * 0.011 + 1.2) * 2

  const coastFade = Math.max(0, Math.min(1, (z + 2000) / 2500))
  let h = 2.0 + hills * coastFade

  return Math.max(SEA_FLOOR, h)
}
