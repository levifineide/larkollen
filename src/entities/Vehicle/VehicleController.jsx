import { useRef, useEffect, Suspense } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, CuboidCollider, useRapier, interactionGroups } from '@react-three/rapier'
import { useGLTF, Clone } from '@react-three/drei'
import * as THREE from 'three'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useVehicleStore, activeVehicleBodyRef, VEHICLE_SMOKE_THRESHOLD, VEHICLE_FLAME_THRESHOLD } from '../../stores/useVehicleStore'
import { inputState } from '../../systems/InputSystem'
import { SEA_LEVEL } from '../../world/terrainHeight'
import { audioManager } from '../../systems/AudioSystem'

// Preload alle bilmodeller
const MODEL_PATHS = {
  car: '/models/car.glb',
  suv: '/models/suv.glb',
  police: '/models/police.glb',
  taxi: '/models/taxi.glb',
}
Object.values(MODEL_PATHS).forEach(p => useGLTF.preload(p))

// Kollisionsgrupper
const VEHICLE_COLLISION_GROUPS = interactionGroups([2], [0, 2])

const WATER_Y = SEA_LEVEL
const ENTER_RADIUS = 4
const MODEL_SCALE = 1.6

// Farger for fallback-bokser (brukes om GLB feiler)
const FALLBACK_COLORS = {
  car: '#e63946',
  suv: '#457b9d',
  police: '#1d3a6e',
  taxi: '#f4a261',
}

const CAR_CONFIG = {
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
  collider: [1.0, 0.55, 2.0],
  density: 1.0,
  wheels: [
    [-0.85, -0.35, 1.3],
    [0.85, -0.35, 1.3],
    [-0.85, -0.35, -1.3],
    [0.85, -0.35, -1.3],
  ],
  steerWheels: [0, 1],
  driveWheels: [2, 3],
}

const BOAT_CONFIG = {
  thrust: 18,
  maxSpeed: 10,
  steerPower: 0.5,
  fuelDrain: 5,
  collider: [1.0, 0.3, 2.5],
  density: 0.5,
}

const SUSP_DIR = { x: 0, y: -1, z: 0 }
const AXLE_DIR = { x: -1, y: 0, z: 0 }

