import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { RigidBody } from '@react-three/rapier'
import * as THREE from 'three'

/**
 * Veikomponent.
 * Laster roads.glb fra build-map pipeline, eller genererer prosedyrelle
 * placeholder-veier basert på Larkollen-veinettet.
 */

// Prosedyrelle hovedveier for fallback
// Larkollen har en hovedvei (Fv120 / Larkollenveien) som går N-S
const ROAD_SEGMENTS = [
  // Larkollenveien (N-S hovedvei)
  { points: [[0, -400], [0, -200], [10, -100], [15, 0], [10, 100], [0, 200], [-10, 300], [0, 400]], width: 6 },
  // Strandveien (langs kysten, V-Ø)
  { points: [[-300, -50], [-200, -40], [-100, -30], [0, -20], [100, -15], [200, -25], [300, -40]], width: 5 },
  // Kirkeveien (mot kirken)
  { points: [[15, 0], [30, -20], [50, -40], [30, -65]], width: 4 },
  // Boligveier vest
  { points: [[-100, -30], [-130, -50], [-150, -30], [-180, -50], [-200, 10]], width: 3.5 },
  // Boligveier nord
  { points: [[0, 200], [50, 180], [100, 200], [80, 250]], width: 3.5 },
  // Boligveier øst
  { points: [[100, -15], [120, -40], [120, -80], [100, -100]], width: 3.5 },
  // Vei mot sjøen
  { points: [[15, 0], [40, 30], [60, 50], [80, 40]], width: 3 },
  // Småveier
  { points: [[-60, -80], [-30, -100], [0, -110], [20, -110]], width: 3 },
  { points: [[60, -90], [80, -70], [100, -60]], width: 3 },
]

function ProceduralRoads() {
  const geometry = useMemo(() => {
    const positions = []
    const normals = []
    const indices = []
    const y = 0.08 // Litt over terrenget

    for (const road of ROAD_SEGMENTS) {
      const hw = road.width / 2

      for (let i = 0; i < road.points.length - 1; i++) {
        const [x1, z1] = road.points[i]
        const [x2, z2] = road.points[i + 1]

        const dx = x2 - x1
        const dz = z2 - z1
        const len = Math.sqrt(dx * dx + dz * dz)
        if (len < 0.01) continue

        const px = -dz / len * hw
        const pz = dx / len * hw

        const vi = positions.length / 3
        positions.push(
          x1 + px, y, z1 + pz,
          x1 - px, y, z1 - pz,
          x2 - px, y, z2 - pz,
          x2 + px, y, z2 + pz
        )
        normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0)
        indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3)
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geo.setIndex(indices)
    return geo
  }, [])

  return (
    <mesh receiveShadow geometry={geometry}>
      <meshStandardMaterial
        color="#3a3a3c"
        roughness={0.85}
        metalness={0.05}
      />
    </mesh>
  )
}

function GLBRoads() {
  const { scene } = useGLTF('/map/roads.glb')

  useMemo(() => {
    scene.traverse(child => {
      if (child.isMesh) {
        child.receiveShadow = true
        child.material = new THREE.MeshStandardMaterial({
          color: '#3a3a3c',
          roughness: 0.85,
          metalness: 0.05,
          side: THREE.DoubleSide,
        })
      }
    })
  }, [scene])

  return <primitive object={scene} />
}

export default function Roads({ useGLB: shouldUseGLB = false }) {
  if (shouldUseGLB) {
    return <GLBRoads />
  }
  return <ProceduralRoads />
}
