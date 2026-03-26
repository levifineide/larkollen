import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import NPCMesh from './NPCMesh'
import { getTerrainHeight } from '../../world/terrainHeight'

export default function NPCInstance({ entity }) {
  const groupRef = useRef()
  const meshGroupRef = useRef()

  useFrame(() => {
    if (!groupRef.current) return

    // Klem NPC Y til terrenghøyde – Yuka-steering kan generere vertikal drift
    entity.position.y = getTerrainHeight(entity.position.x, entity.position.z)
    entity.velocity.y = 0

    // Synkroniser Yuka-posisjon → Three.js gruppe
    groupRef.current.position.set(
      entity.position.x,
      entity.position.y,
      entity.position.z,
    )

    // Roter NPC i bevegelsesretning
    const vel = entity.velocity
    if (vel.length() > 0.1) {
      const angle = Math.atan2(vel.x, vel.z)
      if (meshGroupRef.current) meshGroupRef.current.rotation.y = angle
    } else if (entity.isTalking && entity._playerDist < 10) {
      const pos = entity.position
      const dx = entity._playerPosition.x - pos.x
      const dz = entity._playerPosition.z - pos.z
      if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
        const angle = Math.atan2(dx, dz)
        if (meshGroupRef.current) meshGroupRef.current.rotation.y = angle
      }
    }
  })

  return (
    <group ref={groupRef} position={[entity.position.x, entity.position.y, entity.position.z]}>
      <group ref={meshGroupRef}>
        <NPCMesh npcId={entity.npcId} animState={entity.animState} />
      </group>
    </group>
  )
}
