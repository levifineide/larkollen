import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { usePlayerStore } from '../stores/usePlayerStore'
import { useMissionStore } from '../stores/useMissionStore'

const GAS_STATION = { x: 30, y: 0, z: -65 }
const ELOYA = { x: 180, y: 0, z: 80 }
const GAS_TRIGGER_RADIUS = 15
const ELOYA_TRIGGER_RADIUS = 25

function TriggerZone({ position, radius, color, onEnter }) {
  const isInsideRef = useRef(false)
  const frameSkip = useRef(0)

  useFrame(() => {
    // Sjekk kun hvert 10. frame
    frameSkip.current++
    if (frameSkip.current % 10 !== 0) return

    const pos = usePlayerStore.getState().position
    if (!pos) return

    const dx = pos[0] - position[0]
    const dz = pos[2] - position[2]
    const distSq = dx * dx + dz * dz

    const inside = distSq < radius * radius
    if (inside && !isInsideRef.current) {
      onEnter?.()
    }
    isInsideRef.current = inside
  })

  return (
    <group position={position}>
      {/* Enkel stråle-markør */}
      <mesh position={[0, 8, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 16, 6]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} />
      </mesh>
    </group>
  )
}

export default function GameplayTriggers() {
  return (
    <>
      <TriggerZone
        position={[GAS_STATION.x, GAS_STATION.y, GAS_STATION.z]}
        radius={GAS_TRIGGER_RADIUS}
        color="#ffaa00"
        onEnter={() => {
          const { checkLocationReached } = useMissionStore.getState()
          if (checkLocationReached) checkLocationReached('gas_station')
        }}
      />

      <TriggerZone
        position={[ELOYA.x, ELOYA.y, ELOYA.z]}
        radius={ELOYA_TRIGGER_RADIUS}
        color="#00ff88"
        onEnter={() => {
          const { checkLocationReached } = useMissionStore.getState()
          if (checkLocationReached) checkLocationReached('eloya')
        }}
      />

      {/* Bensinstasjon-overbygg */}
      <RigidBody type="fixed" colliders="cuboid" position={[GAS_STATION.x + 5, 2.4, GAS_STATION.z + 10]}>
        <mesh receiveShadow>
          <boxGeometry args={[8, 4.8, 12]} />
          <meshStandardMaterial color="#d0c8c0" roughness={0.8} />
        </mesh>
      </RigidBody>
    </>
  )
}
