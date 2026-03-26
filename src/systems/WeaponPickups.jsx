import { useRef, useState, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, CuboidCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { usePlayerStore } from '../stores/usePlayerStore'
import { inputState } from './InputSystem'

// Våpen-pickups plassert rundt kartet
const PICKUP_SPAWNS = [
  // AK-47 – nær bensinstasjonen
  { weaponId: 'ak47', position: [35, 1, -60], ammo: 60, color: '#8B4513' },
  // AK-47 – boligfelt
  { weaponId: 'ak47', position: [-55, 1, -75], ammo: 30, color: '#8B4513' },
  // Molotov – sentrum
  { weaponId: 'molotov', position: [15, 1, 30], ammo: 3, color: '#cc4400' },
  // Molotov – langs veien
  { weaponId: 'molotov', position: [75, 1, -15], ammo: 2, color: '#cc4400' },
  // Granat – bensinstasjon
  { weaponId: 'grenade', position: [25, 1, -70], ammo: 2, color: '#3a3a2a' },
  // Granat – utkanten
  { weaponId: 'grenade', position: [-120, 1, 10], ammo: 3, color: '#3a3a2a' },
  // Ekstra rifle-ammo
  { weaponId: 'rifle', position: [-30, 1, -95], ammo: 60, color: '#556B2F' },
  // Ekstra shotgun-ammo
  { weaponId: 'shotgun', position: [55, 1, -85], ammo: 12, color: '#8B0000' },
]

const PICKUP_RADIUS = 3
const BOB_SPEED = 2
const BOB_HEIGHT = 0.3
const ROTATE_SPEED = 1.5

export default function WeaponPickups() {
  return (
    <>
      {PICKUP_SPAWNS.map((spawn, i) => (
        <WeaponPickup key={i} spawn={spawn} />
      ))}
    </>
  )
}

function WeaponPickup({ spawn }) {
  const meshRef = useRef()
  const [collected, setCollected] = useState(false)
  const prevInteract = useRef(false)
  const timeRef = useRef(Math.random() * Math.PI * 2) // Random startfase

  useFrame((_, delta) => {
    if (collected) return

    timeRef.current += delta

    // Bob og roter
    if (meshRef.current) {
      meshRef.current.position.y = 0.5 + Math.sin(timeRef.current * BOB_SPEED) * BOB_HEIGHT
      meshRef.current.rotation.y += delta * ROTATE_SPEED
    }

    // Sjekk om spilleren er nær nok og trykker E
    const pp = usePlayerStore.getState().position
    if (!pp) return
    const dx = pp[0] - spawn.position[0]
    const dz = pp[2] - spawn.position[2]
    const dist = Math.sqrt(dx * dx + dz * dz)

    const interactNow = inputState.interact
    const justPressed = interactNow && !prevInteract.current
    prevInteract.current = interactNow

    if (dist < PICKUP_RADIUS && justPressed) {
      const state = usePlayerStore.getState()
      const weapon = state.weapons[spawn.weaponId]

      if (weapon) {
        if (!weapon.unlocked) {
          // Lås opp våpenet
          state.addAmmo(spawn.weaponId, spawn.ammo)
          usePlayerStore.setState(s => ({
            weapons: {
              ...s.weapons,
              [spawn.weaponId]: { ...s.weapons[spawn.weaponId], unlocked: true },
            },
          }))
        } else {
          // Legg til ammo
          state.addAmmo(spawn.weaponId, spawn.ammo)
        }
        setCollected(true)
      }
    }
  })

  if (collected) return null

  return (
    <group position={spawn.position}>
      {/* Glow-ring på bakken */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.8, 1.2, 16]} />
        <meshBasicMaterial color={spawn.color} transparent opacity={0.4} side={THREE.DoubleSide} />
      </mesh>

      {/* Våpen-eske */}
      <group ref={meshRef}>
        <mesh castShadow>
          <boxGeometry args={[0.8, 0.5, 0.5]} />
          <meshStandardMaterial color={spawn.color} roughness={0.6} metalness={0.3} />
        </mesh>
        {/* Stripe */}
        <mesh position={[0, 0, 0.26]}>
          <boxGeometry args={[0.6, 0.3, 0.01]} />
          <meshBasicMaterial color="#fff" transparent opacity={0.6} />
        </mesh>
      </group>
    </group>
  )
}
