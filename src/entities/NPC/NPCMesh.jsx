import * as THREE from 'three'

const NPC_COLORS = {
  erik: '#4a90d9',
  ingrid: '#d94a8c',
  ole: '#d9a84a',
  astrid: '#8c4ad9',
  survivor_1: '#4ad98c',
  survivor_2: '#d9d94a',
  survivor_3: '#4ad9d9',
}

// Pre-opprettede materialer per NPC for å unngå nye objekter
const NPC_MATS = {}
for (const [id, color] of Object.entries(NPC_COLORS)) {
  NPC_MATS[id] = new THREE.MeshStandardMaterial({ color, roughness: 0.6 })
}
const DEFAULT_MAT = new THREE.MeshStandardMaterial({ color: '#4a90d9', roughness: 0.6 })

const SHADOW_MAT = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.35, depthWrite: false })

export default function NPCMesh({ npcId }) {
  const mat = NPC_MATS[npcId] || DEFAULT_MAT

  return (
    <group>
      <mesh position={[0, 0.55, 0]} material={mat}>
        <capsuleGeometry args={[0.3, 0.5, 3, 6]} />
      </mesh>
      {/* Blob-skygge på bakken */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} material={SHADOW_MAT}>
        <circleGeometry args={[0.4, 16]} />
      </mesh>
    </group>
  )
}
