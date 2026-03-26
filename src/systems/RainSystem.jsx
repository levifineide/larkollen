import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useWorldStore } from '../stores/useWorldStore'

/**
 * RainSystem – GPU-instanserte regnstriper med vind-støtte.
 *
 * weather: 'none' | 'drizzle' | 'heavy' | 'storm'
 */

const PARTICLE_COUNT = 10000
const WORLD_HEIGHT = 60
const SPREAD = 80

// Intensitetsnivåer
const INTENSITY = {
  none:    { count: 0, speed: 0, opacity: 0, wind: 0 },
  drizzle: { count: 2500, speed: 28, opacity: 0.18, wind: 0.02 },
  heavy:   { count: 6000, speed: 45, opacity: 0.3, wind: 0.08 },
  storm:   { count: 10000, speed: 65, opacity: 0.4, wind: 0.35 },
}

const vertexShader = `
  attribute vec3 aOffset;
  attribute float aSpeed;
  attribute float aRandom;

  uniform float uTime;
  uniform float uWorldHeight;
  uniform float uSpread;
  uniform vec3 uCameraPos;
  uniform float uWind;

  varying float vAlpha;

  void main() {
    vec3 pos = position;

    // Regndråpe-posisjon – loop i y
    float y = mod(aOffset.y - uTime * aSpeed, uWorldHeight) - uWorldHeight * 0.5;
    float x = aOffset.x + uCameraPos.x;
    float z = aOffset.z + uCameraPos.z;

    // Vind-drift (sideveis regn)
    x += uTime * aSpeed * uWind;
    z += uTime * aSpeed * uWind * 0.3;

    pos.x += x;
    pos.y += y + uCameraPos.y;
    pos.z += z;

    // Tilt stripe i vindretning
    if (gl_VertexID == 1) {
      pos.x += uWind * 2.0;
      pos.z += uWind * 0.6;
    }

    // Avstand fra kamera for alpha-fade
    float dist = distance(pos, uCameraPos);
    vAlpha = smoothstep(uSpread, uSpread * 0.3, dist);
    vAlpha *= (0.7 + aRandom * 0.3);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

const fragmentShader = `
  uniform float uOpacity;
  varying float vAlpha;

  void main() {
    gl_FragColor = vec4(0.7, 0.75, 0.85, uOpacity * vAlpha);
  }
`

export default function RainSystem() {
  const meshRef = useRef()

  const { camera } = useThree()

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()

    const positions = new Float32Array(PARTICLE_COUNT * 6)
    const offsets = new Float32Array(PARTICLE_COUNT * 6)
    const speeds = new Float32Array(PARTICLE_COUNT * 2)
    const randoms = new Float32Array(PARTICLE_COUNT * 2)

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i6 = i * 6
      const i2 = i * 2

      positions[i6 + 0] = 0
      positions[i6 + 1] = 0
      positions[i6 + 2] = 0
      positions[i6 + 3] = 0
      positions[i6 + 4] = -0.5 - Math.random() * 0.4
      positions[i6 + 5] = 0

      const ox = (Math.random() - 0.5) * SPREAD * 2
      const oy = Math.random() * WORLD_HEIGHT
      const oz = (Math.random() - 0.5) * SPREAD * 2
      const speed = 0.8 + Math.random() * 0.4
      const rand = Math.random()

      offsets[i6 + 0] = ox; offsets[i6 + 1] = oy; offsets[i6 + 2] = oz
      offsets[i6 + 3] = ox; offsets[i6 + 4] = oy; offsets[i6 + 5] = oz

      speeds[i2 + 0] = speed; speeds[i2 + 1] = speed
      randoms[i2 + 0] = rand; randoms[i2 + 1] = rand
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 3))
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1))
    geo.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1))

    return geo
  }, [])

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uWorldHeight: { value: WORLD_HEIGHT },
        uSpread: { value: SPREAD },
        uCameraPos: { value: new THREE.Vector3() },
        uOpacity: { value: 0 },
        uWind: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  }, [])

  useFrame(({ clock }) => {
    const weather = useWorldStore.getState().weather
    const intensity = INTENSITY[weather] || INTENSITY.none

    material.uniforms.uTime.value = clock.getElapsedTime()
    material.uniforms.uCameraPos.value.copy(camera.position)
    material.uniforms.uOpacity.value = intensity.opacity
    material.uniforms.uWind.value = intensity.wind

    if (meshRef.current) {
      meshRef.current.geometry.setDrawRange(0, intensity.count * 2)
      meshRef.current.visible = intensity.count > 0
    }
  })

  return (
    <lineSegments ref={meshRef} geometry={geometry} material={material} frustumCulled={false} />
  )
}
