/**
 * build-map.mjs
 * Prosesserer OSM-data (og valgfri GeoTIFF DTM) til .glb-filer for Larkollen-kartet.
 *
 * Produserer:
 *   public/map/terrain.glb   – Terrengmesh (fra DTM eller flat fallback)
 *   public/map/buildings.glb  – Ekstruderte bygninger fra OSM
 *   public/map/roads.glb      – Veimesh fra OSM
 *   public/map/water.glb      – Vannflate(r)
 *
 * Bruk:  node scripts/build-map.mjs [--dtm path/to/dtm.tif]
 *
 * Avhengigheter (devDeps): osmtogeojson, proj4, @turf/turf, geotiff,
 *   @gltf-transform/core, @gltf-transform/extensions, @gltf-transform/functions, three
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import proj4 from 'proj4'
import osmtogeojson from 'osmtogeojson'
import * as turf from '@turf/turf'
import { Document, NodeIO } from '@gltf-transform/core'
import { PNG } from 'pngjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'map')
const OSM_FILE = path.join(DATA_DIR, 'larkollen-osm.json')

// ─── Koordinatsystem ───────────────────────────────────────────────
// Origo: Larkollen kirke → lokal (0, 0)
const ORIGIN_LAT = 59.4022
const ORIGIN_LON = 10.8175

// UTM zone 32N
proj4.defs('EPSG:25832', '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs')
const toUTM = proj4('EPSG:4326', 'EPSG:25832')
const ORIGIN_UTM = toUTM.forward([ORIGIN_LON, ORIGIN_LAT]) // [easting, northing]

/** Konverter WGS84 lon/lat til lokal X/Z (meter, origo = Larkollen kirke) */
function toLocal(lon, lat) {
  const [e, n] = toUTM.forward([lon, lat])
  return [e - ORIGIN_UTM[0], n - ORIGIN_UTM[1]] // X = east, Z = -north (Three.js)
}

// ─── Kartdimensjoner ───────────────────────────────────────────────
const BBOX_S = 59.38, BBOX_N = 59.44, BBOX_W = 10.78, BBOX_E = 10.86
const [MAP_W_MIN] = toLocal(BBOX_W, ORIGIN_LAT)
const [MAP_W_MAX] = toLocal(BBOX_E, ORIGIN_LAT)
const [, MAP_N_MIN] = toLocal(ORIGIN_LON, BBOX_S)
const [, MAP_N_MAX] = toLocal(ORIGIN_LON, BBOX_N)
const MAP_WIDTH = MAP_W_MAX - MAP_W_MIN   // ~4400m east-west
const MAP_DEPTH = MAP_N_MAX - MAP_N_MIN   // ~6700m north-south

// ─── Hjelpefunksjoner ──────────────────────────────────────────────

/** Lag GLB-dokument med en mesh fra posisjon/normal/indeks-arrays */
function createGLBDocument(name, positions, normals, indices, color = [0.5, 0.5, 0.5]) {
  const doc = new Document()
  const buffer = doc.createBuffer()
  const scene = doc.createScene(name)

  const posAccessor = doc.createAccessor(`${name}_position`)
    .setType('VEC3')
    .setArray(new Float32Array(positions))
    .setBuffer(buffer)

  const normAccessor = doc.createAccessor(`${name}_normal`)
    .setType('VEC3')
    .setArray(new Float32Array(normals))
    .setBuffer(buffer)

  const idxAccessor = doc.createAccessor(`${name}_indices`)
    .setType('SCALAR')
    .setArray(positions.length / 3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices))
    .setBuffer(buffer)

  const material = doc.createMaterial(name)
    .setBaseColorFactor([...color, 1.0])
    .setRoughnessFactor(0.85)
    .setMetallicFactor(0.0)

  const prim = doc.createPrimitive()
    .setAttribute('POSITION', posAccessor)
    .setAttribute('NORMAL', normAccessor)
    .setIndices(idxAccessor)
    .setMaterial(material)

  const mesh = doc.createMesh(name).addPrimitive(prim)
  const node = doc.createNode(name).setMesh(mesh)
  scene.addChild(node)

  return doc
}

