import { useRef, useState, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { RigidBody, CuboidCollider, BallCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { usePlayerStore } from '../stores/usePlayerStore'
import { inputState } from './InputSystem'
import { zombiePool } from './ZombieManager'
import weaponData from '../data/weapons.json'

const MAX_PROJECTILES = 20
const _dir = new THREE.Vector3()

// Global prosjektil-kø – CombatSystem legger til, ProjectileSystem håndterer
export const projectileQueue = []

export function queueProjectile(type, origin, direction) {
  if (projectileQueue.length >= MAX_PROJECTILES) return
  projectileQueue.push({ type, origin: origin.clone(), direction: direction.clone(), id: Date.now() + Math.random() })
}

// Radialkraft mot zombier
function applyExplosionDamage(center, radius, damage) {
  for (const [, entity] of zombiePool) {
    if (entity.health <= 0) continue
    const dx = entity.position.x - center.x
    const dy = (entity.position.y + 0.7) - center.y
    const dz = entity.position.z - center.z
    const distSq = dx * dx + dy * dy + dz * dz
    if (distSq < radius * radius) {
      const dist = Math.sqrt(distSq) || 1
      const falloff = 1 - dist / radius
      entity.takeDamage(damage * falloff)
      if (entity.health <= 0) {
        usePlayerStore.getState().incrementKills()
      }
    }
  }
  // Skade spilleren også hvis nær
  const pp = usePlayerStore.getState().position
  const pdx = pp[0] - center.x
  const pdy = pp[1] - center.y
  const pdz = pp[2] - center.z
  const playerDistSq = pdx * pdx + pdy * pdy + pdz * pdz
  if (playerDistSq < radius * radius) {
    const dist = Math.sqrt(playerDistSq) || 1
    const falloff = 1 - dist / radius
    usePlayerStore.getState().takeDamage(Math.round(damage * falloff * 0.5))
  }
}

// Brannområde – gjør skade over tid
function applyBurnDamage(center, radius, dps) {
  for (const [, entity] of zombiePool) {
    if (entity.health <= 0) continue
    const dx = entity.position.x - center.x
    const dz = entity.position.z - center.z
    const distSq = dx * dx + dz * dz
    if (distSq < radius * radius) {
      entity.takeDamage(dps)
      if (entity.health <= 0) {
        usePlayerStore.getState().incrementKills()
      }
    }
  }
}

export default function ProjectileSystem() {
  const [projectiles, setProjectiles] = useState([])

  useFrame(() => {
    // Dra nye prosjektiler fra køen
    while (projectileQueue.length > 0) {
      const p = projectileQueue.shift()
      setProjectiles(prev => [...prev, p])
    }
  })

  const removeProjectile = useCallback((id) => {
    setProjectiles(prev => prev.filter(p => p.id !== id))
  }, [])

  return (
    <>
      {projectiles.map(p => (
        p.type === 'grenade' ? (
          <GrenadeProjectile key={p.id} data={p} onRemove={removeProjectile} />
        ) : (
          <MolotovProjectile key={p.id} data={p} onRemove={removeProjectile} />
        )
      ))}
    </>
  )
}

function GrenadeProjectile({ data, onRemove }) {
  const bodyRef = useRef(null)
  const fuseRef = useRef(weaponData.grenade.fuseTime)
  const explodedRef = useRef(false)
  const config = weaponData.grenade

  useFrame((_, delta) => {
    if (explodedRef.current) return
    fuseRef.current -= delta

    if (fuseRef.current <= 0) {
      explodedRef.current = true
      const rb = bodyRef.current
      if (rb) {
        const pos = rb.translation()
        applyExplosionDamage(pos, config.explosionRadius, config.damage)
        window.__screenShake = 0.8
      }
      // Fjern etter en kort forsinkelse for visuell effekt
      setTimeout(() => onRemove(data.id), 100)
    }
  })

  return (
    <RigidBody
      ref={bodyRef}
      type="dynamic"
      position={[data.origin.x, data.origin.y, data.origin.z]}
      linearVelocity={[
        data.direction.x * config.throwForce,
        data.direction.y * config.throwForce + 5,
        data.direction.z * config.throwForce,
      ]}
      angularVelocity={[Math.random() * 5, Math.random() * 5, Math.random() * 5]}
      linearDamping={0.3}
      colliders={false}
    >
      <BallCollider args={[0.15]} density={5} restitution={0.3} />
      <mesh castShadow>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshStandardMaterial color="#3a3a2a" roughness={0.8} />
      </mesh>
    </RigidBody>
  )
}

function MolotovProjectile({ data, onRemove }) {
  const bodyRef = useRef(null)
  const hitRef = useRef(false)
  const burnTimerRef = useRef(0)
  const burnPosRef = useRef(null)
  const flameGroupRef = useRef()
  const config = weaponData.molotov

  const onCollision = useCallback(() => {
    if (hitRef.current) return
    hitRef.current = true
    const rb = bodyRef.current
    if (rb) {
      const pos = rb.translation()
      burnPosRef.current = { x: pos.x, y: pos.y, z: pos.z }
    }
  }, [])

  useFrame((_, delta) => {
    if (!hitRef.current || !burnPosRef.current) return

    burnTimerRef.current += delta

    // Brannområde skade hvert 0.5s
    if (burnTimerRef.current % 0.5 < delta) {
      applyBurnDamage(burnPosRef.current, config.burnRadius, config.burnDamage * delta * 2)
    }

    // Animer flammer
    if (flameGroupRef.current) {
      flameGroupRef.current.visible = true
      flameGroupRef.current.position.set(burnPosRef.current.x, burnPosRef.current.y + 0.5, burnPosRef.current.z)
    }

    if (burnTimerRef.current >= config.burnDuration) {
      onRemove(data.id)
    }
  })

  return (
    <>
      {!hitRef.current && (
        <RigidBody
          ref={bodyRef}
          type="dynamic"
          position={[data.origin.x, data.origin.y, data.origin.z]}
          linearVelocity={[
            data.direction.x * config.throwForce,
            data.direction.y * config.throwForce + 6,
            data.direction.z * config.throwForce,
          ]}
          angularVelocity={[Math.random() * 8, 0, Math.random() * 8]}
          linearDamping={0.2}
          colliders={false}
          onCollisionEnter={onCollision}
        >
          <BallCollider args={[0.12]} density={3} />
          <mesh castShadow>
            <cylinderGeometry args={[0.06, 0.08, 0.3, 6]} />
            <meshStandardMaterial color="#4a3a2a" />
          </mesh>
          {/* Klut/veke */}
          <mesh position={[0, 0.18, 0]}>
            <boxGeometry args={[0.04, 0.08, 0.04]} />
            <meshBasicMaterial color="#ff6600" />
          </mesh>
        </RigidBody>
      )}

      {/* Brannområde */}
      <group ref={flameGroupRef} visible={false}>
        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i / 8) * Math.PI * 2
          const r = 1.5 + Math.random()
          return (
            <mesh key={i} position={[Math.cos(angle) * r, 0.4, Math.sin(angle) * r]}>
              <coneGeometry args={[0.3, 1.0 + Math.random() * 0.5, 4]} />
              <meshBasicMaterial color={i % 2 === 0 ? '#ff4400' : '#ff8800'} transparent opacity={0.7} />
            </mesh>
          )
        })}
        {/* Lyskilder */}
        <pointLight color="#ff6600" intensity={3} distance={8} />
      </group>
    </>
  )
}
