import { useRef, useState, useCallback, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { EntityManager } from 'yuka'
import ZombieEntity from '../entities/Zombie/ZombieEntity'
import ZombieInstance from '../entities/Zombie/ZombieInstance'
import { usePlayerStore } from '../stores/usePlayerStore'
import { useWorldStore } from '../stores/useWorldStore'
import * as THREE from 'three'

const MAX_ZOMBIES = 15
const FREEZE_DISTANCE_SQ = 50 * 50   // 50m – bruk squared for å unngå sqrt
const SPAWN_RADIUS_MIN = 20           // minimum spawn-avstand fra spiller
const SPAWN_RADIUS_MAX = 45           // maks spawn-avstand
const INITIAL_SPAWN = 6               // antall zombier å spawne ved oppstart
const SPAWN_INTERVAL = 5              // sekunder mellom nye spawns
const SPAWN_BATCH = 1                 // antall per batch
const SPAWN_DELAY = 3000              // ms – vent med spawn til verden er lastet

const _playerPos = new THREE.Vector3()

// Modul-nivå Yuka EntityManager – delt mellom ZombieManager og CombatSystem
export const entityManager = new EntityManager()
export const zombiePool = new Map() // zombieId → ZombieEntity

export default function ZombieManager() {
  const entityManagerRef = useRef(entityManager)
  const zombieListRef = useRef([])           // Ref-basert liste (ingen re-render)
  const [renderKey, setRenderKey] = useState(0) // Kun for å trigge re-render ved spawn/despawn
  const nextIdRef = useRef(0)
  const spawnTimerRef = useRef(0)
  const initializedRef = useRef(false)
  const prevZombieCount = useRef(0)

  // Spawn en zombie på en tilfeldig posisjon rundt spilleren
  const spawnZombie = useCallback((playerX, playerZ) => {
    if (zombiePool.size >= MAX_ZOMBIES) return null

    const id = nextIdRef.current++
    const angle = Math.random() * Math.PI * 2
    const dist = SPAWN_RADIUS_MIN + Math.random() * (SPAWN_RADIUS_MAX - SPAWN_RADIUS_MIN)
    const x = playerX + Math.cos(angle) * dist
    const z = playerZ + Math.sin(angle) * dist

    const entity = new ZombieEntity(id)
    entity.position.set(x, 0.5, z)

    entityManagerRef.current.add(entity)
    zombiePool.set(id, entity)

    return entity
  }, [])

  // Despawn en zombie
  const despawnZombie = useCallback((zombieId) => {
    const entity = zombiePool.get(zombieId)
    if (entity) {
      entityManagerRef.current.remove(entity)
      zombiePool.delete(zombieId)
    }
    zombieListRef.current = zombieListRef.current.filter((z) => z.zombieId !== zombieId)
    setRenderKey((k) => k + 1)
  }, [])

  // Forsinket initial spawn – vent til verden er klar
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    const timer = setTimeout(() => {
      const spawned = []
      for (let i = 0; i < INITIAL_SPAWN; i++) {
        const angle = Math.random() * Math.PI * 2
        const dist = SPAWN_RADIUS_MIN + Math.random() * (SPAWN_RADIUS_MAX - SPAWN_RADIUS_MIN)
        const entity = spawnZombie(Math.cos(angle) * dist, Math.sin(angle) * dist)
        if (entity) spawned.push(entity)
      }
      zombieListRef.current = spawned
      setRenderKey((k) => k + 1)
      useWorldStore.getState().setZombieCount(spawned.length)
    }, SPAWN_DELAY)

    return () => clearTimeout(timer)
  }, [spawnZombie])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)

    // Hent spillerposisjon
    const pos = usePlayerStore.getState().position
    _playerPos.set(pos[0], pos[1], pos[2])

    // Oppdater avstand og frys-tilstand for alle zombier
    let totalDamage = 0
    for (const [, entity] of zombiePool) {
      const dx = entity.position.x - _playerPos.x
      const dz = entity.position.z - _playerPos.z
      const distSq = dx * dx + dz * dz

      // Frosset? Bruk squared distance (ingen sqrt)
      entity.frozen = distSq > FREEZE_DISTANCE_SQ
      if (!entity.frozen) {
        const dist = Math.sqrt(distSq)
        entity.updatePlayerInfo(_playerPos, dist)
      }

      // Batch opp skade
      if (entity._pendingDamage > 0) {
        totalDamage += entity._pendingDamage
        entity._pendingDamage = 0
      }
    }
    if (totalDamage > 0) {
      usePlayerStore.getState().takeDamage(totalDamage)
    }

    // Oppdater Yuka EntityManager
    entityManagerRef.current.update(dt)

    // Spawn nye zombier periodisk – trigger kun én re-render per batch
    spawnTimerRef.current -= dt
    if (spawnTimerRef.current <= 0 && zombiePool.size < MAX_ZOMBIES) {
      spawnTimerRef.current = SPAWN_INTERVAL
      let spawned = false
      for (let i = 0; i < SPAWN_BATCH; i++) {
        const entity = spawnZombie(_playerPos.x, _playerPos.z)
        if (entity) {
          zombieListRef.current = [...zombieListRef.current, entity]
          spawned = true
        }
      }
      if (spawned) setRenderKey((k) => k + 1)
    }

    if (zombiePool.size !== prevZombieCount.current) {
      prevZombieCount.current = zombiePool.size
      useWorldStore.getState().setZombieCount(zombiePool.size)
    }
  })

  return (
    <>
      {zombieListRef.current.map((entity) => (
        <ZombieInstance
          key={entity.zombieId}
          entity={entity}
          onDespawn={despawnZombie}
        />
      ))}
    </>
  )
}
