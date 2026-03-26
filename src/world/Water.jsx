import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useWorldStore } from '../stores/useWorldStore'
import { SEA_LEVEL } from './terrainHeight'

/**
 * Vannkomponent – Oslofjorden med Gerstner-bølger + Fresnel + krusning.
 * Vertex shader: 3 Gerstner-bølger for geometrisk bevegelse.
 * Fragment shader: Fresnel-effekt, animert krusnings-mønster, dybdefargevariasjon.
 */

const WATER_COLOR = new THREE.Color('#45dde6')
const DEEP_COLOR  = new THREE.Color('#1a7a8a')

// Gerstner wave parameters – økt amplitude for synlighet
const WAVES = [
  { A: 0.35, w: 0.08, Q: 0.45, Dx: 0.7, Dz: 0.3, phi: 1.2 },
  { A: 0.20, w: 0.15, Q: 0.35, Dx: -0.4, Dz: 0.8, phi: 0.8 },
  { A: 0.12, w: 0.25, Q: 0.25, Dx: 0.2, Dz: -0.6, phi: 1.5 },
]

export default function Water() {
  const materialRef = useRef(null)

  const waterMaterial = useMemo(() => {
    const mat = new THREE.MeshPhongMaterial({
      color: WATER_COLOR,
      emissive: new THREE.Color('#0a3d4d'),
      specular: new THREE.Color('#bbddff'),
      shininess: 90,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
    })

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 }
      shader.uniforms.uWindStrength = { value: 0.5 }

      // Gerstner wave uniforms
      for (let i = 0; i < 3; i++) {
        const wv = WAVES[i]
        shader.uniforms[`uWave${i}`] = { value: new THREE.Vector4(wv.A, wv.w, wv.Q, wv.phi) }
        shader.uniforms[`uWaveDir${i}`] = { value: new THREE.Vector2(wv.Dx, wv.Dz) }
      }

      // ── Vertex shader: Gerstner-bølger + pass world-pos til fragment ──
      shader.vertexShader = `
        uniform float uTime;
        uniform float uWindStrength;
        uniform vec4 uWave0; uniform vec2 uWaveDir0;
        uniform vec4 uWave1; uniform vec2 uWaveDir1;
        uniform vec4 uWave2; uniform vec2 uWaveDir2;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;

        vec3 gerstnerWave(vec4 wave, vec2 dir, vec2 xz, float t) {
          float A = wave.x * uWindStrength;
          float w = wave.y;
          float Q = wave.z;
          float phi = wave.w;
          float d = dot(dir, xz);
          float phase = w * d + phi * t;
          float s = sin(phase);
          float c = cos(phase);
          return vec3(Q * A * dir.x * c, A * s, Q * A * dir.y * c);
        }
      ` + shader.vertexShader

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec2 xz = transformed.xy;
        vec3 wave = vec3(0.0);
        wave += gerstnerWave(uWave0, uWaveDir0, xz, uTime);
        wave += gerstnerWave(uWave1, uWaveDir1, xz, uTime);
        wave += gerstnerWave(uWave2, uWaveDir2, xz, uTime);
        transformed.x += wave.x;
        transformed.y += wave.z;
        transformed.z += wave.y;`
      )

      // Analytiske normaler for Gerstner + pass til fragment
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

      // Pass world position og normal til fragment shader
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);`
      )

      // ── Fragment shader: Fresnel + krusning ──
      shader.fragmentShader = `
        uniform float uTime;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
      ` + shader.fragmentShader

      // Inject etter belysning, rett før output
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <output_fragment>',
        `
        // ── Fresnel: mer ugjennomsiktig i grunt vinkel, gjennomsiktig rett ned ──
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = 1.0 - max(dot(viewDir, vWorldNormal), 0.0);
        fresnel = pow(fresnel, 2.5);
        float fresnelOpacity = mix(0.45, 0.92, fresnel);

        // ── Krusning: to lag med animert sinusmønster ──
        float ripple1 = sin(vWorldPos.x * 0.8 + vWorldPos.z * 0.6 + uTime * 1.5) * 0.5 + 0.5;
        float ripple2 = sin(vWorldPos.x * 0.5 - vWorldPos.z * 0.9 + uTime * 1.1) * 0.5 + 0.5;
        float ripple = ripple1 * ripple2;
        // Mikser krusning som subtil lyshetsvariasjon
        vec3 rippleColor = mix(vec3(0.0), vec3(0.15, 0.25, 0.28), ripple * 0.6);

        // ── Kombiner ──
        outgoingLight += rippleColor;
        gl_FragColor = vec4(outgoingLight, fresnelOpacity * opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        `
      )

      mat.userData.shader = shader
    }

    return mat
  }, [])

  useFrame(({ clock }) => {
    if (waterMaterial.userData.shader) {
      const shader = waterMaterial.userData.shader
      shader.uniforms.uTime.value = clock.getElapsedTime()
      shader.uniforms.uWindStrength.value = Math.max(0.5, useWorldStore.getState().windStrength)
    }
  })

  return (
    <group>
      {/* Havflate – 192×192 segmenter for synlige bølger */}
      <mesh
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, SEA_LEVEL, 0]}
        material={waterMaterial}
        renderOrder={1}
      >
        <planeGeometry args={[6000, 6000, 192, 192]} />
      </mesh>

      {/* Sjøbunn – lys turkis for å skinne gjennom gjennomsiktig vann */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -8, 0]}>
        <planeGeometry args={[6000, 6000]} />
        <meshStandardMaterial color={DEEP_COLOR} roughness={1.0} metalness={0.0} />
      </mesh>
    </group>
  )
}

/**
 * CPU-side Gerstner for oppdrift (båter, etc.)
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
