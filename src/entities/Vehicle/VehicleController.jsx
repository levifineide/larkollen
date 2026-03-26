import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, CuboidCollider, useRapier, interactionGroups } from '@react-three/rapier'
import * as THREE from 'three'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useVehicleStore, activeVehicleBodyRef } from '../../stores/useVehicleStore'
import { inputState } from '../../systems/InputSystem'
import { SEA_LEVEL } from '../../world/terrainHeight'

// Kollisionsgrupper: spiller (1) og kjøretøy (2) kolliderer ALDRI.
const VEHICLE_COLLISION_GROUPS = interactionGroups([2], [0, 2])

const WATER_Y = SEA_LEVEL
const ENTER_RADIUS = 4

// Hjulposisjoner relativt til chassis-senter [x, y, z]
// Positive Z = front, negative Z = bak
const CONFIGS = {
  car: {
    maxEngineForce: 600,
    maxBrakeForce: 80,
    maxSteerAngle: 0.3,
    suspensionStiffness: 30,
    suspensionDamping: 4.0,
    suspensionCompression: 2.0,
    suspensionRestLength: 0.3,
    suspensionTravel: 0.2,
    frictionSlip: 2.5,
    wheelRadius: 0.35,
    fuelDrain: 8,
    w: 2.0, h: 0.8, d: 4.2,
    color: '#e63946', cabColor: '#c1121f',
    collider: [1.0, 0.4, 2.1],
    density: 1.0,
    wheels: [
      [-0.85, -0.15, 1.3],   // front-left
      [0.85, -0.15, 1.3],    // front-right
      [-0.85, -0.15, -1.3],  // rear-left
      [0.85, -0.15, -1.3],   // rear-right
    ],
    steerWheels: [0, 1],
    driveWheels: [2, 3],
  },
  truck: {
    maxEngineForce: 900,
    maxBrakeForce: 120,
    maxSteerAngle: 0.35,
    suspensionStiffness: 40,
    suspensionDamping: 5.0,
    suspensionCompression: 3.0,
    suspensionRestLength: 0.35,
    suspensionTravel: 0.25,
    frictionSlip: 3.0,
    wheelRadius: 0.45,
    fuelDrain: 10,
    w: 2.4, h: 1.0, d: 5.2,
    color: '#457b9d', cabColor: '#1d3557',
    collider: [1.2, 0.5, 2.6],
    density: 1.2,
    wheels: [
      [-1.0, -0.15, 1.6],
      [1.0, -0.15, 1.6],
      [-1.0, -0.15, -1.6],
      [1.0, -0.15, -1.6],
    ],
    steerWheels: [0, 1],
    driveWheels: [2, 3],
  },
  boat: {
    thrust: 18,
    maxSpeed: 10,
    steerPower: 0.5,
    fuelDrain: 5,
    w: 2.0, h: 0.6, d: 5.0,
    color: '#2a9d8f', cabColor: null,
    collider: [1.0, 0.3, 2.5],
    density: 0.5,
  },
}

const SUSP_DIR = { x: 0, y: -1, z: 0 }
const AXLE_DIR = { x: -1, y: 0, z: 0 }

