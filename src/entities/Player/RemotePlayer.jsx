import { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, useAnimations } from '@react-three/drei'
import * as THREE from 'three'

const MODEL_PATH = '/models/player.glb'
const INTERPOLATION_SPEED = 10
const NAME_HEIGHT = 2.2
const HEALTH_BAR_WIDTH = 0.8
const HEALTH_BAR_HEIGHT = 0.06

const PLAYER_COLORS = [
  '#4ecdc4', '#ff6b6b', '#ffd93d', '#6c5ce7',
  '#00b894', '#e17055', '#74b9ff', '#fd79a8',
  '#55efc4', '#fab1a0',
]

// Animasjonsnavn-mapping (Quaternius "Human Armature|..." prefikser)
const ANIM_MAP = {
  idle: ['Human Armature|Idle', 'Idle', 'idle'],
  walking: ['Human Armature|Walk', 'Walking', 'Walk', 'walk'],
  running: ['Human Armature|Run', 'Running', 'Run', 'run'],
  sprinting: ['Human Armature|Run', 'Fast Run', 'Sprint'],
  shooting: ['Human Armature|Punch', 'Pistol Shooting', 'shoot'],
  reloading: ['Human Armature|Working', 'Reloading', 'reload'],
  dead: ['Human Armature|Death', 'Dying', 'Death', 'death'],
}

function findAction(actions, animState) {
  const candidates = ANIM_MAP[animState] || [animState]
  for (const name of candidates) {
    if (actions[name]) return actions[name]
  }
  return null
}

// GLB-modell for remote player
function RemotePlayerGLB({ data }) {
  const group = useRef()
  const { scene, animations } = useGLTF(MODEL_PATH)
  const { actions } = useAnimations(animations, group)
  const currentAnim = useRef('idle')

  useEffect(() => {
    scene.traverse((child) => {
      if (child.isMesh) child.castShadow = true
    })
  }, [scene])

  useFrame(() => {
    const target = data.animState || 'idle'
    if (target === currentAnim.current) return

    const prev = findAction(actions, currentAnim.current)
    const next = findAction(actions, target)
    if (!next) return

    prev?.fadeOut(0.2)
    if (target === 'dead') {
      next.reset().fadeIn(0.2).setLoop(THREE.LoopOnce, 1).play()
      next.clampWhenFinished = true
    } else {
      next.reset().fadeIn(0.2).play()
    }
    currentAnim.current = target
  })

  return (
    <group ref={group} position={[0, -0.8, 0]}>
      <primitive object={scene} />
    </group>
  )
}

// Fallback kapsel
function RemotePlayerCapsule({ color, data }) {
  return (
    <>
      <mesh castShadow position={[0, 0, 0]}>
        <capsuleGeometry args={[0.3, 1.0, 3, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.78, 0]}>
        <circleGeometry args={[0.45, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} depthWrite={false} />
      </mesh>
      {data.isSprinting && (
        <mesh position={[0, -0.4, -0.4]}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshBasicMaterial color="#ffd93d" />
        </mesh>
      )}
      {!data.isDriving && (
        <mesh position={[0.4, 0.1, -0.15]} rotation={[0, 0, -0.3]}>
          <boxGeometry args={[0.06, 0.06, 0.4]} />
          <meshStandardMaterial color="#333" />
        </mesh>
      )}
    </>
  )
}

// Sjekk modell-tilgjengelighet (modul-nivå, én gang)
let modelAvailable = null
let modelCheckPromise = null
function checkModel() {
  if (modelCheckPromise) return modelCheckPromise
  modelCheckPromise = fetch(MODEL_PATH, { method: 'HEAD' })
    .then(res => { modelAvailable = res.ok })
    .catch(() => { modelAvailable = false })
  return modelCheckPromise
}
checkModel()

export default function RemotePlayer({ playerId, data, colorIndex = 0 }) {
  const groupRef = useRef()
  const posRef = useRef(new THREE.Vector3(data.x, data.y, data.z))
  const targetPos = useRef(new THREE.Vector3(data.x, data.y, data.z))
  const rotRef = useRef(data.rotY || 0)
  const nameRef = useRef()
  const [hasModel, setHasModel] = useState(modelAvailable === true)

  const color = PLAYER_COLORS[colorIndex % PLAYER_COLORS.length]

  useEffect(() => {
    if (modelAvailable === null) {
      checkModel().then(() => setHasModel(modelAvailable === true))
    }
  }, [])

  useFrame((state, delta) => {
    if (!groupRef.current) return

    targetPos.current.set(data.x, data.y, data.z)
    posRef.current.lerp(targetPos.current, Math.min(1, INTERPOLATION_SPEED * delta))
    groupRef.current.position.copy(posRef.current)

    const targetRot = data.rotY || 0
    const diff = ((targetRot - rotRef.current + Math.PI * 3) % (Math.PI * 2)) - Math.PI
    rotRef.current += diff * Math.min(1, INTERPOLATION_SPEED * delta)

    if (nameRef.current) {
      nameRef.current.lookAt(state.camera.position)
    }
  })

  return (
    <group ref={groupRef} position={[data.x, data.y, data.z]}>
      {hasModel
        ? <RemotePlayerGLB data={data} />
        : <RemotePlayerCapsule color={color} data={data} />
      }

      {/* Skyteblits */}
      {data.isShooting && (
        <pointLight position={[0.5, 0.2, -0.5]} color="#ff8800" intensity={3} distance={5} decay={2} />
      )}

      {/* Navn og helselinje */}
      <group ref={nameRef} position={[0, NAME_HEIGHT, 0]}>
        <mesh position={[0, 0.12, 0]}>
          <planeGeometry args={[HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT]} />
          <meshBasicMaterial color="#333" transparent opacity={0.7} depthTest={false} />
        </mesh>
        <mesh position={[-(HEALTH_BAR_WIDTH * (1 - (data.health || 100) / 100)) / 2, 0.12, 0.001]}>
          <planeGeometry args={[HEALTH_BAR_WIDTH * ((data.health || 100) / 100), HEALTH_BAR_HEIGHT]} />
          <meshBasicMaterial
            color={(data.health || 100) > 50 ? '#00b894' : (data.health || 100) > 25 ? '#ffd93d' : '#e63946'}
            depthTest={false}
          />
        </mesh>
      </group>
    </group>
  )
}
