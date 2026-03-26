import { useRef, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { RigidBody, CuboidCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { usePlayerStore } from '../stores/usePlayerStore'
import { useVehicleStore, activeVehicleBodyRef } from '../stores/useVehicleStore'

/**
 * Bygningskomponent med LOD-system og destruksjon.
 * ALLE bygninger bruker ÉN compound RigidBody for stabil fysikk.
 * Destruksjon håndteres visuelt (mesh swap) – ikke via separate RigidBodies.
 */

// Kjente bygningsposisjoner for prosedyrell fallback
const PLACEHOLDER_BUILDINGS = [
  // Larkollen sentrum
  { x: 20, z: -15, w: 12, d: 8, h: 7, color: '#c4b8a8' },
  { x: -25, z: 10, w: 10, d: 10, h: 6.4, color: '#b8a898' },
  { x: 45, z: -30, w: 15, d: 10, h: 9.6, color: '#a89888' },
  { x: -40, z: -25, w: 8, d: 12, h: 6.4, color: '#c4b8a8' },
  { x: 10, z: 35, w: 14, d: 8, h: 6.4, color: '#b8a898' },

  // Langs hovedveien
  { x: 80, z: -10, w: 10, d: 8, h: 6.4, color: '#c4b8a8' },
  { x: 120, z: -20, w: 12, d: 10, h: 6.4, color: '#b8a898' },
  { x: -80, z: 5, w: 8, d: 10, h: 6.4, color: '#c4b8a8' },
  { x: -120, z: 15, w: 14, d: 8, h: 6.4, color: '#a89888' },

  // Bensinstasjon-område
  { x: 30, z: -65, w: 20, d: 15, h: 4.8, color: '#d0c8c0' },
  { x: 35, z: -55, w: 8, d: 12, h: 3.2, color: '#888' },

  // Boligfelt nord
  { x: -60, z: -80, w: 10, d: 8, h: 6.4, color: '#c4b8a8' },
  { x: -30, z: -100, w: 8, d: 10, h: 6.4, color: '#b8a898' },
  { x: 20, z: -110, w: 12, d: 8, h: 6.4, color: '#c4b8a8' },
  { x: 60, z: -90, w: 10, d: 10, h: 6.4, color: '#b8a898' },
  { x: 100, z: -100, w: 8, d: 12, h: 6.4, color: '#a89888' },

  // Boligfelt vest
  { x: -150, z: -30, w: 10, d: 8, h: 6.4, color: '#c4b8a8' },
  { x: -180, z: -50, w: 12, d: 10, h: 6.4, color: '#b8a898' },
  { x: -200, z: 10, w: 8, d: 8, h: 6.4, color: '#c4b8a8' },

  // Spredte hus i utkanten (10 stk)
  ...Array.from({ length: 10 }, (_, i) => {
    const angle = (i / 10) * Math.PI * 2
    const r = 150 + (i % 3) * 80
    return {
      x: Math.cos(angle) * r + (Math.sin(i * 7.3) * 30),
      z: Math.sin(angle) * r + (Math.cos(i * 5.7) * 30),
      w: 8 + (i % 3) * 3,
      d: 7 + (i % 4) * 2,
      h: 3.2 + (i % 3) * 3.2,
      color: ['#c4b8a8', '#b8a898', '#a89888', '#d4c8b8'][(i % 4)],
    }
  }),
]

// Indekser for destruktible bygninger (maks 8)
const DESTRUCTIBLE_INDICES = new Set([0, 1, 2, 3, 5, 9, 11, 15])

const LOD_SIMPLIFIED = 300

const _lodTempVec = new THREE.Vector3()

/** Lag en prosedyrell tekstur fra canvas */
function createProceduralTexture(width, height, drawFn) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  drawFn(ctx, width, height)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.flipY = true  // Default: canvas top-left → GPU bottom-left (correct for glTF UVs)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/** Lag teksturer for norske bygninger – med vinduer og dører */
function createBuildingTextures() {
  // ── Tegn vinduer på en vegg-tekstur ──
  function drawWindows(ctx, w, h, windowColor = '#8cb4d8', frameColor = '#f0ece8') {
    // Teksturen representerer én veggflate med 3 vinduer over, 2 vinduer + 1 dør under
    const cols = 3
    const rows = 2
    const marginX = w * 0.08
    const marginTop = h * 0.1
    const marginBottom = h * 0.06
    const cellW = (w - marginX * 2) / cols
    const cellH = (h - marginTop - marginBottom) / rows
    const winW = cellW * 0.5
    const winH = cellH * 0.55
    const gap = 3 // ramme-bredde

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cx = marginX + col * cellW + cellW / 2
        const cy = marginTop + row * cellH + cellH / 2

        // Dør i midten nederst
        if (row === rows - 1 && col === 1) {
          const doorW = winW * 0.85
          const doorH = cellH * 0.85
          const dx = cx - doorW / 2
          const dy = cy - doorH / 2 + doorH * 0.08
          // Dørkarm
          ctx.fillStyle = frameColor
          ctx.fillRect(dx - gap, dy - gap, doorW + gap * 2, doorH + gap * 2)
          // Dør
          ctx.fillStyle = '#5a4030'
          ctx.fillRect(dx, dy, doorW, doorH)
          // Dørhåndtak
          ctx.fillStyle = '#c0b080'
          ctx.fillRect(dx + doorW * 0.75, dy + doorH * 0.55, 3, 6)
          continue
        }

        const wx = cx - winW / 2
        const wy = cy - winH / 2

        // Vindusramme (hvit)
        ctx.fillStyle = frameColor
        ctx.fillRect(wx - gap, wy - gap, winW + gap * 2, winH + gap * 2)

        // Vindusglass
        ctx.fillStyle = windowColor
        ctx.fillRect(wx, wy, winW, winH)

        // Vinduskryss (sprosse)
        ctx.fillStyle = frameColor
        ctx.fillRect(wx + winW / 2 - 1, wy, 2, winH) // vertikal
        ctx.fillRect(wx, wy + winH / 2 - 1, winW, 2) // horisontal

        // Glass-refleksjon
        ctx.globalAlpha = 0.15
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(wx + 2, wy + 2, winW * 0.35, winH * 0.4)
        ctx.globalAlpha = 1.0
      }
    }
  }

  // ── Trevegg (hvit/gul/rød) – liggende kledning med synlige bord + vinduer ──
  function drawWoodCladdingWithWindows(ctx, w, h, baseColor, boardColor, windowTint) {
    // Bakgrunn
    ctx.fillStyle = baseColor
    ctx.fillRect(0, 0, w, h)

    // Liggende kledning
    const boardHeight = h / 14
    ctx.strokeStyle = boardColor
    ctx.lineWidth = 1

    for (let y = 0; y < h; y += boardHeight) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()

      // Variasjon per planke
      ctx.globalAlpha = 0.04 + Math.random() * 0.04
      ctx.fillStyle = Math.random() > 0.5 ? '#000000' : '#ffffff'
      ctx.fillRect(0, y + 1, w, boardHeight - 1)
      ctx.globalAlpha = 1.0
    }

    // Vinduer og dør
    drawWindows(ctx, w, h, windowTint || '#8cb4d8')
  }

  const wallWhiteTex = createProceduralTexture(256, 256, (ctx, w, h) =>
    drawWoodCladdingWithWindows(ctx, w, h, '#f0ece6', '#ddd8d0', '#9ec4e0'))

  const wallYellowTex = createProceduralTexture(256, 256, (ctx, w, h) =>
    drawWoodCladdingWithWindows(ctx, w, h, '#e8d88c', '#d0c070', '#8cb4d0'))

  const wallRedTex = createProceduralTexture(256, 256, (ctx, w, h) =>
    drawWoodCladdingWithWindows(ctx, w, h, '#a83830', '#882820', '#6090b0'))

  const wallDarkwoodTex = createProceduralTexture(256, 256, (ctx, w, h) =>
    drawWoodCladdingWithWindows(ctx, w, h, '#6a5040', '#584030', '#5080a0'))

  // Grå vegg (mur/betong) med vinduer
  const wallGreyTex = createProceduralTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#b8b4b0'
    ctx.fillRect(0, 0, w, h)
    // Murstein-mønster
    const brickH = h / 16
    const brickW = w / 8
    ctx.strokeStyle = '#a09890'
    ctx.lineWidth = 1
    for (let row = 0; row < 16; row++) {
      const offsetX = row % 2 === 0 ? 0 : brickW / 2
      for (let col = -1; col < 9; col++) {
        const shade = 0.96 + Math.random() * 0.08
        ctx.fillStyle = `rgba(160, 156, 150, ${1 - shade + 0.5})`
        const x = offsetX + col * brickW
        const y = row * brickH
        ctx.fillRect(x + 1, y + 1, brickW - 2, brickH - 2)
        ctx.strokeRect(x, y, brickW, brickH)
      }
    }
    // Vinduer
    drawWindows(ctx, w, h, '#7aa8c8', '#d0ccc8')
  })

  // ── Takstein – mørk (litt lysere for bedre synlighet) ──
  const roofDarkTex = createProceduralTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#505058'
    ctx.fillRect(0, 0, w, h)
    const tileH = h / 12
    const tileW = w / 6
    ctx.lineWidth = 1
    for (let row = 0; row < 12; row++) {
      const offsetX = row % 2 === 0 ? 0 : tileW / 2
      for (let col = -1; col < 7; col++) {
        const x = offsetX + col * tileW
        const y = row * tileH
        const l = 30 + Math.random() * 8
        ctx.fillStyle = `hsl(230, 6%, ${l}%)`
        ctx.fillRect(x + 1, y + 1, tileW - 2, tileH - 2)
        ctx.strokeStyle = `hsl(230, 6%, ${l - 8}%)`
        ctx.strokeRect(x, y, tileW, tileH)
      }
    }
  })

  // ── Takstein – rød (litt lysere) ──
  const roofRedTex = createProceduralTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#903830'
    ctx.fillRect(0, 0, w, h)
    const tileH = h / 12
    const tileW = w / 6
    ctx.lineWidth = 1
    for (let row = 0; row < 12; row++) {
      const offsetX = row % 2 === 0 ? 0 : tileW / 2
      for (let col = -1; col < 7; col++) {
        const x = offsetX + col * tileW
        const y = row * tileH
        const hue = 5 + Math.random() * 10
        const l = 32 + Math.random() * 10
        ctx.fillStyle = `hsl(${hue}, 55%, ${l}%)`
        ctx.fillRect(x + 1, y + 1, tileW - 2, tileH - 2)
        ctx.strokeStyle = `hsl(${hue}, 50%, ${l - 8}%)`
        ctx.strokeRect(x, y, tileW, tileH)
      }
    }
  })

  return { wallWhiteTex, wallYellowTex, wallRedTex, wallDarkwoodTex, wallGreyTex, roofDarkTex, roofRedTex }
}