/** Lag GLB-dokument med flere meshes (for bygninger med ulike materialer) */
function createMultiMeshGLBDocument(name, meshDatas) {
  const doc = new Document()
  const buffer = doc.createBuffer()
  const scene = doc.createScene(name)

  for (const md of meshDatas) {
    const posAccessor = doc.createAccessor(`${md.name}_position`)
      .setType('VEC3')
      .setArray(new Float32Array(md.positions))
      .setBuffer(buffer)

    const normAccessor = doc.createAccessor(`${md.name}_normal`)
      .setType('VEC3')
      .setArray(new Float32Array(md.normals))
      .setBuffer(buffer)

    const idxAccessor = doc.createAccessor(`${md.name}_indices`)
      .setType('SCALAR')
      .setArray(md.positions.length / 3 > 65535 ? new Uint32Array(md.indices) : new Uint16Array(md.indices))
      .setBuffer(buffer)

    const material = doc.createMaterial(md.name)
      .setBaseColorFactor([...md.color, 1.0])
      .setRoughnessFactor(md.roughness ?? 0.85)
      .setMetallicFactor(md.metalness ?? 0.0)

    const prim = doc.createPrimitive()
      .setAttribute('POSITION', posAccessor)
      .setAttribute('NORMAL', normAccessor)
      .setIndices(idxAccessor)
      .setMaterial(material)

    const mesh = doc.createMesh(md.name).addPrimitive(prim)
    const node = doc.createNode(md.name).setMesh(mesh)
    scene.addChild(node)
  }

  return doc
}

async function writeGLB(doc, filename) {
  const io = new NodeIO()
  const outPath = path.join(OUTPUT_DIR, filename)
  await io.write(outPath, doc)
  const size = fs.statSync(outPath).size
  console.log(`  ✓ ${filename} (${(size / 1024).toFixed(1)} KB)`)
}

// ─── Mapbox Terrain RGB ───────────────────────────────────────────

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN || ''
const TERRAIN_ZOOM = 14  // ~10m/px ved 60°N – god balanse mellom detalj og antall tiles

/** Konverter lat/lon til tile-koordinater */
function latLonToTile(lat, lon, zoom) {
  const n = 2 ** zoom
  const x = Math.floor(((lon + 180) / 360) * n)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n)
  return { x, y }
}

/** Konverter tile-koordinat + pixel til lat/lon */
function tilePxToLatLon(tileX, tileY, px, py, zoom, tileSize = 256) {
  const n = 2 ** zoom
  const lon = ((tileX + px / tileSize) / n) * 360 - 180
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (tileY + py / tileSize)) / n)))
  const lat = (latRad * 180) / Math.PI
  return { lat, lon }
}

/** Hent én Mapbox Terrain-RGB tile som PNG-data */
async function fetchTerrainTile(tileX, tileY, zoom) {
  const url = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${zoom}/${tileX}/${tileY}@2x.pngraw?access_token=${MAPBOX_TOKEN}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Mapbox tile ${zoom}/${tileX}/${tileY}: ${res.status} ${res.statusText}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  return new Promise((resolve, reject) => {
    new PNG().parse(buffer, (err, png) => {
      if (err) reject(err)
      else resolve(png) // png.data = RGBA buffer, png.width/height = 512 (@2x)
    })
  })
}

/** Dekod Mapbox Terrain-RGB til meter: h = -10000 + (R*256*256 + G*256 + B) * 0.1 */
function decodeHeight(r, g, b) {
  return -10000 + (r * 65536 + g * 256 + b) * 0.1
}

/**
 * Last ned alle Mapbox terrain-tiles for bbox og bygg et sammenhengende høydegrid.
 * Returnerer { data: Float32Array, width, height, bbox: {south,north,west,east} }
 */
