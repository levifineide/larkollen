import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { usePlayerStore } from '../stores/usePlayerStore'
import { activeVehicleBodyRef } from '../stores/useVehicleStore'
import { inputState } from './InputSystem'
import * as THREE from 'three'

const CAMERA_DISTANCE = 6
const CAMERA_HEIGHT = 2.5
const PITCH_MIN = -0.4
const PITCH_MAX = 1.0
const YAW_SENSITIVITY = 0.003
const PITCH_SENSITIVITY = 0.003
const KEYBOARD_TURN_SPEED = 2.0  // rad/sek med Q/E
const SMOOTH_FACTOR = 8

// Aim-modus: over-the-shoulder
const AIM_DISTANCE = 2.5
const AIM_HEIGHT = 1.5
const AIM_OFFSET_X = 0.6  // offset til høyre skulder

const _targetPos    = new THREE.Vector3()
const _cameraPos    = new THREE.Vector3()
const _lerpTarget   = new THREE.Vector3()

export default function CameraSystem({ cameraYaw, cameraPitch }) {
  const { camera } = useThree()
  const posRef = useRef(new THREE.Vector3(0, 2, 0))
  const isRightMouseDown = useRef(false)

  useEffect(() => {
    const onMouseDown = (e) => { if (e.button === 2) isRightMouseDown.current = true }
    const onMouseUp   = (e) => { if (e.button === 2) isRightMouseDown.current = false }
    const onContextMenu = (e) => e.preventDefault()

    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('contextmenu', onContextMenu)

    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('contextmenu', onContextMenu)
    }
  }, [])

  useFrame((_, delta) => {
    // ── Recoil fra CombatSystem ────────────────────────────────────────────
    if (window.__recoilPitch) {
      cameraPitch.current += window.__recoilPitch
      window.__recoilPitch = 0
    }

    // Mus-rotasjon: alltid aktiv ved pointer lock, ellers kun ved høyre museknapp
    if (isRightMouseDown.current || inputState.pointerLocked) {
      cameraYaw.current   -= inputState.mouseDeltaX * YAW_SENSITIVITY
      cameraPitch.current += inputState.mouseDeltaY * PITCH_SENSITIVITY
      cameraPitch.current = Math.max(PITCH_MIN, Math.min(PITCH_MAX, cameraPitch.current))
    }
    inputState.mouseDeltaX = 0
    inputState.mouseDeltaY = 0

    // Tastatur-rotasjon med Q / E
    if (inputState.turnCameraLeft)  cameraYaw.current += KEYBOARD_TURN_SPEED * delta
    if (inputState.turnCameraRight) cameraYaw.current -= KEYBOARD_TURN_SPEED * delta

    // Følg kjøretøy hvis spilleren kjører, ellers spiller
    const { isDriving, isAiming, position: playerPos } = usePlayerStore.getState()
    let tx, ty, tz
    if (isDriving && activeVehicleBodyRef.current) {
      const vpos = activeVehicleBodyRef.current.translation()
      tx = vpos.x; ty = vpos.y; tz = vpos.z
    } else {
      tx = playerPos[0]; ty = playerPos[1]; tz = playerPos[2]
    }
    _lerpTarget.set(tx, ty + 1.0, tz)
    posRef.current.lerp(_lerpTarget, Math.min(1, SMOOTH_FACTOR * delta))

    // Ønsket kameraposisjon – aim-modus = tettere + over skulder
    const yaw   = cameraYaw.current
    const pitch = cameraPitch.current
    const useAim = isAiming && !isDriving
    const dist   = useAim ? AIM_DISTANCE : CAMERA_DISTANCE
    const height = useAim ? AIM_HEIGHT : CAMERA_HEIGHT

    _targetPos.copy(posRef.current)

    _cameraPos.set(
      _targetPos.x + dist * Math.sin(yaw) * Math.cos(pitch),
      _targetPos.y + dist * Math.sin(pitch) + height,
      _targetPos.z + dist * Math.cos(yaw) * Math.cos(pitch)
    )

    // Over-the-shoulder offset ved aiming
    if (useAim) {
      const rightX = Math.cos(yaw)
      const rightZ = -Math.sin(yaw)
      _cameraPos.x += rightX * AIM_OFFSET_X
      _cameraPos.z += rightZ * AIM_OFFSET_X
    }

    // ── Screen shake ─────────────────────────────────────────────────────
    if (window.__screenShake && window.__screenShake > 0.01) {
      const intensity = window.__screenShake
      _cameraPos.x += (Math.random() - 0.5) * intensity * 0.5
      _cameraPos.y += (Math.random() - 0.5) * intensity * 0.3
      _cameraPos.z += (Math.random() - 0.5) * intensity * 0.5
      window.__screenShake *= 0.9 // Damp
    }

    // Beskytt mot NaN
    if (isNaN(_cameraPos.x) || isNaN(_cameraPos.y) || isNaN(_cameraPos.z)) return
    if (isNaN(_targetPos.x) || isNaN(_targetPos.y) || isNaN(_targetPos.z)) return

    // Sett endelig kameraposisjon
    camera.position.copy(_cameraPos)
    camera.up.set(0, 1, 0) // Forhindre kamera-flip
    camera.lookAt(_targetPos)
  })

  return null
}