export default function VehicleController({ id, type, startPos }) {
  const bodyRef = useRef(null)
  const vehicleRef = useRef(null)    // Rapier DynamicRayCastVehicleController
  const prevEnterExit = useRef(false)
  const fuelRef = useRef(100)
  const smoothSteerRef = useRef(0)
  const healthRef = useRef(100)
  const lastCollisionSpeed = useRef(0)
  const damageColorRef = useRef(null)
  const explosionDone = useRef(false)

  const { world, rapier } = useRapier()
  const cfg = CONFIGS[type]
  const isBoat = type === 'boat'

  useFrame((_, delta) => {
    const rb = bodyRef.current
    if (!rb) return

    // Sjekk om kjøretøyet er eksplodert
    if (explosionDone.current) return

    const pos = rb.translation()

    // ── Kollisjonsskade – sjekk horisontalt fart-endring ──────────────
    const vel = rb.linvel()
    // Ignorer vertikal hastighet (Y) – kun horisontal kollisjon teller
    const hSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z)
    const hSpeedDelta = Math.abs(lastCollisionSpeed.current - hSpeed)
    lastCollisionSpeed.current = hSpeed

    // Stor horisontal fart-endring = kollisjon (terskel 12 for å unngå falsk utløsning)
    if (hSpeedDelta > 12) {
      const dmg = (hSpeedDelta - 12) * 2
      healthRef.current = Math.max(0, healthRef.current - dmg)
      useVehicleStore.getState().setHealth(id, healthRef.current)

      if (healthRef.current <= 0 && !explosionDone.current) {
        triggerExplosion(rb, id, pos)
        explosionDone.current = true
        return
      }
    }

    // ── Båt: ingen gravitasjon, klem til vannflaten ─────────────────────
    if (isBoat) {
      rb.setGravityScale(0, true)
      // Hold båten på vannoverflaten – null ut vertikal hastighet og korriger posisjon
      const vel = rb.linvel()
      rb.setLinvel({ x: vel.x, y: 0, z: vel.z }, true)
      if (Math.abs(pos.y - (WATER_Y - 0.15)) > 0.02) {
        rb.setTranslation({ x: pos.x, y: WATER_Y - 0.15, z: pos.z }, true)
      }

      // Stopp all bevegelse når ingen kjører
      const activeId0 = useVehicleStore.getState().activeId
      if (activeId0 !== id) {
        rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
        rb.setAngvel({ x: 0, y: 0, z: 0 }, true)
      }
    }

    // ── Lazy init: Rapier RaycastVehicleController (bil/lastebil) ──────
    if (!isBoat && !vehicleRef.current) {
      const vc = new rapier.DynamicRayCastVehicleController(
        rb, world.bodies, world.colliders, world.queryPipeline
      )
      for (const wp of cfg.wheels) {
        vc.addWheel(
          { x: wp[0], y: wp[1], z: wp[2] },
          SUSP_DIR, AXLE_DIR,
          cfg.suspensionRestLength, cfg.wheelRadius
        )
      }
      for (let i = 0; i < cfg.wheels.length; i++) {
        vc.setWheelSuspensionStiffness(i, cfg.suspensionStiffness)
        vc.setWheelMaxSuspensionTravel(i, cfg.suspensionTravel)
        vc.setWheelSuspensionCompression(i, cfg.suspensionCompression)
        vc.setWheelSuspensionRelaxation(i, cfg.suspensionDamping)
        vc.setWheelFrictionSlip(i, cfg.frictionSlip)
      }
      vehicleRef.current = vc
    }

    // ── Enter / exit ────────────────────────────────────────────────────
    const enterNow = inputState.enterExit
    const justPressed = enterNow && !prevEnterExit.current
    prevEnterExit.current = enterNow

    const activeId = useVehicleStore.getState().activeId

    if (justPressed) {
      if (activeId === id) {
        // Forlat
        useVehicleStore.getState().clearActive()
        activeVehicleBodyRef.current = null
        usePlayerStore.getState().setDriving(null)
        const rot = rb.rotation()
        const yaw = 2 * Math.atan2(rot.y, rot.w)
        usePlayerStore.getState().setPendingTeleport([
          pos.x + Math.sin(yaw + Math.PI / 2) * 3.5,
          pos.y + 1.5,
          pos.z + Math.cos(yaw + Math.PI / 2) * 3.5,
        ])
      } else if (activeId === null) {
        // Gå inn
        const pp = usePlayerStore.getState().position
        const dx = pos.x - pp[0], dz = pos.z - pp[2]
        if (Math.sqrt(dx * dx + dz * dz) < ENTER_RADIUS) {
          usePlayerStore.getState().setPendingTeleport([0, -100, 0])
          useVehicleStore.getState().setActive(id)
          activeVehicleBodyRef.current = rb
          usePlayerStore.getState().setDriving(id)
        }
      }
    }

    if (activeId !== id) return

    // ── Drivstoff ────────────────────────────────────────────────────────
    const throttle = inputState.forward ? 1 : inputState.backward ? -0.5 : 0
    const steerTarget = inputState.left ? 1 : inputState.right ? -1 : 0
    if (steerTarget === 0) {
      // Øyeblikkelig retur til sentrum
      smoothSteerRef.current = 0
    } else {
      // Gradvis påføring av styring
      smoothSteerRef.current += (steerTarget - smoothSteerRef.current) * Math.min(1, 6 * delta)
    }
    const steer = smoothSteerRef.current

    if (Math.abs(throttle) > 0.01 && fuelRef.current > 0) {
      fuelRef.current = Math.max(0, fuelRef.current - cfg.fuelDrain * delta)
      useVehicleStore.getState().setFuel(id, fuelRef.current)
    }

    // ── Kjøretøy-oppdatering ─────────────────────────────────────────────
    if (isBoat) {
      updateBoat(rb, throttle, steer, cfg, fuelRef.current, delta)
    } else {
      updateWheeledVehicle(vehicleRef.current, rb, throttle, steer, cfg, fuelRef.current, world)
    }

    activeVehicleBodyRef.current = rb
  })

  return (
    <RigidBody
      ref={bodyRef}
      type="dynamic"
      position={startPos}
      linearDamping={isBoat ? 1.5 : 0}
      angularDamping={isBoat ? 4 : 5}
      enabledRotations={[false, true, false]}
      colliders={false}
    >
      <CuboidCollider
        args={cfg.collider}
        density={cfg.density}
        collisionGroups={VEHICLE_COLLISION_GROUPS}
      />
      <VehicleMesh type={type} cfg={cfg} />
    </RigidBody>
  )
}