export default function VehicleController({ id, type, model, startPos }) {
  const bodyRef = useRef(null)
  const vehicleRef = useRef(null)
  const prevEnterExit = useRef(false)
  const fuelRef = useRef(100)
  const smoothSteerRef = useRef(0)
  const healthRef = useRef(100)
  const lastCollisionSpeed = useRef(0)
  const explosionDone = useRef(false)
  const wheelSpinAngle = useRef(0)
  const lastCrashSoundTime = useRef(0)

  const { world, rapier } = useRapier()
  const isBoat = type === 'boat'
  const cfg = isBoat ? BOAT_CONFIG : CAR_CONFIG

  // Registrer kjøretøy i store
  useEffect(() => {
    useVehicleStore.getState().registerVehicle(id)
    console.log(`[Vehicle] ${id} (${type}/${model}) spawned at [${startPos}]`)
  }, [id, type, model, startPos])

  useFrame((state, delta) => {
    const rb = bodyRef.current
    if (!rb) return
    if (explosionDone.current) return

    const pos = rb.translation()
    const vel = rb.linvel()
    const hSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z)
    const hSpeedDelta = Math.abs(lastCollisionSpeed.current - hSpeed)
    lastCollisionSpeed.current = hSpeed

    // Kollisjonsskade
    if (hSpeedDelta > 8 && !isBoat) {
      const dmg = (hSpeedDelta - 8) * 2.5
      healthRef.current = Math.max(0, healthRef.current - dmg)
      useVehicleStore.getState().setHealth(id, healthRef.current)

      const now = state.clock.elapsedTime
      if (now - lastCrashSoundTime.current > 0.5) {
        lastCrashSoundTime.current = now
        audioManager.play('car_crash')
        if (hSpeedDelta > 15) audioManager.play('car_window_break')
      }

      if (healthRef.current <= 0 && !explosionDone.current) {
        triggerExplosion(rb, id, pos)
        explosionDone.current = true
        return
      }
    }

    // Båt-fysikk
    if (isBoat) {
      rb.setGravityScale(0, true)
      const bvel = rb.linvel()
      rb.setLinvel({ x: bvel.x, y: 0, z: bvel.z }, true)
      if (Math.abs(pos.y - (WATER_Y - 0.15)) > 0.02) {
        rb.setTranslation({ x: pos.x, y: WATER_Y - 0.15, z: pos.z }, true)
      }
      if (useVehicleStore.getState().activeId !== id) {
        rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
        rb.setAngvel({ x: 0, y: 0, z: 0 }, true)
      }
    }

    // Lazy init RaycastVehicleController
    if (!isBoat && !vehicleRef.current) {
      try {
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
      } catch (err) {
        console.warn(`[Vehicle ${id}] Failed to init vehicle controller:`, err)
      }
    }

    // Hjul spin-vinkel
    if (!isBoat) {
      const direction = (inputState.backward && !inputState.forward) ? -1 : 1
      wheelSpinAngle.current += hSpeed * delta * 3.0 * direction
    }

    // Enter / exit
    const enterNow = inputState.enterExit
    const justPressed = enterNow && !prevEnterExit.current
    prevEnterExit.current = enterNow

    const activeId = useVehicleStore.getState().activeId

    if (justPressed) {
      if (activeId === id) {
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
        audioManager.stopEngine()
      } else if (activeId === null) {
        const pp = usePlayerStore.getState().position
        const dx = pos.x - pp[0], dz = pos.z - pp[2]
        if (Math.sqrt(dx * dx + dz * dz) < ENTER_RADIUS) {
          usePlayerStore.getState().setPendingTeleport([0, -100, 0])
          useVehicleStore.getState().setActive(id)
          activeVehicleBodyRef.current = rb
          usePlayerStore.getState().setDriving(id)
          audioManager.startEngine()
        }
      }
    }

    if (activeId !== id) return

    // Drivstoff og styring
    const throttle = inputState.forward ? 1 : inputState.backward ? -0.5 : 0
    const steerTarget = inputState.left ? 1 : inputState.right ? -1 : 0
    if (steerTarget === 0) {
      smoothSteerRef.current = 0
    } else {
      smoothSteerRef.current += (steerTarget - smoothSteerRef.current) * Math.min(1, 6 * delta)
    }
    const steer = smoothSteerRef.current

    if (Math.abs(throttle) > 0.01 && fuelRef.current > 0) {
      fuelRef.current = Math.max(0, fuelRef.current - cfg.fuelDrain * delta)
      useVehicleStore.getState().setFuel(id, fuelRef.current)
    }

    // Motor pitch
    audioManager.setEngineRate(0.6 + Math.min(1, hSpeed / 20) * 1.2)

    // Dekk-skrik
    if (Math.abs(steer) > 0.7 && hSpeed > 8 && !window.__tireScreechPlaying) {
      window.__tireScreechPlaying = true
      audioManager.play('tire_screech')
      setTimeout(() => { window.__tireScreechPlaying = false }, 800)
    }

    // Horn (H-tast)
    if (inputState.horn && !window.__hornPlaying) {
      window.__hornPlaying = true
      audioManager.play('car_horn')
      setTimeout(() => { window.__hornPlaying = false }, 500)
    }

    // Oppdater fysikk
    if (isBoat) {
      updateBoat(rb, throttle, steer, cfg, fuelRef.current, delta)
    } else {
      updateWheeledVehicle(vehicleRef.current, rb, throttle, steer, cfg, fuelRef.current, world)
    }

    activeVehicleBodyRef.current = rb
  })

  const modelPath = model ? MODEL_PATHS[model] : null

  return (
    <RigidBody
      ref={bodyRef}
      type="dynamic"
      position={startPos}
      linearDamping={isBoat ? 1.5 : 0.1}
      angularDamping={isBoat ? 4 : 3}
      enabledRotations={isBoat ? [false, true, false] : [true, true, true]}
      colliders={false}
    >
      <CuboidCollider
        args={cfg.collider}
        density={cfg.density}
        collisionGroups={VEHICLE_COLLISION_GROUPS}
      />
      {isBoat ? (
        <BoatMesh />
      ) : (
        <CarMesh model={model} modelPath={modelPath} />
      )}
    </RigidBody>
  )
}

