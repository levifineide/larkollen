import { useEffect, useRef } from 'react'

// Singleton input state – leses direkte i useFrame (ingen React re-renders)
export const inputState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
  sprint: false,
  crouch: false,
  turnCameraLeft: false,
  turnCameraRight: false,
  enterExit: false,        // F-tast: gå inn/ut av kjøretøy
  interact: false,         // E-tast: snakk med NPC (delt med turnCameraRight)
  // Kamp-inputs
  shoot: false,            // Venstre museklikk
  aim: false,              // Høyre museklikk (hold)
  reload: false,           // R-tast
  weaponSlot: 0,           // 0 = ingen bytte, 1-7 = velg våpen
  weaponWheel: false,      // Q-tast (hold) – åpner våpenhjul
  mouseX: 0,
  mouseY: 0,
  mouseDeltaX: 0,
  mouseDeltaY: 0,
  pointerLocked: false,
}

const KEY_MAP = {
  KeyW: 'forward',     ArrowUp: 'forward',
  KeyS: 'backward',    ArrowDown: 'backward',
  KeyA: 'left',        ArrowLeft: 'left',
  KeyD: 'right',       ArrowRight: 'right',
  Space: 'jump',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  ControlLeft: 'crouch', ControlRight: 'crouch',
  KeyQ: 'weaponWheel',
  KeyE: 'turnCameraRight',
  KeyF: 'enterExit',
  KeyR: 'reload',
}

const WEAPON_SLOT_MAP = {
  Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4,
  Digit5: 5, Digit6: 6, Digit7: 7,
}

export function InputSystem() {
  const lastPointerPos = useRef(null) // null = ikke initialisert enda

  useEffect(() => {
    const onKeyDown = (e) => {
      const action = KEY_MAP[e.code]
      if (action) {
        if (action === 'jump') e.preventDefault()
        inputState[action] = true
      }
      // E-tast trigger også interact (for NPC-dialog)
      if (e.code === 'KeyE') inputState.interact = true
      // G-tast: skyt (tastatur-alternativ til venstre museklikk)
      if (e.code === 'KeyG') inputState.shoot = true
      // T-tast: sikt (tastatur-alternativ til høyre museklikk)
      if (e.code === 'KeyT') inputState.aim = true
      // Våpenvalg med talltaster
      const slot = WEAPON_SLOT_MAP[e.code]
      if (slot) inputState.weaponSlot = slot
    }

    const onKeyUp = (e) => {
      const action = KEY_MAP[e.code]
      if (action) inputState[action] = false
      if (e.code === 'KeyE') inputState.interact = false
      if (e.code === 'KeyG') inputState.shoot = false
      if (e.code === 'KeyT') inputState.aim = false
    }

    const onMouseDown = (e) => {
      if (e.button === 0 && inputState.pointerLocked) inputState.shoot = true
      if (e.button === 2) inputState.aim = true
    }

    const onMouseUp = (e) => {
      if (e.button === 0) inputState.shoot = false
      if (e.button === 2) inputState.aim = false
    }

    const onMouseMove = (e) => {
      if (inputState.pointerLocked) {
        // Akkumuler deltas – flere mousemove-events kan skje mellom frames
        inputState.mouseDeltaX += e.movementX
        inputState.mouseDeltaY += e.movementY
      } else {
        if (lastPointerPos.current === null) {
          lastPointerPos.current = { x: e.clientX, y: e.clientY }
        } else {
          inputState.mouseDeltaX += e.clientX - lastPointerPos.current.x
          inputState.mouseDeltaY += e.clientY - lastPointerPos.current.y
          lastPointerPos.current = { x: e.clientX, y: e.clientY }
        }
      }
      inputState.mouseX = e.clientX
      inputState.mouseY = e.clientY
    }

    const onPointerLockChange = () => {
      inputState.pointerLocked = document.pointerLockElement !== null
      if (!inputState.pointerLocked) {
        // Reset mus-pos ved unlock slik at neste drag er korrekt
        lastPointerPos.current = null
      }
    }

    // Klikk på siden → fang musepeker
    const onClick = () => {
      if (!document.pointerLockElement) {
        document.documentElement.requestPointerLock().catch(() => {})
      }
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('pointerlockchange', onPointerLockChange)
    document.addEventListener('click', onClick)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('pointerlockchange', onPointerLockChange)
      document.removeEventListener('click', onClick)
    }
  }, [])

  return null
}
