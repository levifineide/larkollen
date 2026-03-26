import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { usePlayerStore } from '../stores/usePlayerStore'
import { inputState } from './InputSystem'
import { zombiePool } from './ZombieManager'
import weaponData from '../data/weapons.json'
import { queueProjectile } from './ProjectileSystem'

const _origin = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _spreadOffset = new THREE.Vector3()
const _toZombie = new THREE.Vector3()

// Slot-map for alle våpen (utvidet)
const SLOT_MAP = {
  1: 'pistol', 2: 'shotgun', 3: 'rifle', 4: 'ak47',
  5: 'molotov', 6: 'grenade', 7: 'crowbar',
}

export default function CombatSystem() {
  const { camera } = useThree()
  const fireCooldownRef = useRef(0)
  const reloadTimerRef = useRef(0)
  const wasShootingRef = useRef(false)

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const state = usePlayerStore.getState()
    const { activeWeapon, weapons, isDriving, isReloading } = state

    // Ikke skyt i kjøretøy
    if (isDriving) return

    const wConfig = weaponData[activeWeapon]
    if (!wConfig) return
    const wState = weapons[activeWeapon]
    if (!wState || !wState.unlocked) return

    // ── Våpenbytte ────────────────────────────────────────────────────────
    if (inputState.weaponSlot > 0) {
      const newWeapon = SLOT_MAP[inputState.weaponSlot]
      inputState.weaponSlot = 0
      if (newWeapon && newWeapon !== activeWeapon && weapons[newWeapon]?.unlocked) {
        state.setActiveWeapon(newWeapon)
        fireCooldownRef.current = 0.2 // kort bytte-forsinkelse
        reloadTimerRef.current = 0
        return
      }
    }

    // ── Aim ───────────────────────────────────────────────────────────────
    state.setIsAiming(inputState.aim)

    // ── Reload ────────────────────────────────────────────────────────────
    if (isReloading) {
      reloadTimerRef.current -= dt
      if (reloadTimerRef.current <= 0) {
        state.reloadWeapon(activeWeapon, wConfig.magSize)
      }
      return
    }

    if (inputState.reload && wConfig.magSize > 0 && wState.mag < wConfig.magSize && wState.reserve > 0) {
      state.setIsReloading(true)
      reloadTimerRef.current = wConfig.reloadTime
      return
    }

    // Auto-reload ved tomt magasin (ikke for prosjektiler – de bruker reserve direkte)
    if (wConfig.type !== 'projectile' && wConfig.magSize > 0 && wState.mag <= 0 && wState.reserve > 0) {
      state.setIsReloading(true)
      reloadTimerRef.current = wConfig.reloadTime
      return
    }

    // ── Fire cooldown ─────────────────────────────────────────────────────
    fireCooldownRef.current -= dt
    if (fireCooldownRef.current > 0) return

    // ── Skyt / Kast ─────────────────────────────────────────────────────
    const wantsToShoot = inputState.shoot
    const canShoot = wConfig.automatic ? wantsToShoot : (wantsToShoot && !wasShootingRef.current)
    wasShootingRef.current = wantsToShoot

    if (!canShoot) return

    // Bruk ammunisjon
    if (!state.consumeAmmo(activeWeapon)) return

    fireCooldownRef.current = wConfig.fireRate

    // ── Prosjektil-våpen (granat, molotov) ──────────────────────────────
    if (wConfig.type === 'projectile') {
      _origin.copy(camera.position)
      camera.getWorldDirection(_dir)
      queueProjectile(wConfig.subtype, _origin, _dir)

      // Auto-reload fra reserve for prosjektiler
      if (wState.reserve > 0) {
        state.reloadWeapon(activeWeapon, wConfig.magSize)
      }
      return
    }

    // ── Hitscan-våpen ───────────────────────────────────────────────────
    const pellets = wConfig.pellets || 1
    for (let p = 0; p < pellets; p++) {
      fireRay(camera, wConfig, state)
    }

    // Recoil – dytt kamera-pitch opp litt
    if (wConfig.recoil > 0) {
      window.__recoilPitch = (window.__recoilPitch || 0) - wConfig.recoil
    }
  })

  return null
}

// Enkel treff-sjekk mot zombie-poolen direkte (ingen scene-traversering)
function fireRay(camera, wConfig, state) {
  _origin.copy(camera.position)
  camera.getWorldDirection(_dir)

  // Legg til spredning
  if (wConfig.spread > 0) {
    const spread = state.isAiming ? wConfig.spread * 0.4 : wConfig.spread
    _spreadOffset.set(
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread,
    )
    _dir.add(_spreadOffset).normalize()
  }

  const rangeSq = wConfig.range * wConfig.range
  const HIT_RADIUS = 1.0 // treff-radius per zombie (meter)
  let closestDist = Infinity
  let closestEntity = null

  for (const [, entity] of zombiePool) {
    if (entity.health <= 0 || entity.frozen) continue

    _toZombie.set(entity.position.x, entity.position.y + 0.7, entity.position.z)
    _toZombie.sub(_origin)

    const distAlongRay = _toZombie.dot(_dir)
    if (distAlongRay < 0 || distAlongRay * distAlongRay > rangeSq) continue

    // Avstand fra ray-linje til zombie-senter
    const perpDistSq = _toZombie.lengthSq() - distAlongRay * distAlongRay
    if (perpDistSq < HIT_RADIUS * HIT_RADIUS && distAlongRay < closestDist) {
      closestDist = distAlongRay
      closestEntity = entity
    }
  }

  if (closestEntity) {
    closestEntity.takeDamage(wConfig.damage)
    if (closestEntity.health <= 0) {
      state.incrementKills()
    }
  }
}
