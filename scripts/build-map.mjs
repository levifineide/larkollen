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
// Origo: Støtvig Hotel, Larkollen → lokal (0, 0)
const ORIGIN_LAT = 59.3289
const ORIGIN_LON = 10.6682

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
const BBOX_S = 59.30, BBOX_N = 59.36, BBOX_W = 10.63, BBOX_E = 10.71
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

    // Legg til UV-koordinater hvis tilgjengelig
    if (md.uvs && md.uvs.length > 0) {
      const uvAccessor = doc.createAccessor(`${md.name}_uv`)
        .setType('VEC2')
        .setArray(new Float32Array(md.uvs))
        .setBuffer(buffer)
      prim.setAttribute('TEXCOORD_0', uvAccessor)
    }

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

  // ── Materialgrupper – norsk fargeplett ──
  // Vegggrupper: hvite hus, røde hus, gule hus, grå næringsbygg, mørke uthus
  // Takgrupper: mørk takstein, rød takstein
  const groups = {
    walls_white:    { positions: [], normals: [], uvs: [], indices: [], color: [0.92, 0.90, 0.87], roughness: 0.85 },
    walls_red:      { positions: [], normals: [], uvs: [], indices: [], color: [0.55, 0.18, 0.14], roughness: 0.80 },
    walls_yellow:   { positions: [], normals: [], uvs: [], indices: [], color: [0.88, 0.82, 0.55], roughness: 0.82 },
    walls_grey:     { positions: [], normals: [], uvs: [], indices: [], color: [0.65, 0.63, 0.60], roughness: 0.75 },
    walls_darkwood: { positions: [], normals: [], uvs: [], indices: [], color: [0.35, 0.25, 0.18], roughness: 0.90 },
    roof_dark:      { positions: [], normals: [], uvs: [], indices: [], color: [0.22, 0.22, 0.25], roughness: 0.70 },
    roof_red:       { positions: [], normals: [], uvs: [], indices: [], color: [0.50, 0.20, 0.15], roughness: 0.75 },
  }

  // Bestem vegg- og tak-gruppe basert på bygningstype
  function getWallGroup(tags) {
    const bt = tags.building
    // Røde uthus/låver
    if (['barn', 'farm_auxiliary', 'farm'].includes(bt)) return groups.walls_red
    // Mørke trebygninger (sjøboder, boder)
    if (['boathouse', 'shed', 'hut'].includes(bt)) return groups.walls_darkwood
    // Grå næringsbygg
    if (['commercial', 'retail', 'office', 'industrial', 'warehouse', 'school', 'civic', 'sports_centre', 'kindergarten'].includes(bt)) return groups.walls_grey
    // Garasjer – grå
    if (['garage', 'garages'].includes(bt)) return groups.walls_grey
    // Hytter – gule/oker (typisk norsk)
    if (['cabin'].includes(bt)) return groups.walls_yellow
    // Bolighus – hvite (mest vanlig i Larkollen)
    if (['house', 'residential', 'apartments', 'detached', 'semidetached_house', 'terrace', 'hotel'].includes(bt)) return groups.walls_white
    // Ukjent → hvit (de fleste i Larkollen er hvite bolighus)
    return groups.walls_white
  }

  function getRoofGroup(tags) {
    const bt = tags.building
    // Rødt tak på røde/brune bygninger
    if (['barn', 'farm_auxiliary', 'farm', 'cabin'].includes(bt)) return groups.roof_red
    // Mørkt tak for alt annet
    return groups.roof_dark
  }

  // Skal bygningen ha saltak (gabled roof)?
  function shouldHaveGabledRoof(tags) {
    const bt = tags.building
    // Flate tak for: garasjer, boder, industribygg, næringsbygg
    if (['garage', 'garages', 'shed', 'industrial', 'warehouse', 'commercial', 'hut', 'bunker', 'kiosk'].includes(bt)) return false
    // Saltak for alle boliger, hytter, gårder, låver osv.
    return true
  }

  // ── Hjelpefunksjon: Finn polygon-retning (lengste akse) for saltak ──
  function findRidgeAxis(localCoords) {
    // Beregn oriented bounding box approx via lengste kant
    let maxLen = 0
    let ridgeDx = 1, ridgeDz = 0
    for (let i = 0; i < localCoords.length - 1; i++) {
      const dx = localCoords[i + 1][0] - localCoords[i][0]
      const dz = localCoords[i + 1][1] - localCoords[i][1]
      const len = Math.sqrt(dx * dx + dz * dz)
      if (len > maxLen) {
        maxLen = len
        ridgeDx = dx / len
        ridgeDz = dz / len
      }
    }
    return [ridgeDx, ridgeDz]
  }

  let gabledCount = 0
  let flatCount = 0

  for (const feature of buildingFeatures) {
    try {
      const coords = feature.geometry.coordinates[0] // Outer ring
      if (!coords || coords.length < 4) continue

      const tags = feature.properties
      const levels = parseInt(tags['building:levels']) || 1
      const wallHeight = levels * 3.2

      // Konverter koordinater til lokale meter
      const localCoords = coords.map(([lon, lat]) => {
        const [x, z] = toLocal(lon, lat)
        return [x, -z] // Three.js Z er negativ nord
      })

      const wallGroup = getWallGroup(tags)
      const roofGroup = getRoofGroup(tags)
      const gabled = shouldHaveGabledRoof(tags)

      // Beregn terrenghøyde ved bygningens sentroid
      const centX = localCoords.reduce((s, c) => s + c[0], 0) / localCoords.length
      const centZ = localCoords.reduce((s, c) => s + c[1], 0) / localCoords.length
      const groundY = getTerrainHeightAtLocal(centX, -centZ)

      // ── Vegger med UV ──
      let wallRunU = 0 // Akkumulert U langs fasaden
      for (let i = 0; i < localCoords.length - 1; i++) {
        const [x1, z1] = localCoords[i]
        const [x2, z2] = localCoords[i + 1]

        const dx = x2 - x1
        const dz = z2 - z1
        const segLen = Math.sqrt(dx * dx + dz * dz)
        if (segLen < 0.1) continue

        // Normal peker utover
        const nx = -dz / segLen
        const nz = dx / segLen

        const vi = wallGroup.positions.length / 3

        // 4 vertices: bottom-left, bottom-right, top-right, top-left
        wallGroup.positions.push(x1, groundY, z1, x2, groundY, z2, x2, groundY + wallHeight, z2, x1, groundY + wallHeight, z1)
        wallGroup.normals.push(nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz)

        // UV: tile vegg-tekstur – 1 UV-enhet = 3 meter (naturlig panel-bredde)
        const uStart = wallRunU / 3.0
        const uEnd = (wallRunU + segLen) / 3.0
        const vTop = wallHeight / 3.0
        wallGroup.uvs.push(uStart, 0, uEnd, 0, uEnd, vTop, uStart, vTop)
        wallRunU += segLen

        // 2 triangler
        wallGroup.indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3)
      }

      // ── Tak ──
      const roofBaseY = groundY + wallHeight

      if (gabled) {
        gabledCount++
        // Saltak: ridge langs lengste akse, 30° helling
        const [rdx, rdz] = findRidgeAxis(localCoords)
        const roofPitch = 0.35 // tak-høyde som andel av halv bredde

        // Beregn bredde vinkelrett på ridge-aksen for å finne tak-høyde
        let minProj = Infinity, maxProj = -Infinity
        for (const [x, z] of localCoords) {
          const proj = (x - centX) * (-rdz) + (z - centZ) * rdx
          if (proj < minProj) minProj = proj
          if (proj > maxProj) maxProj = proj
        }
        const halfWidth = (maxProj - minProj) / 2
        const ridgeHeight = halfWidth * roofPitch

        // Ridge-linje: finn extent langs ridge-retning
        let minRidge = Infinity, maxRidge = -Infinity
        for (const [x, z] of localCoords) {
          const proj = (x - centX) * rdx + (z - centZ) * rdz
          if (proj < minRidge) minRidge = proj
          if (proj > maxRidge) maxRidge = proj
        }

        // Ridge-endepunkter (med litt overheng)
        const overhang = 0.3
        const r1x = centX + rdx * (minRidge - overhang)
        const r1z = centZ + rdz * (minRidge - overhang)
        const r2x = centX + rdx * (maxRidge + overhang)
        const r2z = centZ + rdz * (maxRidge + overhang)
        const ridgeY = roofBaseY + ridgeHeight

        // For hvert polygon-segment, lag takflate fra eaves til ridge
        // Forenklet: lag to takflater (venstre og høyre side av ridge)
        for (let i = 0; i < localCoords.length - 1; i++) {
          const [x1, z1] = localCoords[i]
          const [x2, z2] = localCoords[i + 1]

          // Hvilken side av ridge er dette segmentet?
          const mid1 = (x1 - centX) * (-rdz) + (z1 - centZ) * rdx
          const mid2 = (x2 - centX) * (-rdz) + (z2 - centZ) * rdx
          const avgSide = (mid1 + mid2) / 2

          // Projiser eaves-punkter langs ridge for å finne nærmeste ridge-punkt
          const p1ridge = (x1 - centX) * rdx + (z1 - centZ) * rdz
          const p2ridge = (x2 - centX) * rdx + (z2 - centZ) * rdz
          const rp1x = centX + rdx * p1ridge
          const rp1z = centZ + rdz * p1ridge
          const rp2x = centX + rdx * p2ridge
          const rp2z = centZ + rdz * p2ridge

          const vi = roofGroup.positions.length / 3

          // Takflate: eaves1, eaves2, ridge2, ridge1 (quad)
          roofGroup.positions.push(
            x1, roofBaseY, z1,
            x2, roofBaseY, z2,
            rp2x, ridgeY, rp2z,
            rp1x, ridgeY, rp1z
          )

          // Normal: kryssproduktet av takflaten
          const e1x = x2 - x1, e1y = 0, e1z = z2 - z1
          const e2x = rp1x - x1, e2y = ridgeHeight, e2z = rp1z - z1
          let rnx = e1y * e2z - e1z * e2y
          let rny = e1z * e2x - e1x * e2z
          let rnz = e1x * e2y - e1y * e2x
          const rnLen = Math.sqrt(rnx * rnx + rny * rny + rnz * rnz) || 1
          rnx /= rnLen; rny /= rnLen; rnz /= rnLen
          if (rny < 0) { rnx = -rnx; rny = -rny; rnz = -rnz } // Normal skal peke oppover

          roofGroup.normals.push(rnx, rny, rnz, rnx, rny, rnz, rnx, rny, rnz, rnx, rny, rnz)

          // UV for tak (tile takstein-tekstur)
          const segLen = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2)
          const slopeLen = Math.sqrt(halfWidth ** 2 + ridgeHeight ** 2)
          roofGroup.uvs.push(0, 0, segLen / 2.0, 0, segLen / 2.0, slopeLen / 2.0, 0, slopeLen / 2.0)

          roofGroup.indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3)
        }
      } else {
        flatCount++
        // Flatt tak (fan-triangulering fra sentroid)
        const roofBaseIdx = roofGroup.positions.length / 3

        roofGroup.positions.push(centX, roofBaseY, centZ)
        roofGroup.normals.push(0, 1, 0)
        roofGroup.uvs.push(0.5, 0.5)

        for (const [x, z] of localCoords) {
          roofGroup.positions.push(x, roofBaseY, z)
          roofGroup.normals.push(0, 1, 0)
          roofGroup.uvs.push((x - centX) / 10.0 + 0.5, (z - centZ) / 10.0 + 0.5)
        }

        for (let i = 0; i < localCoords.length - 1; i++) {
          roofGroup.indices.push(roofBaseIdx, roofBaseIdx + 1 + i, roofBaseIdx + 2 + i)
        }
      }
    } catch (e) {
      // Hopp over ugyldige bygninger
    }
  }

  console.log(`  Saltak: ${gabledCount}, Flatt tak: ${flatCount}`)

  // Lag mesh data for alle grupper med innhold
  const meshDatas = Object.entries(groups)
    .filter(([, g]) => g.positions.length > 0)
    .map(([name, g]) => ({
      name: `buildings_${name}`,
      positions: g.positions,
      normals: g.normals,
      uvs: g.uvs,
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
  console.log(`Origo: Støtvig Hotel, Larkollen (${ORIGIN_LAT}°N, ${ORIGIN_LON}°E)`)

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
