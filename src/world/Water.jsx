import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useWorldStore } from '../stores/useWorldStore'
import { SEA_LEVEL } from './terrainHeight'

/**
 * Vannkomponent – Oslofjorden med Gerstner-bølger.
 * 3 overlappende bølgesett animert helt i vertex shader.
 * windStrength fra worldStore skalerer amplitude.
 */

const WATER_COLOR = new THREE.Color('#1a6b8a')
const DEEP_COLOR = new THREE.Color('#0a3b5a')

// Gerstner wave parameters: [amplitude, frequency, steepness, dirX, dirZ, phaseSpeed]
const WAVES = [
  { A: 0.25, w: 0.08, Q: 0.4, Dx: 0.7, Dz: 0.3, phi: 1.2 },
  { A: 0.15, w: 0.15, Q: 0.3, Dx: -0.4, Dz: 0.8, phi: 0.8 },
  { A: 0.10, w: 0.25, Q: 0.2, Dx: 0.2, Dz: -0.6, phi: 1.5 },
]

export default function Water() {
  const materialRef = useRef(null)

  const waterMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: WATER_COLOR,
      transparent: true,
      opacity: 0.78,
      roughness: 0.05,
      metalness: 0.4,
      side: THREE.DoubleSide,
    })

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 }
      shader.uniforms.uWindStrength = { value: 0.2 }

      // Gerstner wave uniforms: vec4(A, w, Q, phi), vec2(Dx, Dz)
      for (let i = 0; i < 3; i++) {
        const wv = WAVES[i]
        shader.uniforms[`uWave${i}`] = { value: new THREE.Vector4(wv.A, wv.w, wv.Q, wv.phi) }
        shader.uniforms[`uWaveDir${i}`] = { value: new THREE.Vector2(wv.Dx, wv.Dz) }
      }

      shader.vertexShader = `
        uniform float uTime;
        uniform float uWindStrength;
        uniform vec4 uWave0; uniform vec2 uWaveDir0;
        uniform vec4 uWave1; uniform vec2 uWaveDir1;
        uniform vec4 uWave2; uniform vec2 uWaveDir2;

        vec3 gerstnerWave(vec4 wave, vec2 dir, vec2 xz, float t) {
          float A = wave.x * uWindStrength;
          float w = wave.y;
          float Q = wave.z;
          float phi = wave.w;

          float d = dot(dir, xz);
          float phase = w * d + phi * t;
          float s = sin(phase);
          float c = cos(phase);

          return vec3(
            Q * A * dir.x * c,
            A * s,
            Q * A * dir.y * c
          );
        }
      ` + shader.vertexShader

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec2 xz = transformed.xy; // plane is XY, rotated to XZ
        vec3 wave = vec3(0.0);
        wave += gerstnerWave(uWave0, uWaveDir0, xz, uTime);
        wave += gerstnerWave(uWave1, uWaveDir1, xz, uTime);
        wave += gerstnerWave(uWave2, uWaveDir2, xz, uTime);
        transformed.x += wave.x;
        transformed.y += wave.z;
        transformed.z += wave.y; // y displacement mapped to local z (up before rotation)`
      )

      // Analytiske normaler for Gerstner
      shader.vertexShader = shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        {
          vec2 xzN = position.xy;
          vec3 dpdx = vec3(1.0, 0.0, 0.0);
          vec3 dpdy = vec3(0.0, 1.0, 0.0);

          for (int i = 0; i < 3; i++) {
            vec4 wv;
            vec2 dir;
            if (i == 0) { wv = uWave0; dir = uWaveDir0; }
            else if (i == 1) { wv = uWave1; dir = uWaveDir1; }
            else { wv = uWave2; dir = uWaveDir2; }

            float A = wv.x * uWindStrength;
            float w = wv.y;
            float Q = wv.z;
            float phi = wv.w;
            float d = dot(dir, xzN);
            float phase = w * d + phi * uTime;
            float s = sin(phase);
            float c = cos(phase);

            dpdx.x -= Q * A * w * dir.x * dir.x * s;
            dpdx.z += A * w * dir.x * c;
            dpdy.y -= Q * A * w * dir.y * dir.y * s;
            dpdy.z += A * w * dir.y * c;
          }

          objectNormal = normalize(cross(dpdy, dpdx));
        }`
      )

      mat.userData.shader = shader
    }

    return mat
  }, [])

  useFrame(({ clock }) => {
    if (waterMaterial.userData.shader) {
      const shader = waterMaterial.userData.shader
      shader.uniforms.uTime.value = clock.getElapsedTime()
      shader.uniforms.uWindStrength.value = useWorldStore.getState().windStrength
    }
  })

  return (
    <group>
      {/* Havflate – høyere segment-count for synlige bølger */}
      <mesh
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, SEA_LEVEL, 0]}
        material={waterMaterial}
      >
        <planeGeometry args={[6000, 6000, 128, 128]} />
      </mesh>

      {/* Sjøbunn */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -8, 0]}>
        <planeGeometry args={[6000, 6000]} />
        <meshStandardMaterial color={DEEP_COLOR} roughness={1.0} metalness={0.0} />
      </mesh>
    </group>
  )
}

/**
 * CPU-side Gerstner for oppdrift (båter, etc.)
 * Sampler sum av 3 Gerstner-bølger ved en gitt (x, z) posisjon.
 * Returnerer y-displacement.
 */
export function sampleWaterHeight(x, z, time, windStrength = 0.2) {
  let y = SEA_LEVEL
  for (const wv of WAVES) {
    const A = wv.A * windStrength
    const d = wv.Dx * x + wv.Dz * z
    const phase = wv.w * d + wv.phi * time
    y += A * Math.sin(phase)
  }
  return y
}
