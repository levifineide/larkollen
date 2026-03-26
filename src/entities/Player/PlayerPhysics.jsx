import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, CapsuleCollider, useRapier, interactionGroups } from '@react-three/rapier'

// Spiller = gruppe 1, kolliderer kun med verden (gruppe 0) – IKKE kjøretøy (gruppe 2)
const PLAYER_COLLISION_GROUPS = interactionGroups([1], [0])
import { usePlayerStore } from '../../stores/usePlayerStore'
import { inputState } from '../../systems/InputSystem'
import PlayerMesh from './PlayerMesh'
import { getTerrainHeight, isTerrainReady } from '../../world/terrainHeight'
import * as THREE from 'three'

const WALK_SPEED   = 4.5
const SPRINT_SPEED = 9.0
const CROUCH_SPEED = 2.0
const JUMP_FORCE   = 8.0
const GRAVITY      = 22    // ekstra tyngdekraft (m/s²)
const STAMINA_DRAIN = 20   // per sekund
const STAMINA_REGEN = 10   // per sekund
const CAPSULE_HALF_H = 0.5
const CAPSULE_RADIUS = 0.3
const CAPSULE_OFFSET = CAPSULE_HALF_H + CAPSULE_RADIUS // 0.8 – avstand fra bakken til RB-senter

const _moveDir = new THREE.Vector3()
const _euler   = new THREE.Euler(0, 0, 0, 'YXZ')

