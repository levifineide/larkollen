import { RigidBody, CuboidCollider } from '@react-three/rapier'
import * as THREE from 'three'

const grassColor = '#4a7c3f'
const concreteColor = '#8a8a8a'
const waterColor = '#1a6b8a'

// Vannsone: X ∈ [-80, 80], Z ∈ [-300, -80]
// Spillbare koordinater: nord av Z=-80 er land, sør er vann

// Genererer deterministiske hindringer basert på seed
function generateObstacles() {
  const obstacles = []
  const positions = [
    [10, 0, -8], [-12, 0, 5], [25, 0, -20], [-30, 0, -15],
    [18, 0, 30], [-22, 0, 25], [40, 0, 10], [-45, 0, -5],
    [8, 0, 50], [-10, 0, -50], [55, 0, -30], [-60, 0, 40],
    [35, 0, -60], [-35, 0, 55], [70, 0, 20], [-70, 0, -40],
    [15, 0, -35], [-18, 0, -60], [60, 0, 60], [-65, 0, 70],
  ]
  for (let i = 0; i < positions.length; i++) {
    const [x, , z] = positions[i]
    const w = 1.5 + (i % 3) * 1.2
    const h = 1.5 + (i % 4) * 0.8
    const d = 1.5 + (i % 2) * 1.5
    obstacles.push({ x, y: h / 2, z, w, h, d })
  }
  return obstacles
}

const OBSTACLES = generateObstacles()

export default function TestWorld() {
  return (
    <>
      {/* ── Visuelt bakkeplan (hele 1km×1km, ingen kollisjon) ── */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[1000, 1000]} />
        <meshStandardMaterial color={grassColor} roughness={0.9} metalness={0.0} />
      </mesh>

      {/* ── Vannflate (visuell, dekker vannsonen) ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, -190]}>
        <planeGeometry args={[160, 220]} />
        <meshStandardMaterial
          color={waterColor}
          transparent
          opacity={0.82}
          metalness={0.4}
          roughness={0.05}
        />
      </mesh>

      {/* ── Land-kollidere (4 seksjoner som omringer vannsonen) ── */}

      {/* Hoved-land nord (Z: -80 → 500) */}
      <RigidBody type="fixed" colliders={false} position={[0, -0.1, 210]}>
        <CuboidCollider args={[500, 0.1, 290]} />
      </RigidBody>

      {/* Fjerne land sør (Z: -500 → -300) */}
      <RigidBody type="fixed" colliders={false} position={[0, -0.1, -400]}>
        <CuboidCollider args={[500, 0.1, 100]} />
      </RigidBody>

      {/* Venstre bredd (X: -500 → -80, Z: -300 → -80) */}
      <RigidBody type="fixed" colliders={false} position={[-290, -0.1, -190]}>
        <CuboidCollider args={[210, 0.1, 110]} />
      </RigidBody>

      {/* Høyre bredd (X: 80 → 500, Z: -300 → -80) */}
      <RigidBody type="fixed" colliders={false} position={[290, -0.1, -190]}>
        <CuboidCollider args={[210, 0.1, 110]} />
      </RigidBody>

      {/* Sjøbunn (X: -80 → 80, Z: -300 → -80, Y: -4) */}
      <RigidBody type="fixed" colliders={false} position={[0, -4.1, -190]}>
        <CuboidCollider args={[80, 0.1, 110]} />
      </RigidBody>

      {/* ── Boksehindringer ── */}
      {OBSTACLES.map((o, i) => (
        <RigidBody key={i} type="fixed" colliders="cuboid" position={[o.x, o.y, o.z]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[o.w, o.h, o.d]} />
            <meshStandardMaterial color={concreteColor} roughness={0.7} />
          </mesh>
        </RigidBody>
      ))}
    </>
  )
}
