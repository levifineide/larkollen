import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import ZombieMesh from './ZombieMesh'
import { getTerrainHeight } from '../../world/terrainHeight'

export default function ZombieInstance({ entity, onDespawn }) {
  const groupRef = useRef(null)
  const meshGroupRef = useRef(null)

  useFrame(() => {
    if (!groupRef.current) return

    // Sjekk om zombien skal despawne
    if (entity._shouldDespawn) {
      onDespawn(entity.zombieId)
      return
    }

    // Død → skjul etter en stund (ingen ragdoll uten fysikk)
    if (entity.health <= 0) {
      if (!entity._deathTime) entity._deathTime = performance.now()
      // Synk siste posisjon, legg zombie "flat"
      groupRef.current.position.set(
        entity.position.x,
        entity.position.y - 0.3,
        entity.position.z,
      )
      return
    }

    // Frosset → ikke oppdater posisjon
    if (entity.frozen) return

    // Klem zombie Y til terrenghøyde (Yuka styrer kun XZ)
    entity.position.y = getTerrainHeight(entity.position.x, entity.position.z)

    // Synkroniser Yuka-posisjon → Three.js gruppe
    groupRef.current.position.set(
      entity.position.x,
      entity.position.y,
      entity.position.z,
    )

    // Roter mesh mot bevegelsesretning
    if (meshGroupRef.current && entity.velocity.squaredLength() > 0.01) {
      const angle = Math.atan2(entity.velocity.x, entity.velocity.z)
      meshGroupRef.current.rotation.y = angle
    }
  })

  return (
    <group ref={groupRef} position={[entity.position.x, entity.position.y, entity.position.z]}>
      <group ref={meshGroupRef}>
        <ZombieMesh animState={entity.animState} />
      </group>
    </group>
  )
}
