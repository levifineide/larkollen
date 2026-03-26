import { useRef, useEffect, useCallback } from 'react'
import { usePlayerStore } from '../stores/usePlayerStore'
import { zombiePool } from '../systems/ZombieManager'
import { npcPool } from '../systems/NPCManager'

const MAP_SIZE = 160       // pikselstørrelse på minikartet
const MAP_RANGE = 100      // meter radius synlig på kartet
const UPDATE_MS = 200      // oppdater minikartet hvert 200ms (5 Hz)

// Mapbox config
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || ''
const MAPBOX_STYLE = 'mapbox/streets-v12'
const MAP_ZOOM = 17        // ~0.6 m/px ved lat 59.4 → ~194m for 320px bilde
const TILE_SIZE = MAP_SIZE * 2  // canvas-oppløsning (retina)

// Kartets origo i spill-verdenen (fra build-map.mjs)
const ORIGIN_LAT = 59.4022
const ORIGIN_LON = 10.8175

// Meter per grad ved denne breddegraden
const DEG_TO_M_LAT = 111320
const DEG_TO_M_LON = 111320 * Math.cos(ORIGIN_LAT * Math.PI / 180)

// Meter per piksel ved gitt zoom og breddegrad (uten @2x)
const METERS_PER_PX = 156543.03 * Math.cos(ORIGIN_LAT * Math.PI / 180) / Math.pow(2, MAP_ZOOM)

// Hvor langt spilleren må flytte før vi henter nytt kartbilde (meter)
const REFETCH_THRESHOLD = 30

/** Konverter spill-koordinater (X, Z) til lat/lon */
function gameToLatLon(gameX, gameZ) {
  // I Three.js: positiv Z = sør, negativ Z = nord (se build-map: [x, -z])
  const lat = ORIGIN_LAT + (-gameZ) / DEG_TO_M_LAT
  const lon = ORIGIN_LON + gameX / DEG_TO_M_LON
  return [lat, lon]
}

