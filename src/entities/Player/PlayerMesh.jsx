import { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, useAnimations, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { inputState } from '../../systems/InputSystem'

const MODEL_PATH = '/models/player.glb'

// Prøv å preloade – feiler stille om filen ikke finnes
try { useGLTF.preload(MODEL_PATH) } catch (e) { /* ignorér */ }

// Animasjonsnavn-mapping (interne navn → mulige GLB-navn)
// Quaternius-modellen bruker "Human Armature|..." prefikser
const ANIM_MAP = {
  Idle: ['Human Armature|Idle', 'Idle', 'idle', 'Breathing Idle'],
  Walk: ['Human Armature|Walk', 'Walking', 'Walk', 'walk'],
  Run: ['Human Armature|Run', 'Running', 'Run', 'run'],
  Sprint: ['Human Armature|Run', 'Fast Run', 'Sprint', 'sprint'], // gjenbruk Run
  CrouchIdle: ['Human Armature|Idle', 'Crouch Idle', 'crouch_idle'], // fallback Idle
  CrouchWalk: ['Human Armature|Walk', 'Crouch Walk', 'crouch_walk'], // fallback Walk
  Shoot: ['Human Armature|Punch', 'Pistol Shooting', 'Firing Rifle', 'shoot'],
  Reload: ['Human Armature|Working', 'Reloading', 'Reload', 'reload'],
  Death: ['Human Armature|Death', 'Dying', 'Death', 'death'],
  Swim: ['Human Armature|Idle', 'Swimming', 'Treading Water', 'swim'], // fallback Idle
  Jump: ['Human Armature|Jump', 'Jump', 'jump'],
}

function findAction(actions, animName) {
  const candidates = ANIM_MAP[animName] || [animName]
  for (const name of candidates) {
    if (actions[name]) return actions[name]
  }
  return null
}

// GLB-versjon med animasjoner
function PlayerModelGLB() {
  const group = useRef()
  const { scene, animations } = useGLTF(MODEL_PATH)
  const { actions } = useAnimations(animations, group)
  const currentAction = useRef('Idle')
  const colorMap = useTexture('/models/colormap.png')

  // Klon scene og sett tekstur + skygge
  useEffect(() => {
    colorMap.flipY = false
    colorMap.colorSpace = THREE.SRGBColorSpace
    scene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = false
        child.material = child.material.clone()
        child.material.map = colorMap
        child.material.needsUpdate = true
      }
    })
  }, [scene, colorMap])

  useFrame(() => {
    const { isDriving, isReloading, health, isSwimming } = usePlayerStore.getState()

    if (health <= 0) {
      switchAnim('Death')
      return
    }
    if (isDriving) return
    if (isSwimming) {
      switchAnim('Swim')
      return
    }
    if (isReloading) {
      switchAnim('Reload')
      return
    }

    const moving = inputState.forward || inputState.backward ||
                   inputState.left || inputState.right
    const sprinting = inputState.sprint && moving
    const crouching = inputState.crouch

    let target = 'Idle'
    if (crouching && moving) target = 'CrouchWalk'
    else if (crouching) target = 'CrouchIdle'
    else if (sprinting) target = 'Sprint'
    else if (moving) target = 'Run'

    switchAnim(target)
  })

  function switchAnim(name) {
    if (currentAction.current === name) return
    const prev = findAction(actions, currentAction.current)
    const next = findAction(actions, name)
    if (!next) return
    prev?.fadeOut(0.2)
    next.reset().fadeIn(0.2).play()
    currentAction.current = name
  }

  // Modell normalisert til ~1.72m. Flytt ned -0.8 så føttene matcher capsule-bunnen.
  return (
    <group ref={group} position={[0, -0.8, 0]}>
      <primitive object={scene} />
    </group>
  )
}

// Fallback kapsel (brukes når GLB ikke er tilgjengelig)
function PlayerCapsuleFallback() {
  return (
    <group>
      <mesh castShadow position={[0, 0, 0]}>
        <capsuleGeometry args={[0.3, 1.0, 3, 6]} />
        <meshStandardMaterial color="#888888" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.78, 0]}>
        <circleGeometry args={[0.45, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </group>
  )
}

export default function PlayerMesh() {
  const [hasModel, setHasModel] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    // Sjekk om GLB-filen faktisk finnes
    fetch(MODEL_PATH, { method: 'HEAD' })
      .then(res => {
        setHasModel(res.ok)
        setChecked(true)
      })
      .catch(() => {
        setHasModel(false)
        setChecked(true)
      })
  }, [])

  // Vis capsule mens vi sjekker, bytt til GLB når klar
  if (!checked || !hasModel) return <PlayerCapsuleFallback />
  return <PlayerModelGLB />
}