/** Map GLB mesh-navn til tekstur */
const MESH_TEXTURE_MAP = {
  buildings_walls_white: 'wallWhiteTex',
  buildings_walls_red: 'wallRedTex',
  buildings_walls_yellow: 'wallYellowTex',
  buildings_walls_grey: 'wallGreyTex',
  buildings_walls_darkwood: 'wallDarkwoodTex',
  buildings_roof_dark: 'roofDarkTex',
  buildings_roof_red: 'roofRedTex',
}

function GLBBuildings() {
  const { nodes } = useGLTF('/map/buildings.glb')
  const sceneRef = useRef()
  const playerPos = useRef(new THREE.Vector3())
  const frameSkip = useRef(0)

  // Lag teksturer én gang
  const textures = useMemo(() => createBuildingTextures(), [])

  useFrame(() => {
    frameSkip.current++
    if (frameSkip.current % 3 !== 0) return

    const pos = usePlayerStore.getState().position
    if (pos) playerPos.current.set(pos[0], pos[1], pos[2])

    if (!sceneRef.current) return
    sceneRef.current.traverse(child => {
      if (!child.isMesh) return
      const dist = playerPos.current.distanceTo(child.getWorldPosition(_lodTempVec))
      child.visible = dist <= LOD_SIMPLIFIED
    })
  })

  return (
    <group ref={sceneRef}>
      {Object.entries(MESH_TEXTURE_MAP).map(([meshName, texKey]) => {
        const node = nodes[meshName]
        if (!node || !node.geometry) return null
        const tex = textures[texKey]
        return (
          <mesh
            key={meshName}
            geometry={node.geometry}
            castShadow
          >
            <meshStandardMaterial
              map={tex}
              roughness={0.85}
              metalness={0.0}
              side={THREE.DoubleSide}
            />
          </mesh>
        )
      })}
    </group>
  )
}