export default function Minimap() {
  const canvasRef = useRef(null)
  const tileImgRef = useRef(null)       // cached Image-objekt
  const tileCenterRef = useRef([0, 0])  // [gameX, gameZ] for senter av cached tile
  const loadingRef = useRef(false)

  /** Hent nytt Mapbox Static Image sentrert på gitt spillposisjon */
  const fetchTile = useCallback((gameX, gameZ) => {
    if (!MAPBOX_TOKEN || loadingRef.current) return
    loadingRef.current = true

    const [lat, lon] = gameToLatLon(gameX, gameZ)
    const url = `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE}/static/${lon.toFixed(6)},${lat.toFixed(6)},${MAP_ZOOM},0/${TILE_SIZE}x${TILE_SIZE}@2x?access_token=${MAPBOX_TOKEN}&attribution=false&logo=false`

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      tileImgRef.current = img
      tileCenterRef.current = [gameX, gameZ]
      loadingRef.current = false
    }
    img.onerror = () => {
      console.warn('[Minimap] Kunne ikke laste Mapbox-tile')
      loadingRef.current = false
    }
    img.src = url
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const playerPos = usePlayerStore.getState().position
    const px = playerPos[0]
    const pz = playerPos[2]

    const w = canvas.width
    const h = canvas.height
    const cx = w / 2
    const cy = h / 2
    const scale = (w / 2) / MAP_RANGE

    // Sjekk om vi trenger nytt kartbilde
    const [tcx, tcz] = tileCenterRef.current
    const dist = Math.sqrt((px - tcx) ** 2 + (pz - tcz) ** 2)
    if (!tileImgRef.current || dist > REFETCH_THRESHOLD) {
      fetchTile(px, pz)
    }

    // Klipp til sirkel
    ctx.save()
    ctx.clearRect(0, 0, w, h)
    ctx.beginPath()
    ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2)
    ctx.clip()

    // Tegn kartbilde som bakgrunn
    if (tileImgRef.current) {
      const img = tileImgRef.current
      const [tcx2, tcz2] = tileCenterRef.current

      // Offset mellom spillerens posisjon og tile-senteret, i piksler
      const offsetX = (px - tcx2) / METERS_PER_PX
      const offsetZ = (pz - tcz2) / METERS_PER_PX

      // Skalering: kartet viser MAP_RANGE meter i (w/2) piksler
      // Mapbox-bildet har 1 piksel = METERS_PER_PX meter
      // Så 1 game-meter = 1/METERS_PER_PX bildepiksler
      // På canvas: 1 game-meter = scale canvas-piksler
      // Ergo: 1 bildepiksel = scale * METERS_PER_PX canvas-piksler
      const imgScale = scale * METERS_PER_PX

      // Tegn bildet sentrert, forskjøvet for spillerens bevegelse
      const drawW = img.width * imgScale
      const drawH = img.height * imgScale
      const drawX = cx - drawW / 2 - offsetX * scale
      const drawY = cy - drawH / 2 - offsetZ * scale

      ctx.drawImage(img, drawX, drawY, drawW, drawH)
    } else {
      // Fallback: mørk bakgrunn mens kartet laster
      ctx.fillStyle = 'rgba(20, 25, 30, 0.85)'
      ctx.fillRect(0, 0, w, h)
    }

    // Halvtransparent overlay for bedre lesbarhet av prikker
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)'
    ctx.beginPath()
    ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()

    // Sirkelkant
    ctx.strokeStyle = 'rgba(100, 120, 140, 0.6)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2)
    ctx.stroke()

    // Klipp igjen for prikker
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, cx - 4, 0, Math.PI * 2)
    ctx.clip()

    // Zombier (rode prikker)
    ctx.fillStyle = '#e63946'
    for (const [, zombie] of zombiePool) {
      if (zombie.health <= 0) continue
      const dx = zombie.position.x - px
      const dz = zombie.position.z - pz
      if (Math.abs(dx) > MAP_RANGE || Math.abs(dz) > MAP_RANGE) continue

      const sx = cx + dx * scale
      const sy = cy + dz * scale
      ctx.beginPath()
      ctx.arc(sx, sy, 3, 0, Math.PI * 2)
      ctx.fill()
    }

    // NPC-er (gronne prikker)
    ctx.fillStyle = '#4ad98c'
    for (const [, npc] of npcPool) {
      const dx = npc.position.x - px
      const dz = npc.position.z - pz
      if (Math.abs(dx) > MAP_RANGE || Math.abs(dz) > MAP_RANGE) continue

      const sx = cx + dx * scale
      const sy = cy + dz * scale
      ctx.beginPath()
      ctx.arc(sx, sy, 3.5, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.restore()

    // Spiller (bla prikk med hvit kant) – alltid i sentrum
    ctx.fillStyle = '#4a90d9'
    ctx.beginPath()
    ctx.arc(cx, cy, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(cx, cy, 5, 0, Math.PI * 2)
    ctx.stroke()
  }, [fetchTile])

  useEffect(() => {
    // Hent første tile umiddelbart
    const playerPos = usePlayerStore.getState().position
    fetchTile(playerPos[0], playerPos[2])

    const id = setInterval(draw, UPDATE_MS)
    draw()
    return () => clearInterval(id)
  }, [draw, fetchTile])

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      pointerEvents: 'none',
      zIndex: 5,
    }}>
      <canvas
        ref={canvasRef}
        width={TILE_SIZE}
        height={TILE_SIZE}
        style={{
          width: MAP_SIZE,
          height: MAP_SIZE,
          borderRadius: '50%',
        }}
      />
      <div style={{
        position: 'absolute',
        top: -2,
        left: '50%',
        transform: 'translateX(-50%)',
        color: '#fff',
        fontSize: 9,
        fontFamily: 'monospace',
        fontWeight: 'bold',
        textShadow: '0 0 3px rgba(0,0,0,0.8)',
      }}>N</div>
    </div>
  )
}