// ── Rapier RaycastVehicle – bil/lastebil ────────────────────────────────────

function updateWheeledVehicle(vc, rb, throttle, steer, cfg, fuel, world) {
  if (!vc) return

  const hasFuel = fuel > 0

  // Motorkraft på drivhjul
  for (const wi of cfg.driveWheels) {
    vc.setWheelEngineForce(wi, hasFuel ? throttle * cfg.maxEngineForce : 0)
  }

  // Styring på forhjul – reduser ved høy fart for å unngå spinn
  const vel = rb.linvel()
  const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z)
  const speedFactor = Math.max(0.25, 1.0 - speed / 25)
  for (const wi of cfg.steerWheels) {
    vc.setWheelSteering(wi, steer * cfg.maxSteerAngle * speedFactor)
  }

  // Brems: automatisk lett brems når ingen gass
  const brakeForce = Math.abs(throttle) < 0.05 ? cfg.maxBrakeForce * 0.3 : 0
  for (let i = 0; i < cfg.wheels.length; i++) {
    vc.setWheelBrake(i, brakeForce)
  }

  vc.updateVehicle(world.timestep)

  // Aktiv rotasjonsdemping ETTER vehicle update – stopp spinn når ingen styring
  if (Math.abs(steer) < 0.01) {
    const angvel = rb.angvel()
    rb.setAngvel({ x: angvel.x, y: angvel.y * 0.8, z: angvel.z }, true)
  }
}

// ── Enkel kraft-fysikk – båt ────────────────────────────────────────────────

const _fwd = new THREE.Vector3()
const _euler = new THREE.Euler(0, 0, 0, 'YXZ')