// Generer fragmenter for en bygning
function generateFragments(building) {
  const { w, d, h } = building
  const count = 6
  const cols = 3
  const rows = 2
  const fragW = w / cols
  const fragD = d / rows
  const frags = []

  for (let i = 0; i < count; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const isTop = row > 0
    const fragH = isTop ? h * 0.4 : h * 0.6

    frags.push({
      x: building.x + (col - 1) * fragW,
      y: isTop ? building.h * 0.6 : building.h * 0.3,
      z: building.z + (row - 0.5) * fragD,
      w: fragW * 0.9,
      d: fragD * 0.9,
      h: fragH * (0.7 + Math.random() * 0.3),
    })
  }
  return frags
}

function PlaceholderBuildings() {
  const groupRef = useRef()
  const playerPos = useRef(new THREE.Vector3())
  const frameSkip = useRef(0)
  const [destroyedSet, setDestroyedSet] = useState(new Set())
  const [fragmentsList, setFragmentsList] = useState([])
  const fragmentTimeRef = useRef(new Map())

  useFrame((_, delta) => {
    frameSkip.current++

    // ── LOD-oppdatering hvert 10. frame ──────────────────────────────────
    if (frameSkip.current % 10 === 0) {
      const pos = usePlayerStore.getState().position
      if (pos) playerPos.current.set(pos[0], pos[1], pos[2])

      if (groupRef.current) {
        const children = groupRef.current.children
        for (let i = 0; i < children.length; i++) {
          const child = children[i]
          const dist = playerPos.current.distanceTo(child.position)
          child.visible = dist <= LOD_SIMPLIFIED
        }
      }
    }

    // ── Destruksjonssjekk hvert 5. frame ─────────────────────────────────
    if (frameSkip.current % 5 === 0) {
      const activeId = useVehicleStore.getState().activeId
      if (!activeId) return
      const vBody = activeVehicleBodyRef.current
      if (!vBody) return

      const vPos = vBody.translation()
      const vVel = vBody.linvel()
      const vSpeed = Math.sqrt(vVel.x * vVel.x + vVel.z * vVel.z)

      if (vSpeed < 8) return // Trenger fart for ødeleggelse

      for (const idx of DESTRUCTIBLE_INDICES) {
        if (destroyedSet.has(idx)) continue
        const b = PLACEHOLDER_BUILDINGS[idx]
        if (!b) continue

        const dx = vPos.x - b.x
        const dz = vPos.z - b.z
        const dist = Math.sqrt(dx * dx + dz * dz)
        const reach = Math.max(b.w, b.d) * 0.7

        if (dist < reach) {
          // Ødelegg bygningen!
          const frags = generateFragments(b)
          setDestroyedSet(prev => new Set([...prev, idx]))
          setFragmentsList(prev => [...prev, ...frags.map(f => ({ ...f, id: `${idx}-${Math.random()}` }))])
          window.__screenShake = 0.5

          // Skjul den opprinnelige meshen
          if (groupRef.current && groupRef.current.children[idx]) {
            groupRef.current.children[idx].visible = false
          }
          break
        }
      }
    }

    // ── Fade fragmenter ──────────────────────────────────────────────────
    for (const [id, time] of fragmentTimeRef.current) {
      fragmentTimeRef.current.set(id, time + delta)
    }
  })

  return (
    <>
      {/* ÉN RigidBody med compound-colliders for ALLE bygninger */}
      <RigidBody type="fixed" colliders={false}>
        {PLACEHOLDER_BUILDINGS.map((b, i) => (
          <CuboidCollider
            key={i}
            args={[b.w / 2, b.h / 2, b.d / 2]}
            position={[b.x, b.h / 2, b.z]}
          />
        ))}
      </RigidBody>

      {/* Visuelle mesher med LOD */}
      <group ref={groupRef}>
        {PLACEHOLDER_BUILDINGS.map((b, i) => (
          <mesh
            key={i}
            receiveShadow
            castShadow
            position={[b.x, b.h / 2, b.z]}
            visible={!destroyedSet.has(i)}
          >
            <boxGeometry args={[b.w, b.h, b.d]} />
            <meshStandardMaterial color={b.color} roughness={0.88} metalness={0.02} />
          </mesh>
        ))}
      </group>

      {/* Fragmenter fra ødelagte bygninger */}
      {fragmentsList.map(frag => (
        <RigidBody
          key={frag.id}
          type="dynamic"
          position={[frag.x, frag.y, frag.z]}
          linearDamping={0.5}
          angularDamping={0.5}
          colliders={false}
        >
          <CuboidCollider args={[frag.w / 2, frag.h / 2, frag.d / 2]} density={2} />
          <mesh castShadow receiveShadow>
            <boxGeometry args={[frag.w, frag.h, frag.d]} />
            <meshStandardMaterial color="#a89888" roughness={0.9} />
          </mesh>
        </RigidBody>
      ))}
    </>
  )
}

export default function Buildings({ useGLB: shouldUseGLB = false }) {
  if (shouldUseGLB) {
    return <GLBBuildings />
  }
  return <PlaceholderBuildings />
}
