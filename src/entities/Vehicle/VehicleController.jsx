import { useRef, useMemo, useEffect, forwardRef, useImperativeHandle } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, CuboidCollider, useRapier, interactionGroups } from '@react-three/rapier'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useVehicleStore, activeVehicleBodyRef, VEHICLE_SMOKE_THRESHOLD, VEHICLE_FLAME_THRESHOLD } from '../../stores/useVehicleStore'
import { inputState } from '../../systems/InputSystem'
import { SEA_LEVEL } from '../../world/terrainHeight'
import { audioManager } from '../../systems/AudioSystem'

// Preload modeller
useGLTF.preload('/models/car.glb')
useGLTF.preload('/models/suv.glb')
useGLTF.preload('/models/police.glb')

// Kollisionsgrupper: spiller (1) og kjøretøy (2) kolliderer ALDRI.
const VEHICLE_COLLISION_GROUPS = interactionGroups([2], [0, 2])

const WATER_Y = SEA_LEVEL
const ENTER_RADIUS = 4

// Kenney-modeller bounding box: ~1.3×1.1×2.55 (meter).
// Skaler opp 1.6x for å matche realistisk bilstørrelse (~2.1×1.8×4.1m).
const MODEL_SCALE = 1.6

// Modell-konfigurasjon per type
const MODEL_MAP = {
  car: '/models/car.glb',
  truck: '/models/suv.glb',    // SUV som lastebil
  boat: null,                   // Båt bruker fortsatt prosedyrell mesh
}

// Hjulposisjoner relativt til chassis-senter [x, y, z]
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
    collider: [1.0, 0.55, 2.0],
    density: 1.0,
    wheels: [
      [-0.85, -0.35, 1.3],   // front-left
      [0.85, -0.35, 1.3],    // front-right
      [-0.85, -0.35, -1.3],  // rear-left
      [0.85, -0.35, -1.3],   // rear-right
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
    collider: [1.2, 0.6, 2.6],
    density: 1.2,
    wheels: [
      [-1.0, -0.35, 1.6],
      [1.0, -0.35, 1.6],
      [-1.0, -0.35, -1.6],
      [1.0, -0.35, -1.6],
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
    collider: [1.0, 0.3, 2.5],
    density: 0.5,
  },
}

const SUSP_DIR = { x: 0, y: -1, z: 0 }
const AXLE_DIR = { x: -1, y: 0, z: 0 }