export default function PlayerPhysics({ cameraYaw }) {
  const rigidBodyRef          = useRef(null)
  const characterControllerRef = useRef(null)
  const { world }             = useRapier()

  const vertVel    = useRef(0)
  const isJumping  = useRef(false)
  const canJump    = useRef(true)
  const meshRef    = useRef(null)
  const stamina    = useRef(100)
  const frameCount = useRef(0)
  const wasTerrainReady = useRef(false)

  // Cache store actions (stable references, no re-renders)
  const storeActions = useRef(null)
  if (!storeActions.current) {
    const s = usePlayerStore.getState()
    storeActions.current = {
      setPosition: s.setPosition,
      setIsSprinting: s.setIsSprinting,
      setIsCrouching: s.setIsCrouching,
      setStamina: s.setStamina,
    }
  }
  // Track previous values to avoid unnecessary Zustand updates
  const prevSprint = useRef(false)
  const prevCrouch = useRef(false)
  const prevStamina = useRef(100)

  useEffect(() => {
    const ctrl = world.createCharacterController(0.05)
    ctrl.setApplyImpulsesToDynamicBodies(true)
    ctrl.setSlideEnabled(true)
    ctrl.enableSnapToGround(0.5)
    ctrl.setMaxSlopeClimbAngle((45 * Math.PI) / 180)
    ctrl.setMinSlopeSlideAngle((30 * Math.PI) / 180)
    characterControllerRef.current = ctrl

    return () => {
      world.removeCharacterController(ctrl)
    }
  }, [world])

  useFrame((_, delta) => {
    const rb   = rigidBodyRef.current
    const ctrl = characterControllerRef.current
    if (!rb || !ctrl) return

    // ── Teleportering ved kjøretøy-exit ───────────────────────────────────
    const { pendingTeleport, setPendingTeleport } = usePlayerStore.getState()
    if (pendingTeleport) {
      rb.setNextKinematicTranslation({
        x: pendingTeleport[0],
        y: pendingTeleport[1],
        z: pendingTeleport[2],
      })
      setPendingTeleport(null)
      vertVel.current = 0
      isJumping.current = false
      return
    }

    // ── Deaktiver spillerbevegelse når i kjøretøy ─────────────────────────
    const isDriving = usePlayerStore.getState().isDriving
    if (meshRef.current) meshRef.current.visible = !isDriving
    if (isDriving) return

    const pos     = rb.translation()
    const onGround = ctrl.computedGrounded()
    const yaw     = cameraYaw?.current ?? 0
    frameCount.current++

    // Terreng-basert bakkesjekk – mer pålitelig enn Rapier computedGrounded med grov trimesh
    // Skip terrain clamping hvis vi venter på GLB-terreng (unngår snap til feil prosedyrell høyde)
    const terrainReady = isTerrainReady()

    // Teleporter spilleren til riktig høyde når GLB-terreng blir klart
    if (terrainReady && !wasTerrainReady.current) {
      wasTerrainReady.current = true
      const correctY = getTerrainHeight(pos.x, pos.z) + CAPSULE_OFFSET
      if (Math.abs(pos.y - correctY) > 2) {
        rb.setNextKinematicTranslation({ x: pos.x, y: correctY, z: pos.z })
        vertVel.current = 0
        isJumping.current = false
        return
      }
    }

    const terrainY = terrainReady ? getTerrainHeight(pos.x, pos.z) : pos.y - CAPSULE_OFFSET
    const groundY = terrainY + CAPSULE_OFFSET
    const terrainGrounded = terrainReady ? pos.y <= groundY + 0.15 : onGround

    // ── Bevegelsesretning ──────────────────────────────────────────────────
    _moveDir.set(0, 0, 0)
    if (inputState.forward)  _moveDir.z -= 1
    if (inputState.backward) _moveDir.z += 1
    if (inputState.left)     _moveDir.x -= 1
    if (inputState.right)    _moveDir.x += 1

    const isMoving = _moveDir.lengthSq() > 0
    if (isMoving) {
      _moveDir.normalize()
      _euler.set(0, yaw, 0)
      _moveDir.applyEuler(_euler)
    }

    // ── Sprint / crouch ────────────────────────────────────────────────────
    const isCrouching   = inputState.crouch
    const wantsToSprint = inputState.sprint && isMoving && !isCrouching

    let speed = WALK_SPEED
    if (isCrouching) {
      speed = CROUCH_SPEED
    } else if (wantsToSprint && stamina.current > 0) {
      speed = SPRINT_SPEED
      stamina.current = Math.max(0, stamina.current - STAMINA_DRAIN * delta)
    } else {
      stamina.current = Math.min(100, stamina.current + STAMINA_REGEN * delta)
    }
    // Only update Zustand when values actually change (prevents re-renders)
    const roundedStamina = Math.round(stamina.current)
    if (roundedStamina !== prevStamina.current) {
      prevStamina.current = roundedStamina
      storeActions.current.setStamina(stamina.current)
    }
    const nowSprinting = wantsToSprint && stamina.current > 0
    if (nowSprinting !== prevSprint.current) {
      prevSprint.current = nowSprinting
      storeActions.current.setIsSprinting(nowSprinting)
    }
    if (isCrouching !== prevCrouch.current) {
      prevCrouch.current = isCrouching
      storeActions.current.setIsCrouching(isCrouching)
    }

    // ── Vertikal hastighet / hopp (bruk terrainGrounded i stedet for Rapier) ──
    const effectiveGround = terrainGrounded || onGround

    if (effectiveGround && !isJumping.current) {
      vertVel.current = 0
      canJump.current = true
    } else {
      vertVel.current -= GRAVITY * delta
      if (effectiveGround && vertVel.current < 0) {
        vertVel.current   = 0
        isJumping.current = false
      }
    }

    if (inputState.jump && effectiveGround && canJump.current && !isJumping.current) {
      vertVel.current   = JUMP_FORCE
      canJump.current   = false
      isJumping.current = true
    }
    if (!inputState.jump) canJump.current = true

    // ── Bygg bevegelsesvektor og kjør controller ───────────────────────────
    const movement = {
      x: _moveDir.x * speed * delta,
      y: vertVel.current * delta,
      z: _moveDir.z * speed * delta,
    }

    const collider = rb.collider(0)
    if (!collider) return

    ctrl.computeColliderMovement(collider, movement, undefined, undefined, (col) => {
      return !col.isSensor()
    })

    const computed = ctrl.computedMovement()
    const newPos = {
      x: pos.x + computed.x,
      y: pos.y + computed.y,
      z: pos.z + computed.z,
    }

    // ── Terreng-klemming: sørg for at spilleren aldri flyter over bakken ──
    const newTerrainY = getTerrainHeight(newPos.x, newPos.z)
    const minY = newTerrainY + CAPSULE_OFFSET

    // Fall-through recovery
    if (newPos.y < newTerrainY - 3) {
      newPos.y = minY
      vertVel.current = 0
      isJumping.current = false
    }
    // Sveve-korreksjon: hvis ikke aktivt hopping oppover, klem til bakken
    else if (newPos.y < minY) {
      newPos.y = minY
      vertVel.current = 0
      isJumping.current = false
    }
    else if (!isJumping.current && vertVel.current <= 0 && newPos.y > minY + 0.15) {
      // Gradvis trekk ned til bakken i stedet for hard snap
      newPos.y = minY
      vertVel.current = 0
    }

    rb.setNextKinematicTranslation(newPos)

    // ── Drei mesh mot bevegelsesretning ────────────────────────────────────
    if (meshRef.current && isMoving) {
      const targetAngle  = Math.atan2(_moveDir.x, _moveDir.z) + Math.PI
      const currentAngle = meshRef.current.rotation.y
      const diff = ((targetAngle - currentAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI
      meshRef.current.rotation.y += diff * Math.min(1, 12 * delta)
    }

    storeActions.current.setPosition([newPos.x, newPos.y, newPos.z])
  })

  return (
    <RigidBody
      ref={rigidBodyRef}
      type="kinematicPosition"
      position={[0, 50, 0]}
      enabledRotations={[false, false, false]}
      colliders={false}
    >
      <CapsuleCollider args={[0.5, 0.3]} collisionGroups={PLAYER_COLLISION_GROUPS} />
      <group ref={meshRef}>
        <PlayerMesh />
      </group>
    </RigidBody>
  )
}
