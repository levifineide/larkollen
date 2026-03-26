import * as THREE from 'three'

// Delte materialer – gjenbrukes av alle zombier
const ALIVE_MAT = new THREE.MeshStandardMaterial({ color: '#4a7a3b', roughness: 0.8 })
const DEAD_MAT = new THREE.MeshStandardMaterial({ color: '#555', roughness: 0.8 })

const SHADOW_MAT = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.35, depthWrite: false })

export default function ZombieMesh({ animState }) {
  const mat = animState === 'dead' ? DEAD_MAT : ALIVE_MAT

  return (
    <group>
      <mesh position={[0, 0.7, 0]} material={mat}>
        <capsuleGeometry args={[0.3, 0.8, 3, 6]} />
      </mesh>
      {/* Blob-skygge på bakken */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} material={SHADOW_MAT}>
        <circleGeometry args={[0.4, 16]} />
      </mesh>
    </group>
  )
}