// -- Bil-mesh: GLB med Suspense-fallback til boks --
function CarMesh({ model, modelPath }) {
  const color = FALLBACK_COLORS[model] || '#e63946'

  if (!modelPath) return <CarBoxMesh color={color} />

  return (
    <Suspense fallback={<CarBoxMesh color={color} />}>
      <CarGLBMesh modelPath={modelPath} />
    </Suspense>
  )
}

function CarGLBMesh({ modelPath }) {
  const { scene } = useGLTF(modelPath)
  return (
    <Clone
      object={scene}
      scale={[MODEL_SCALE, MODEL_SCALE, MODEL_SCALE]}
      position={[0, -0.45, 0]}
      rotation={[0, Math.PI, 0]}
      castShadow
      receiveShadow
    />
  )
}

function CarBoxMesh({ color }) {
  return (
    <group>
      {/* Karosseri */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[2.0, 0.8, 4.2]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* Kabin */}
      <mesh castShadow position={[0, 0.7, 0.2]}>
        <boxGeometry args={[1.6, 0.6, 1.9]} />
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.7} />
      </mesh>
      {/* Hjul */}
      {[[-0.85, -0.35, 1.3], [0.85, -0.35, 1.3], [-0.85, -0.35, -1.3], [0.85, -0.35, -1.3]].map((p, i) => (
        <mesh key={i} position={p} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.35, 0.35, 0.28, 12]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      ))}
    </group>
  )
}

// -- Båt-mesh --
function BoatMesh() {
  return (
    <group>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[2.0, 0.6, 5.0]} />
        <meshStandardMaterial color="#2a9d8f" />
      </mesh>
      <mesh position={[0, 0.32, 0]}>
        <boxGeometry args={[2.1, 0.08, 5.0]} />
        <meshStandardMaterial color="#5c4033" />
      </mesh>
      <mesh position={[0, 1.8, -1.5]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 2.5, 6]} />
        <meshStandardMaterial color="#8B4513" />
      </mesh>
    </group>
  )
}

// -- Rapier vehicle physics --

function updateWheeledVehicle(vc, rb, throttle, steer, cfg, fuel, world) {
  if (!vc) return

  const hasFuel = fuel > 0

  for (const wi of cfg.driveWheels) {
    vc.setWheelEngineForce(wi, hasFuel ? throttle * cfg.maxEngineForce : 0)
  }

  const vel = rb.linvel()
  const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z)
  const speedFactor = Math.max(0.25, 1.0 - speed / 25)
  for (const wi of cfg.steerWheels) {
    vc.setWheelSteering(wi, steer * cfg.maxSteerAngle * speedFactor)
  }

  const brakeForce = Math.abs(throttle) < 0.05 ? cfg.maxBrakeForce * 0.3 : 0
  for (let i = 0; i < cfg.wheels.length; i++) {
    vc.setWheelBrake(i, brakeForce)
  }

  vc.updateVehicle(world.timestep)

  if (Math.abs(steer) < 0.01) {
    const angvel = rb.angvel()
    rb.setAngvel({ x: angvel.x, y: angvel.y * 0.8, z: angvel.z }, true)
  }
}

// -- Båt-fysikk --

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

// -- Eksplosjon --

function triggerExplosion(rb, id, pos) {
  rb.setLinvel({ x: 0, y: 8, z: 0 }, true)
  rb.setAngvel({
    x: (Math.random() - 0.5) * 5,
    y: (Math.random() - 0.5) * 5,
    z: (Math.random() - 0.5) * 5,
  }, true)

  const activeId = useVehicleStore.getState().activeId
  if (activeId === id) {
    useVehicleStore.getState().clearActive()
    activeVehicleBodyRef.current = null
    usePlayerStore.getState().setDriving(null)
    usePlayerStore.getState().setPendingTeleport([pos.x + 4, pos.y + 2, pos.z + 4])
    usePlayerStore.getState().takeDamage(30)
    audioManager.stopEngine()
  }

  audioManager.play('explosion')
  audioManager.play('car_crash')
  useVehicleStore.getState().setExploded(id)
  window.__screenShake = 1.0
}

// -- Radialkraft fra eksplosjon --
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