async function fetchMapboxElevation() {
  console.log('  Henter høydedata fra Mapbox Terrain-RGB...')

  const tileMin = latLonToTile(BBOX_N, BBOX_W, TERRAIN_ZOOM)  // NW corner
  const tileMax = latLonToTile(BBOX_S, BBOX_E, TERRAIN_ZOOM)  // SE corner

  const tilesX = tileMax.x - tileMin.x + 1
  const tilesY = tileMax.y - tileMin.y + 1
  const tileSize = 512 // @2x tiles
  console.log(`  Tiles: ${tilesX}×${tilesY} = ${tilesX * tilesY} tiles ved zoom ${TERRAIN_ZOOM}`)

  // Hent alle tiles parallelt (med maks 6 samtidige)
  const tiles = new Map()
  const tileJobs = []
  for (let ty = tileMin.y; ty <= tileMax.y; ty++) {
    for (let tx = tileMin.x; tx <= tileMax.x; tx++) {
      tileJobs.push({ tx, ty })
    }
  }

  // Batch-hent med begrenset parallelitet
  const BATCH = 6
  for (let i = 0; i < tileJobs.length; i += BATCH) {
    const batch = tileJobs.slice(i, i + BATCH)
    const results = await Promise.all(
      batch.map(async ({ tx, ty }) => {
        const png = await fetchTerrainTile(tx, ty, TERRAIN_ZOOM)
        return { tx, ty, png }
      })
    )
    for (const { tx, ty, png } of results) {
      tiles.set(`${tx},${ty}`, png)
    }
    process.stdout.write(`  ${Math.min(i + BATCH, tileJobs.length)}/${tileJobs.length} tiles lastet\r`)
  }
  console.log()

  // Stitch tiles til ett sammenhengende grid
  const gridW = tilesX * tileSize
  const gridH = tilesY * tileSize
  const data = new Float32Array(gridW * gridH)

  for (let ty = tileMin.y; ty <= tileMax.y; ty++) {
    for (let tx = tileMin.x; tx <= tileMax.x; tx++) {
      const png = tiles.get(`${tx},${ty}`)
      const offX = (tx - tileMin.x) * tileSize
      const offY = (ty - tileMin.y) * tileSize

      for (let py = 0; py < tileSize; py++) {
        for (let px = 0; px < tileSize; px++) {
          const i = (py * png.width + px) * 4
          const h = decodeHeight(png.data[i], png.data[i + 1], png.data[i + 2])
          data[(offY + py) * gridW + (offX + px)] = h
        }
      }
    }
  }

  // Beregn bounding box i lat/lon fra tile-hjørnene
  const nw = tilePxToLatLon(tileMin.x, tileMin.y, 0, 0, TERRAIN_ZOOM, tileSize)
  const se = tilePxToLatLon(tileMax.x, tileMax.y, tileSize, tileSize, TERRAIN_ZOOM, tileSize)

  console.log(`  Høydegrid: ${gridW}×${gridH} piksler`)
  console.log(`  Dekker: ${se.lat.toFixed(4)}°N–${nw.lat.toFixed(4)}°N, ${nw.lon.toFixed(4)}°E–${se.lon.toFixed(4)}°E`)

  // Finn min-høyde (havnivå) og normaliser slik at hav = 0
  // Mapbox bruker EGM96 geoid – i Sør-Norge ligger denne ~24-28m over ellipsoiden
  let hMin = Infinity, hMax = -Infinity
  for (let i = 0; i < data.length; i++) {
    if (data[i] > -500 && data[i] < 1000) {
      hMin = Math.min(hMin, data[i])
      hMax = Math.max(hMax, data[i])
    }
  }
  console.log(`  Rå høydeområde: ${hMin.toFixed(1)}m – ${hMax.toFixed(1)}m`)

  // Bruk minimum som havnivå-offset og subtraher fra alle verdier
  const seaLevel = hMin
  for (let i = 0; i < data.length; i++) {
    data[i] -= seaLevel
  }
  console.log(`  Normalisert: havnivå=${seaLevel.toFixed(1)}m → 0m, land: 0m – ${(hMax - seaLevel).toFixed(1)}m`)

  return {
    data,
    width: gridW,
    height: gridH,
    bbox: { south: se.lat, north: nw.lat, west: nw.lon, east: se.lon },
  }
}

// ─── Terrenghøyde-lookup (delt mellom terreng og bygninger) ───────

/** Modul-level høydefunksjon – settes i buildTerrain(), brukes av buildBuildings() */
let getTerrainHeightAtLocal = (localX, localZ) => 0

// ─── Terrengbygging ────────────────────────────────────────────────