export default function VehicleController({ id, type, startPos }) {
  const bodyRef = useRef(null)
  const vehicleRef = useRef(null)
  const prevEnterExit = useRef(false)
  const fuelRef = useRef(100)
  const smoothSteerRef = useRef(0)
  const healthRef = useRef(100)
  const lastCollisionSpeed = useRef(0)
  const explosionDone = useRef(false)
  const wheelSpinAngle = useRef(0)
  const wheelNodesRef = useRef(null)
  const meshGroupRef = useRef(null)
  const smokeParticlesRef = useRef(null)
  const lastCrashSoundTime = useRef(0)

  const { world, rapier } = useRapier()
  const cfg = CONFIGS[type]
  const isBoat = type === 'boat'

  useFrame((state, delta) => {
    const rb = bodyRef.current
    if (!rb) return

    if (explosionDone.current) return

    const pos = rb.translation()

    // -- Kollisjonsskade --
    const vel = rb.linvel()
    const hSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z)
    const hSpeedDelta = Math.abs(lastCollisionSpeed.current - hSpeed)
    lastCollisionSpeed.current = hSpeed

    if (hSpeedDelta > 8) {
      const dmg = (hSpeedDelta - 8) * 2.5
      healthRef.current = Math.max(0, healthRef.current - dmg)
      useVehicleStore.getState().setHealth(id, healthRef.current)

      // Krasj-lyd
      const now = state.clock.elapsedTime
      if (now - lastCrashSoundTime.current > 0.5) {
        lastCrashSoundTime.current = now
        audioManager.play('car_crash')
        if (hSpeedDelta > 15) audioManager.play('car_window_break')
      }

      // Spawn debris ved hard krasj
      if (hSpeedDelta > 15 && smokeParticlesRef.current) {
        smokeParticlesRef.current.spawnBurst(6)
      }

      if (healthRef.current <= 0 && !explosionDone.current) {
        triggerExplosion(rb, id, pos)
        explosionDone.current = true
        return
      }
    }

    // -- Båt: ingen gravitasjon, klem til vannflaten --
    if (isBoat) {
      rb.setGravityScale(0, true)
      const bvel = rb.linvel()
      rb.setLinvel({ x: bvel.x, y: 0, z: bvel.z }, true)
      if (Math.abs(pos.y - (WATER_Y - 0.15)) > 0.02) {
        rb.setTranslation({ x: pos.x, y: WATER_Y - 0.15, z: pos.z }, true)
      }
      const activeId0 = useVehicleStore.getState().activeId
      if (activeId0 !== id) {
        rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
        rb.setAngvel({ x: 0, y: 0, z: 0 }, true)
      }
    }

    // -- Lazy init: Rapier RaycastVehicleController (bil/lastebil) --
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

    // -- Hjulanimasjon (visuell rotasjon basert på fart) --
    if (!isBoat && wheelNodesRef.current) {
      const speed = hSpeed
      const direction = (inputState.backward && !inputState.forward) ? -1 : 1
      wheelSpinAngle.current += speed * delta * 3.0 * direction
      const steerAngle = smoothSteerRef.current * (cfg.maxSteerAngle || 0.3)

      for (const wn of wheelNodesRef.current) {
        if (!wn.node) continue
        // Spin-rotasjon (X-aksen for rulling)
        wn.node.rotation.x = wheelSpinAngle.current
        // Styring for forhjul (Y-aksen)
        if (wn.isFront) {
          wn.node.rotation.y = steerAngle
        }
      }
    }

    // -- Skadevisualisering: røyk og flammefargetint --
    if (smokeParticlesRef.current) {
      smokeParticlesRef.current.update(delta, healthRef.current, pos)
    }

    // -- Enter / exit --
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
        // Stopp motorlyd
        audioManager.stopEngine()
      } else if (activeId === null) {
        // Gå inn
        const pp = usePlayerStore.getState().position
        const dx = pos.x - pp[0], dz = pos.z - pp[2]
        if (Math.sqrt(dx * dx + dz * dz) < ENTER_RADIUS) {
          usePlayerStore.getState().setPendingTeleport([0, -100, 0])
          useVehicleStore.getState().setActive(id)
          activeVehicleBodyRef.current = rb
          usePlayerStore.getState().setDriving(id)
          // Start motorlyd
          audioManager.startEngine()
        }
      }
    }

    if (activeId !== id) return

    // -- Drivstoff --
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

    // Motor pitch basert på fart
    const speedRatio = Math.min(1, hSpeed / 20)
    audioManager.setEngineRate(0.6 + speedRatio * 1.2)

    // Dekk-skrik ved hard sving i fart
    if (Math.abs(steer) > 0.7 && hSpeed > 8) {
      if (!window.__tireScreechPlaying) {
        window.__tireScreechPlaying = true
        audioManager.play('tire_screech')
        setTimeout(() => { window.__tireScreechPlaying = false }, 800)
      }
    }

    // Horn (H-tast)
    if (inputState.horn) {
      if (!window.__hornPlaying) {
        window.__hornPlaying = true
        audioManager.play('car_horn')
        setTimeout(() => { window.__hornPlaying = false }, 500)
      }
    }

    // -- Kjøretøy-oppdatering --
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
      <group ref={meshGroupRef}>
        {MODEL_MAP[type] ? (
          <VehicleGLBMesh
            type={type}
            modelPath={MODEL_MAP[type]}
            wheelNodesRef={wheelNodesRef}
            healthRef={healthRef}
          />
        ) : (
          <BoatMesh cfg={cfg} />
        )}
        {!isBoat && <SmokeAndFire ref={smokeParticlesRef} />}
      </group>
    </RigidBody>
  )
}

// -- GLB-basert bilmesh med hjulreferanser --

function VehicleGLBMesh({ type, modelPath, wheelNodesRef, healthRef }) {
  const { scene } = useGLTF(modelPath)
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true)
    // Aktiver skygger
    clone.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
        // Klon materialet slik at skadetint ikke påvirker andre instanser
        if (child.material) {
          child.material = child.material.clone()
        }
      }
    })
    return clone
  }, [scene])

  // Finn hjulnoder
  useEffect(() => {
    const wheels = []
    const wheelNames = {
      'wheel-front-left': true,
      'wheel-front-right': true,
      'wheel-back-left': false,
      'wheel-back-right': false,
    }
    clonedScene.traverse(child => {
      const name = child.name?.toLowerCase().replace(/_/g, '-')
      if (!name) return
      for (const [pattern, isFront] of Object.entries(wheelNames)) {
        if (name.includes(pattern) || name.includes(pattern.replace(/-/g, ''))) {
          wheels.push({ node: child, isFront })
        }
      }
    })
    wheelNodesRef.current = wheels
  }, [clonedScene, wheelNodesRef])

  // Skadetint per frame
  useFrame(() => {
    const health = healthRef.current
    const damageFactor = 1 - health / 100
    clonedScene.traverse(child => {
      if (child.isMesh && child.material) {
        // Mørkne og rødtint ved skade
        const baseColor = child.material.userData.originalColor
        if (!baseColor) {
          child.material.userData.originalColor = child.material.color.clone()
        }
        if (child.material.userData.originalColor) {
          const oc = child.material.userData.originalColor
          child.material.color.setRGB(
            oc.r * (1 - damageFactor * 0.5) + damageFactor * 0.3,
            oc.g * (1 - damageFactor * 0.7),
            oc.b * (1 - damageFactor * 0.7),
          )
        }
      }
    })
  })

  return (
    <primitive
      object={clonedScene}
      scale={[MODEL_SCALE, MODEL_SCALE, MODEL_SCALE]}
      position={[0, -0.45, 0]}
      rotation={[0, Math.PI, 0]}
    />
  )
}

