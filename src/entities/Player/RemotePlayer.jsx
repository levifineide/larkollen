import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const INTERPOLATION_SPEED = 10 // Lerp-hastighet per sekund
const NAME_HEIGHT = 2.2 // Høyde over spilleren for navn
const HEALTH_BAR_WIDTH = 0.8
const HEALTH_BAR_HEIGHT = 0.06

// Fargekoder for andre spillere
const PLAYER_COLORS = [
  '#4ecdc4', '#ff6b6b', '#ffd93d', '#6c5ce7',
  '#00b894', '#e17055', '#74b9ff', '#fd79a8',
  '#55efc4', '#fab1a0',
]

export default function RemotePlayer({ playerId, data, colorIndex = 0 }) {
  const groupRef = useRef()
  const posRef = useRef(new THREE.Vector3(data.x, data.y, data.z))
  const targetPos = useRef(new THREE.Vector3(data.x, data.y, data.z))
  const rotRef = useRef(data.rotY || 0)
  const nameRef = useRef()

  const color = PLAYER_COLORS[colorIndex % PLAYER_COLORS.length]

  useFrame((state, delta) => {
    if (!groupRef.current) return

    // Oppdater målposisjon fra data
    targetPos.current.set(data.x, data.y, data.z)

    // Interpoler posisjon (smooth)
    posRef.current.lerp(targetPos.current, Math.min(1, INTERPOLATION_SPEED * delta))
    groupRef.current.position.copy(posRef.current)

    // Interpoler rotasjon
    const targetRot = data.rotY || 0
    const diff = ((targetRot - rotRef.current + Math.PI * 3) % (Math.PI * 2)) - Math.PI
    rotRef.current += diff * Math.min(1, INTERPOLATION_SPEED * delta)

    // Navnelabel ser alltid mot kameraet
    if (nameRef.current) {
      nameRef.current.lookAt(state.camera.position)
    }
  })

  return (
    <group ref={groupRef} position={[data.x, data.y, data.z]}>
      {/* Spillerkropp – kapsel, same som lokal spiller men med farge */}
      <mesh castShadow position={[0, 0, 0]}>
        <capsuleGeometry args={[0.3, 1.0, 3, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* Blob-skygge */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.78, 0]}>
        <circleGeometry args={[0.45, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} depthWrite={false} />
      </mesh>

      {/* Sprint-indikator */}
      {data.isSprinting && (
        <mesh position={[0, -0.4, -0.4]}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshBasicMaterial color="#ffd93d" />
        </mesh>
      )}

      {/* Våpen-indikator (enkel boks) */}
      {!data.isDriving && (
        <mesh position={[0.4, 0.1, -0.15]} rotation={[0, 0, -0.3]}>
          <boxGeometry args={[0.06, 0.06, 0.4]} />
          <meshStandardMaterial color="#333" />
        </mesh>
      )}

      {/* Skyteblits */}
      {data.isShooting && (
        <pointLight
          position={[0.5, 0.2, -0.5]}
          color="#ff8800"
          intensity={3}
          distance={5}
          decay={2}
        />
      )}

      {/* Navn og helselinje over hodet */}
      <group ref={nameRef} position={[0, NAME_HEIGHT, 0]}>
        {/* Helsebar bakgrunn */}
        <mesh position={[0, 0.12, 0]}>
          <planeGeometry args={[HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT]} />
          <meshBasicMaterial color="#333" transparent opacity={0.7} depthTest={false} />
        </mesh>

        {/* Helsebar fylling */}
        <mesh
          position={[
            -(HEALTH_BAR_WIDTH * (1 - (data.health || 100) / 100)) / 2,
            0.12,
            0.001,
          ]}
        >
          <planeGeometry
            args={[
              HEALTH_BAR_WIDTH * ((data.health || 100) / 100),
              HEALTH_BAR_HEIGHT,
            ]}
          />
          <meshBasicMaterial
            color={(data.health || 100) > 50 ? '#00b894' : (data.health || 100) > 25 ? '#ffd93d' : '#e63946'}
            depthTest={false}
          />
        </mesh>
      </group>
    </group>
  )
}