async function buildTerrain(dtmPath) {
  console.log('\n── Bygger terreng ──')

  const RES = 512 // Økt oppløsning nå som vi har ekte høydedata
  const positions = []
  const normals = []
  const indices = []

  const stepX = MAP_WIDTH / (RES - 1)
  const stepZ = MAP_DEPTH / (RES - 1)
  const startX = MAP_W_MIN
  const startZ = MAP_N_MIN

  let heightData = null
  let heightSource = 'procedural'

  // Prioritet 1: Lokal GeoTIFF DTM-fil
  if (dtmPath && fs.existsSync(dtmPath)) {
    console.log(`  Laster DTM fra ${dtmPath}...`)
    try {
      const { fromFile } = await import('geotiff')
      const tiff = await fromFile(dtmPath)
      const image = await tiff.getImage()
      const data = await image.readRasters()
      const width = image.getWidth()
      const height = image.getHeight()
      const bbox = image.getBoundingBox()
      heightData = { data: data[0], width, height, bbox: { west: bbox[0], south: bbox[1], east: bbox[2], north: bbox[3] }, type: 'utm' }
      heightSource = 'geotiff'
      console.log(`  DTM: ${width}×${height}, bbox: [${bbox.map(v => v.toFixed(1)).join(', ')}]`)
    } catch (e) {
      console.warn(`  Kunne ikke laste DTM: ${e.message}`)
    }
  }

  // Prioritet 2: Mapbox Terrain-RGB API
  if (!heightData && MAPBOX_TOKEN) {
    try {
      const mb = await fetchMapboxElevation()
      heightData = { data: mb.data, width: mb.width, height: mb.height, bbox: mb.bbox, type: 'latlon' }
      heightSource = 'mapbox'
    } catch (e) {
      console.warn(`  Mapbox-feil: ${e.message}`)
    }
  }

  if (!heightData) {
    console.log('  Ingen høydekilde – bruker prosedurelt terreng')
    console.log('  Tips: Sett MAPBOX_TOKEN for ekte høydedata')
  }

  function getHeight(localX, localZ) {
    if (heightData) {
      const { data, width, height, bbox, type } = heightData

      let px, py
      if (type === 'utm') {
        // GeoTIFF i UTM-koordinater
        const utmE = localX + ORIGIN_UTM[0]
        const utmN = localZ + ORIGIN_UTM[1]
        px = Math.round(((utmE - bbox.west) / (bbox.east - bbox.west)) * (width - 1))
        py = Math.round(((bbox.north - utmN) / (bbox.north - bbox.south)) * (height - 1))
      } else {
        // Mapbox i lat/lon – konverter lokal tilbake til WGS84
        const utmE = localX + ORIGIN_UTM[0]
        const utmN = localZ + ORIGIN_UTM[1]
        const [lon, lat] = toUTM.inverse([utmE, utmN])
        px = Math.round(((lon - bbox.west) / (bbox.east - bbox.west)) * (width - 1))
        py = Math.round(((bbox.north - lat) / (bbox.north - bbox.south)) * (height - 1))
      }

      if (px >= 0 && px < width && py >= 0 && py < height) {
        const h = data[py * width + px]
        if (h > -100 && h < 500) return h
      }
    }

    // Prosedyrell fallback
    const base = 2.0
    const hills =
      Math.sin(localX * 0.002) * Math.cos(localZ * 0.003) * 8 +
      Math.sin(localX * 0.005 + 1.3) * Math.cos(localZ * 0.007 + 0.7) * 4 +
      Math.sin(localX * 0.013 + 2.1) * Math.cos(localZ * 0.011 + 1.2) * 2
    const coastFade = Math.max(0, Math.min(1, (localZ + 500) / 800))
    let h = base + hills * coastFade
    if (localZ < -300 || localX > 1200) h = Math.min(h, -0.5)
    return Math.max(-0.5, h)
  }

  // Gjør tilgjengelig for andre funksjoner (bygninger, veier)
  getTerrainHeightAtLocal = getHeight

  // Generer vertices
  for (let iz = 0; iz < RES; iz++) {
    for (let ix = 0; ix < RES; ix++) {
      const x = startX + ix * stepX
      const z = startZ + iz * stepZ
      const y = getHeight(x, z)
      positions.push(x, y, -z)
      normals.push(0, 1, 0)
    }
  }

  // Generer indices (CCW winding for opp-pekende normaler)
  for (let iz = 0; iz < RES - 1; iz++) {
    for (let ix = 0; ix < RES - 1; ix++) {
      const a = iz * RES + ix
      const b = a + 1
      const c = a + RES
      const d = c + 1
      indices.push(a, b, c, b, d, c)
    }
  }

  // Beregn normaler
  for (let iz = 0; iz < RES; iz++) {
    for (let ix = 0; ix < RES; ix++) {
      const idx = iz * RES + ix
      const y0 = positions[idx * 3 + 1]
      const yL = ix > 0 ? positions[(idx - 1) * 3 + 1] : y0
      const yR = ix < RES - 1 ? positions[(idx + 1) * 3 + 1] : y0
      const yD = iz > 0 ? positions[(idx - RES) * 3 + 1] : y0
      const yU = iz < RES - 1 ? positions[(idx + RES) * 3 + 1] : y0
      const nx = (yL - yR) / (2 * stepX)
      const nz = (yD - yU) / (2 * stepZ)
      const len = Math.sqrt(nx * nx + 1 + nz * nz)
      normals[idx * 3] = nx / len
      normals[idx * 3 + 1] = 1 / len
      normals[idx * 3 + 2] = nz / len
    }
  }

  const doc = createGLBDocument('terrain', positions, normals, indices, [0.29, 0.49, 0.25])
  await writeGLB(doc, 'terrain.glb')
  console.log(`  Terreng: ${RES}×${RES} vertices, ${indices.length / 3} triangler (kilde: ${heightSource})`)
  return heightSource !== 'procedural'
}