// -- Røyk og flamme-partikler --

const SmokeAndFire = forwardRef(function SmokeAndFire(_, ref) {
  const MAX_PARTICLES = 30
  const meshRef = useRef()
  const particlesRef = useRef([])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const colorRef = useRef(new THREE.Color())

  useImperativeHandle(ref, () => ({
    update(delta, health, vehiclePos) {
      const particles = particlesRef.current
      const mesh = meshRef.current
      if (!mesh) return

      // Spawn røyk når helse er lav
      if (health < VEHICLE_SMOKE_THRESHOLD && Math.random() < 0.3) {
        spawnParticle(vehiclePos, health < VEHICLE_FLAME_THRESHOLD ? 'fire' : 'smoke')
      }

      // Oppdater eksisterende partikler
      let activeCount = 0
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        if (!p.alive) continue
        p.age += delta
        if (p.age > p.lifetime) {
          p.alive = false
          continue
        }
        const t = p.age / p.lifetime
        p.y += p.vy * delta
        p.x += (Math.random() - 0.5) * 0.5 * delta
        p.z += (Math.random() - 0.5) * 0.5 * delta
        p.vy += 1.5 * delta // stigende

        const scale = p.size * (1 + t * 2) * (1 - t * 0.3)
        dummy.position.set(p.x, p.y, p.z)
        dummy.scale.setScalar(scale)
        dummy.updateMatrix()
        mesh.setMatrixAt(activeCount, dummy.matrix)

        // Farge: røyk=grå, ild=oransje→rød
        if (p.type === 'fire') {
          colorRef.current.setRGB(1.0 - t * 0.5, 0.4 * (1 - t), 0)
        } else {
          const g = 0.3 + t * 0.3
          colorRef.current.setRGB(g, g, g)
        }
        mesh.setColorAt(activeCount, colorRef.current)
        activeCount++
      }

      // Skjul ubrukte instanser
      for (let i = activeCount; i < MAX_PARTICLES; i++) {
        dummy.position.set(0, -100, 0)
        dummy.scale.setScalar(0)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.count = activeCount
    },

    spawnBurst(count) {
      for (let i = 0; i < count; i++) {
        spawnParticle(
          { x: (Math.random() - 0.5) * 2, y: 0.5, z: (Math.random() - 0.5) * 2 },
          Math.random() > 0.5 ? 'fire' : 'debris'
        )
      }
    },
  }))

  function spawnParticle(pos, type) {
    const particles = particlesRef.current
    let p = particles.find(p => !p.alive)
    if (!p) {
      if (particles.length >= MAX_PARTICLES) return
      p = { alive: false }
      particles.push(p)
    }
    p.alive = true
    p.age = 0
    p.lifetime = type === 'fire' ? 0.4 + Math.random() * 0.4 : 1.0 + Math.random() * 1.5
    p.x = (pos.x || 0) + (Math.random() - 0.5) * 0.8
    p.y = (pos.y || 0.8) + Math.random() * 0.3
    p.z = (pos.z || 0) + (Math.random() - 0.5) * 0.8
    p.vy = 0.5 + Math.random() * 1.0
    p.size = type === 'fire' ? 0.1 + Math.random() * 0.15 : 0.15 + Math.random() * 0.2
    p.type = type
  }

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_PARTICLES]} frustumCulled={false}>
      <sphereGeometry args={[0.5, 6, 6]} />
      <meshBasicMaterial transparent opacity={0.6} depthWrite={false} />
    </instancedMesh>
  )
})

// -- Rapier RaycastVehicle - bil/lastebil --

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

// -- Enkel kraft-fysikk - bat --

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

// -- Bat-mesh (prosedyrell, uendret) --

function BoatMesh({ cfg }) {
  return (
    <group>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[cfg.w, cfg.h, cfg.d]} />
        <meshStandardMaterial color="#2a9d8f" />
      </mesh>
      <mesh position={[0, cfg.h * 0.52, 0]}>
        <boxGeometry args={[cfg.w + 0.1, 0.08, cfg.d]} />
        <meshStandardMaterial color="#5c4033" />
      </mesh>
      <mesh position={[0, cfg.h + 1.2, -cfg.d * 0.3]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 2.5, 6]} />
        <meshStandardMaterial color="#8B4513" />
      </mesh>
    </group>
  )
}
