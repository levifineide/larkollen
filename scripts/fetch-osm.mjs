/**
 * fetch-osm.mjs
 * Henter OpenStreetMap-data for Larkollen-området via Overpass API.
 * Lagrer resultatet i scripts/data/larkollen-osm.json (versjonskontrollert).
 *
 * Bruk: node scripts/fetch-osm.mjs
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = path.join(__dirname, 'data')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'larkollen-osm.json')

// Larkollen bounding box
const BBOX = '59.38,10.78,59.44,10.86'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

const QUERY = `
[out:json][timeout:60];
(
  way["building"](${BBOX});
  way["highway"](${BBOX});
  way["natural"="water"](${BBOX});
  way["natural"="coastline"](${BBOX});
  way["landuse"](${BBOX});
  way["amenity"](${BBOX});
  relation["natural"="water"](${BBOX});
  relation["landuse"](${BBOX});
);
out body geom;
`

async function main() {
  console.log('Henter OSM-data for Larkollen...')
  console.log(`Bbox: ${BBOX}`)

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(QUERY)}`,
  })

  if (!res.ok) {
    throw new Error(`Overpass API feil: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  const elementCount = data.elements?.length ?? 0

  // Kategoriser elementer
  const buildings = data.elements.filter(e => e.tags?.building)
  const highways = data.elements.filter(e => e.tags?.highway)
  const water = data.elements.filter(e => e.tags?.natural === 'water' || e.tags?.natural === 'coastline')
  const landuse = data.elements.filter(e => e.tags?.landuse)
  const amenities = data.elements.filter(e => e.tags?.amenity)

  console.log(`Mottatt ${elementCount} elementer:`)
  console.log(`  Bygninger:  ${buildings.length}`)
  console.log(`  Veier:      ${highways.length}`)
  console.log(`  Vann/kyst:  ${water.length}`)
  console.log(`  Arealbruk:  ${landuse.length}`)
  console.log(`  Fasiliteter:${amenities.length}`)

  // Finn bensinstasjon
  const fuelStations = amenities.filter(e => e.tags?.amenity === 'fuel')
  if (fuelStations.length > 0) {
    console.log(`  Bensinstasjoner: ${fuelStations.length}`)
    fuelStations.forEach(s => {
      const name = s.tags?.name || 'ukjent'
      console.log(`    - ${name}`)
    })
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2))
  console.log(`\nLagret til ${OUTPUT_FILE}`)
  console.log(`Filstørrelse: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1)} KB`)
}

main().catch(err => {
  console.error('Feil:', err.message)
  process.exit(1)
})