// ─── Bygningsbygging ───────────────────────────────────────────────

function buildBuildings(geojson) {
  console.log('\n── Bygger bygninger ──')

  const buildingFeatures = geojson.features.filter(
    f => f.properties?.building && f.geometry?.type === 'Polygon'
  )
  console.log(`  ${buildingFeatures.length} bygninger funnet`)

  if (buildingFeatures.length === 0) {
    console.log('  Ingen bygninger – hopper over')
    return null
  }

  // Materialgrupper basert på bygningstype
  const groups = {
    residential: { positions: [], normals: [], indices: [], color: [0.85, 0.82, 0.75], roughness: 0.9 },
    commercial:  { positions: [], normals: [], indices: [], color: [0.75, 0.73, 0.68], roughness: 0.8 },
    industrial:  { positions: [], normals: [], indices: [], color: [0.6, 0.58, 0.55], roughness: 0.7 },
    other:       { positions: [], normals: [], indices: [], color: [0.8, 0.78, 0.72], roughness: 0.85 },
  }

  function getGroup(tags) {
    const bt = tags.building
    if (['house', 'residential', 'apartments', 'detached', 'semidetached_house', 'terrace', 'cabin'].includes(bt)) return groups.residential
    if (['commercial', 'retail', 'office', 'shop'].includes(bt)) return groups.commercial
    if (['industrial', 'warehouse', 'garage', 'garages', 'shed'].includes(bt)) return groups.industrial
    return groups.other
  }

  for (const feature of buildingFeatures) {
    try {
      const coords = feature.geometry.coordinates[0] // Outer ring
      if (!coords || coords.length < 4) continue

      const tags = feature.properties
      const levels = parseInt(tags['building:levels']) || 1
      const height = levels * 3.2

      // Konverter koordinater til lokale meter
      const localCoords = coords.map(([lon, lat]) => {
        const [x, z] = toLocal(lon, lat)
        return [x, -z] // Three.js Z er negativ nord
      })

      const group = getGroup(tags)
      const baseIdx = group.positions.length / 3

      // Beregn terrenghøyde ved bygningens sentroid
      const cx = localCoords.reduce((s, c) => s + c[0], 0) / localCoords.length
      const cz = localCoords.reduce((s, c) => s + c[1], 0) / localCoords.length
      // NB: getTerrainHeightAtLocal bruker localZ (northing), men cz er allerede negert for Three.js
      const groundY = getTerrainHeightAtLocal(cx, -cz)

      // Vegger (ExtrudeGeometry-lignende)
      for (let i = 0; i < localCoords.length - 1; i++) {
        const [x1, z1] = localCoords[i]
        const [x2, z2] = localCoords[i + 1]

        const dx = x2 - x1
        const dz = z2 - z1
        const len = Math.sqrt(dx * dx + dz * dz)
        if (len < 0.1) continue

        // Normal peker utover
        const nx = -dz / len
        const nz = dx / len

        const vi = group.positions.length / 3

        // 4 vertices for veggsegment – plassert på terrengoverflaten
        group.positions.push(x1, groundY, z1, x2, groundY, z2, x2, groundY + height, z2, x1, groundY + height, z1)
        group.normals.push(nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz)

        // 2 triangler
        group.indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3)
      }

      // Tak (fan-triangulering fra sentroid)
      const roofY = groundY + height
      const roofBaseIdx = group.positions.length / 3

      // Senterpunkt
      group.positions.push(cx, roofY, cz)
      group.normals.push(0, 1, 0)

      // Randpunkter
      for (const [x, z] of localCoords) {
        group.positions.push(x, roofY, z)
        group.normals.push(0, 1, 0)
      }

      // Fan-triangulering fra senterpunkt
      for (let i = 0; i < localCoords.length - 1; i++) {
        group.indices.push(roofBaseIdx, roofBaseIdx + 1 + i, roofBaseIdx + 2 + i)
      }
    } catch (e) {
      // Hopp over ugyldige bygninger
    }
  }

  // Lag mesh data for alle grupper med innhold
  const meshDatas = Object.entries(groups)
    .filter(([, g]) => g.positions.length > 0)
    .map(([name, g]) => ({
      name: `buildings_${name}`,
      positions: g.positions,
      normals: g.normals,
      indices: g.indices,
      color: g.color,
      roughness: g.roughness,
      metalness: 0.0,
    }))

  if (meshDatas.length === 0) return null

  const totalVerts = meshDatas.reduce((s, m) => s + m.positions.length / 3, 0)
  const totalTris = meshDatas.reduce((s, m) => s + m.indices.length / 3, 0)
  console.log(`  ${meshDatas.length} materialgrupper, ${totalVerts} vertices, ${totalTris} triangler`)

  return createMultiMeshGLBDocument('buildings', meshDatas)
}

