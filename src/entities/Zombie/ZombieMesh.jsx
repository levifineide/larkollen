import { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, useAnimations, useTexture } from '@react-three/drei'
import * as THREE from 'three'

const MODEL_PATH = '/models/zombie.glb'

try { useGLTF.preload(MODEL_PATH) } catch (e) { /* ignorér */ }

// Animasjonsnavn-mapping (Quaternius zombie model)
const ANIM_MAP = {
  idle: ['Walking', 'Zombie Idle', 'Idle', 'idle'],       // fallback til Walking
  walking: ['Walking', 'Zombie Walking', 'walk'],
  attacking: ['Attack', 'Zombie Attack', 'Zombie Biting', 'attack'],
  dead: ['Death', 'Zombie Dying', 'Dying', 'death'],
}

function findAction(actions, animState) {
  const candidates = ANIM_MAP[animState] || [animState]
  for (const name of candidates) {
    if (actions[name]) return actions[name]
  }
  return null
}

// GLB-versjon
function ZombieModelGLB({ animState }) {
  const group = useRef()
  const { scene, animations } = useGLTF(MODEL_PATH)
  const { actions } = useAnimations(animations, group)
  const currentAction = useRef('idle')
  const clonedScene = useRef()
  const colorMap = useTexture('/models/colormap.png')

  // Klon scene for unikhet og sett tekstur
  useEffect(() => {
    colorMap.flipY = false
    colorMap.colorSpace = THREE.SRGBColorSpace
    clonedScene.current = scene.clone(true)
    clonedScene.current.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true
        child.frustumCulled = true
        child.material = child.material.clone()
        child.material.map = colorMap
        child.material.needsUpdate = true
      }
    })
    // Apply to original scene too (used by primitive)
    scene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true
        child.material = child.material.clone()
        child.material.map = colorMap
        child.material.needsUpdate = true
      }
    })
  }, [scene, colorMap])

  useFrame(() => {
    const target = animState || 'idle'
    if (target === currentAction.current) return

    const prev = findAction(actions, currentAction.current)
    const next = findAction(actions, target)
    if (!next) return

    prev?.fadeOut(0.3)
    if (target === 'dead') {
      next.reset().fadeIn(0.3).setLoop(THREE.LoopOnce, 1).play()
      next.clampWhenFinished = true
    } else {
      next.reset().fadeIn(0.3).play()
    }
    currentAction.current = target
  })

  // Zombie-modell normalisert til ~1.66m, sentrert ved y=0.
  // Flytt opp 0.83 så føttene treffer bakken.
  return (
    <group ref={group} position={[0, 0.83, 0]}>
      <primitive object={scene} />
    </group>
  )
}

// Fallback kapsel
const ALIVE_MAT = new THREE.MeshStandardMaterial({ color: '#4a7a3b', roughness: 0.8 })
const DEAD_MAT = new THREE.MeshStandardMaterial({ color: '#555', roughness: 0.8 })
const SHADOW_MAT = new THREE.MeshBasicMaterial({
  color: '#000000', transparent: true, opacity: 0.35, depthWrite: false,
})

function ZombieCapsuleFallback({ animState }) {
  const mat = animState === 'dead' ? DEAD_MAT : ALIVE_MAT

  return (
    <group>
      <mesh position={[0, 0.7, 0]} material={mat}>
        <capsuleGeometry args={[0.3, 0.8, 3, 6]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} material={SHADOW_MAT}>
        <circleGeometry args={[0.4, 16]} />
      </mesh>
    </group>
  )
}

// Sjekk for modell gjøres én gang (modul-nivå)
let modelAvailable = null
let modelCheckPromise = null

function checkModel() {
  if (modelCheckPromise) return modelCheckPromise
  modelCheckPromise = fetch(MODEL_PATH, { method: 'HEAD' })
    .then(res => { modelAvailable = res.ok })
    .catch(() => { modelAvailable = false })
  return modelCheckPromise
}

// Start sjekk umiddelbart
checkModel()

export default function ZombieMesh({ animState }) {
  const [ready, setReady] = useState(modelAvailable !== null)

  useEffect(() => {
    if (modelAvailable === null) {
      checkModel().then(() => setReady(true))
    }
  }, [])

  if (!ready) {
    return <ZombieCapsuleFallback animState={animState} />
  }

  return modelAvailable
    ? <ZombieModelGLB animState={animState} />
    : <ZombieCapsuleFallback animState={animState} />
}