function updateBoat(rb, throttle, steer, cfg, fuel, delta) {
  const vel = rb.linvel()
  const rot = rb.rotation()
  const yaw = 2 * Math.atan2(rot.y, rot.w)
  const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z)

  if (Math.abs(throttle) > 0.01 && fuel > 0 && speed < cfg.maxSpeed) {
    _euler.set(0, yaw, 0)
    _fwd.set(0, 0, -1).applyEuler(_euler)
    rb.addForce({ x: _fwd.x * throttle * cfg.thrust, y: 0, z: _fwd.z * throttle * cfg.thrust }, true)
  }

  if (steer !== 0 && speed > 0.3) {
    const fwdX = -Math.sin(yaw), fwdZ = -Math.cos(yaw)
    const forwardSpeed = vel.x * fwdX + vel.z * fwdZ
    const dir = forwardSpeed >= 0 ? 1 : -1
    rb.setAngvel({ x: 0, y: steer * cfg.steerPower * dir, z: 0 }, true)
  } else if (steer === 0) {
    rb.setAngvel({ x: 0, y: 0, z: 0 }, true)
  }
}

// ── Eksplosjon ──────────────────────────────────────────────────────────────

function triggerExplosion(rb, id, pos) {
  // Stopp kjøretøyet
  rb.setLinvel({ x: 0, y: 8, z: 0 }, true)
  rb.setAngvel({ x: (Math.random() - 0.5) * 5, y: (Math.random() - 0.5) * 5, z: (Math.random() - 0.5) * 5 }, true)

  // Kast spilleren ut hvis de sitter i
  const activeId = useVehicleStore.getState().activeId
  if (activeId === id) {
    useVehicleStore.getState().clearActive()
    activeVehicleBodyRef.current = null
    usePlayerStore.getState().setDriving(null)
    usePlayerStore.getState().setPendingTeleport([pos.x + 4, pos.y + 2, pos.z + 4])
    usePlayerStore.getState().takeDamage(30)
  }

  useVehicleStore.getState().setExploded(id)

  // Screen shake via global event
  window.__screenShake = 1.0
}

// ── Radialkraft fra eksplosjon (brukes av granater og kjøretøy) ────────────
// zombiePool importeres dynamisk for å unngå sirkulær import
export function applyRadialForce(center, radius, forceDamage, zombiePoolRef) {
  if (!zombiePoolRef) return
  for (const [, entity] of zombiePoolRef) {
    if (entity.health <= 0) continue
    const dx = entity.position.x - center.x
    const dz = entity.position.z - center.z
    const distSq = dx * dx + dz * dz
    if (distSq < radius * radius) {
      const dist = Math.sqrt(distSq) || 1
      const falloff = 1 - dist / radius
      entity.takeDamage(forceDamage * falloff)
    }
  }
}

// ── Visuelle komponenter ────────────────────────────────────────────────────

function VehicleMesh({ type, cfg }) {
  return (
    <group>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[cfg.w, cfg.h, cfg.d]} />
        <meshStandardMaterial color={cfg.color} />
      </mesh>
      {cfg.cabColor && (
        <mesh castShadow position={[0, cfg.h * 0.88, cfg.d * 0.05]}>
          <boxGeometry args={[cfg.w * 0.82, cfg.h * 0.72, cfg.d * 0.46]} />
          <meshStandardMaterial color={cfg.cabColor} />
        </mesh>
      )}
      {type !== 'boat' && <Wheels cfg={cfg} />}
      {type === 'boat' && <BoatDetails cfg={cfg} />}
    </group>
  )
}

function Wheels({ cfg }) {
  const r = cfg.wheelRadius
  const w = 0.28
  return (
    <>
      {cfg.wheels.map((p, i) => (
        <mesh key={i} position={p} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[r, r, w, 12]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      ))}
    </>
  )
}

function BoatDetails({ cfg }) {
  return (
    <>
      <mesh position={[0, cfg.h * 0.52, 0]}>
        <boxGeometry args={[cfg.w + 0.1, 0.08, cfg.d]} />
        <meshStandardMaterial color="#5c4033" />
      </mesh>
      <mesh position={[0, cfg.h + 1.2, -cfg.d * 0.3]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 2.5, 6]} />
        <meshStandardMaterial color="#8B4513" />
      </mesh>
    </>
  )
}