// ─── Veibygging ────────────────────────────────────────────────────

function buildRoads(geojson) {
  console.log('\n── Bygger veier ──')

  const roadFeatures = geojson.features.filter(
    f => f.properties?.highway && f.geometry?.type === 'LineString'
  )
  console.log(`  ${roadFeatures.length} veisegmenter funnet`)

  if (roadFeatures.length === 0) {
    console.log('  Ingen veier – hopper over')
    return null
  }

  // Veibredde basert på type
  const widths = {
    motorway: 8, trunk: 7, primary: 6, secondary: 5, tertiary: 4.5,
    unclassified: 3.5, residential: 3.5, service: 3, track: 2.5,
    footway: 1.5, cycleway: 2, path: 1.2, steps: 1.5,
  }

  const positions = []
  const normals = []
  const indices = []

  for (const feature of roadFeatures) {
    try {
      const coords = feature.geometry.coordinates
      if (!coords || coords.length < 2) continue

      const hwType = feature.properties.highway
      const halfWidth = (widths[hwType] || 3) / 2

      // Konverter til lokale koordinater
      const localCoords = coords.map(([lon, lat]) => {
        const [x, z] = toLocal(lon, lat)
        return [x, -z]
      })

      // Bygg veimesh som en stripe
      for (let i = 0; i < localCoords.length - 1; i++) {
        const [x1, z1] = localCoords[i]
        const [x2, z2] = localCoords[i + 1]

        const dx = x2 - x1
        const dz = z2 - z1
        const len = Math.sqrt(dx * dx + dz * dz)
        if (len < 0.01) continue

        // Perpendikulær for bredde
        const px = -dz / len * halfWidth
        const pz = dx / len * halfWidth

        const vi = positions.length / 3
        // Plasser veien på terrengoverflaten + litt over for å unngå z-fighting
        const y1 = getTerrainHeightAtLocal(x1, -z1) + 0.08
        const y2 = getTerrainHeightAtLocal(x2, -z2) + 0.08

        // 4 vertices per segment
        positions.push(
          x1 + px, y1, z1 + pz,
          x1 - px, y1, z1 - pz,
          x2 - px, y2, z2 - pz,
          x2 + px, y2, z2 + pz
        )
        normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0)
        indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3)
      }
    } catch (e) {
      // Hopp over ugyldige veier
    }
  }

  if (positions.length === 0) return null

  console.log(`  ${positions.length / 3} vertices, ${indices.length / 3} triangler`)

  return createGLBDocument('roads', positions, normals, indices, [0.3, 0.3, 0.32])
}

// ─── Vannbygging ───────────────────────────────────────────────────

function buildWater(geojson) {
  console.log('\n── Bygger vann ──')

  // Havplan – dekker hele kartet ved y=0
  const positions = []
  const normals = []
  const indices = []

  // Stor havflate
  const seaY = -0.3
  const margin = 200
  positions.push(
    MAP_W_MIN - margin, seaY, -(MAP_N_MIN - margin),
    MAP_W_MAX + margin, seaY, -(MAP_N_MIN - margin),
    MAP_W_MAX + margin, seaY, -(MAP_N_MAX + margin),
    MAP_W_MIN - margin, seaY, -(MAP_N_MAX + margin)
  )
  normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0)
  indices.push(0, 1, 2, 0, 2, 3)

  // Legg til innsjøer fra OSM
  const waterFeatures = geojson.features.filter(
    f => f.properties?.natural === 'water' && f.geometry?.type === 'Polygon'
  )

  for (const feature of waterFeatures) {
    try {
      const coords = feature.geometry.coordinates[0]
      if (!coords || coords.length < 4) continue

      const localCoords = coords.map(([lon, lat]) => {
        const [x, z] = toLocal(lon, lat)
        return [x, -z]
      })

      // Fan-triangulering fra sentroid
      const cx = localCoords.reduce((s, c) => s + c[0], 0) / localCoords.length
      const cz = localCoords.reduce((s, c) => s + c[1], 0) / localCoords.length
      const lakeY = 0.1

      const baseIdx = positions.length / 3
      positions.push(cx, lakeY, cz)
      normals.push(0, 1, 0)

      for (const [x, z] of localCoords) {
        positions.push(x, lakeY, z)
        normals.push(0, 1, 0)
      }

      for (let i = 0; i < localCoords.length - 1; i++) {
        indices.push(baseIdx, baseIdx + 1 + i, baseIdx + 2 + i)
      }
    } catch (e) {
      // Hopp over ugyldig vannpolygon
    }
  }

  console.log(`  Hav + ${waterFeatures.length} innsjøer`)
  return createGLBDocument('water', positions, normals, indices, [0.1, 0.42, 0.54])
}

// ─── Hovedprogram ──────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════╗')
  console.log('║  Larkollen Kartbygger                    ║')
  console.log('╚══════════════════════════════════════════╝')

  // Parse argumenter
  const args = process.argv.slice(2)
  const dtmIdx = args.indexOf('--dtm')
  const dtmPath = dtmIdx >= 0 ? args[dtmIdx + 1] : null

  // Sjekk at OSM-data finnes
  if (!fs.existsSync(OSM_FILE)) {
    console.error(`\nFeil: ${OSM_FILE} finnes ikke.`)
    console.error('Kjør først: node scripts/fetch-osm.mjs')
    process.exit(1)
  }

  // Sørg for output-mappe
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  console.log(`\nKartdimensjoner: ${MAP_WIDTH.toFixed(0)}m × ${MAP_DEPTH.toFixed(0)}m`)
  console.log(`Origo: Larkollen kirke (${ORIGIN_LAT}°N, ${ORIGIN_LON}°E)`)

  // Last OSM-data
  console.log('\nLaster OSM-data...')
  const osmRaw = JSON.parse(fs.readFileSync(OSM_FILE, 'utf-8'))
  const geojson = osmtogeojson(osmRaw)
  console.log(`  ${geojson.features.length} GeoJSON-features`)

  // Bygg alle komponenter
  const hasRealElevation = await buildTerrain(dtmPath)

  const buildingsDoc = buildBuildings(geojson)
  if (buildingsDoc) await writeGLB(buildingsDoc, 'buildings.glb')

  const roadsDoc = buildRoads(geojson)
  if (roadsDoc) await writeGLB(roadsDoc, 'roads.glb')

  const waterDoc = buildWater(geojson)
  if (waterDoc) await writeGLB(waterDoc, 'water.glb')

  // Opprett metadata-fil
  const meta = {
    generatedAt: new Date().toISOString(),
    origin: { lat: ORIGIN_LAT, lon: ORIGIN_LON },
    bbox: { south: BBOX_S, north: BBOX_N, west: BBOX_W, east: BBOX_E },
    mapSize: { width: MAP_WIDTH, depth: MAP_DEPTH },
    hasDTM: hasRealElevation,
    files: ['terrain.glb', 'buildings.glb', 'roads.glb', 'water.glb'],
  }
  fs.writeFileSync(path.join(OUTPUT_DIR, 'map-meta.json'), JSON.stringify(meta, null, 2))
  console.log('\n  ✓ map-meta.json')

  console.log('\n══ Ferdig! ══')
  console.log(`Filer lagret til: ${OUTPUT_DIR}`)
}

main().catch(err => {
  console.error('Feil:', err)
  process.exit(1)
})
