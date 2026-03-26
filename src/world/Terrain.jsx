import { useMemo, useEffect, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { RigidBody, CuboidCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { getTerrainHeight, setTerrainMesh, SEA_THRESHOLD, SEA_FLOOR, isWaterZone } from './terrainHeight'

/**
 * Terreng-komponent.
 * Visuell geometri: 128×128 (høy detalj).
 * Kollisjon-geometri: 32×32 (rask fysikk – 16× færre triangler).
 */

function createTerrainGeometry(resolution) {
  const SIZE_X = 4400
  const SIZE_Z = 6700
  const geo = new THREE.PlaneGeometry(SIZE_X, SIZE_Z, resolution - 1, resolution - 1)
  // Pre-roter til XZ-planet slik at vertices er i world-space
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, getTerrainHeight(pos.getX(i), pos.getZ(i)))
  }
  geo.computeVertexNormals()
  return geo
}

function ProceduralTerrain() {
  const { visualGeo, collisionGeo } = useMemo(() => ({
    visualGeo: createTerrainGeometry(64),
    collisionGeo: createTerrainGeometry(32),
  }), [])

  return (
    <group>
      <mesh receiveShadow geometry={visualGeo}>
        <meshStandardMaterial
          color="#4a7c3f"
          roughness={0.92}
          metalness={0.0}
          flatShading={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      <RigidBody type="fixed" colliders="trimesh">
        <mesh geometry={collisionGeo} visible={false} />
      </RigidBody>

      <RigidBody type="fixed">
        <CuboidCollider args={[2200, 0.5, 3350]} position={[0, -5, 0]} />
      </RigidBody>
    </group>
  )
}

function GLBTerrain() {
  const { scene } = useGLTF('/map/terrain.glb')
  const groupRef = useRef()

  useMemo(() => {
    scene.traverse(child => {
      if (child.isMesh) {
        child.receiveShadow = true
        if (child.material) {
          child.material.roughness = 0.92
          child.material.metalness = 0.0
        }
        // Senk vannområde-vertices under vannflaten
        const geo = child.geometry
        if (geo) {
          child.updateWorldMatrix(true, false)
          const pos = geo.attributes.position
          if (pos) {
            const _v = new THREE.Vector3()
            let modified = false
            for (let i = 0; i < pos.count; i++) {
              _v.set(pos.getX(i), pos.getY(i), pos.getZ(i))
              _v.applyMatrix4(child.matrixWorld)
              // Senk vertex hvis det er i et kjent vannområde ELLER under sjønivå
              if (_v.y < SEA_THRESHOLD || isWaterZone(_v.x, _v.z)) {
                pos.setY(i, SEA_FLOOR)
                modified = true
              }
            }
            if (modified) {
              pos.needsUpdate = true
              geo.computeVertexNormals()
            }
          }
        }
      }
    })
  }, [scene])

  // Registrer terreng-mesh for heightmap-cache (ETTER vertex-modifikasjon)
  useEffect(() => {
    setTerrainMesh(scene)
    return () => setTerrainMesh(null)
  }, [scene])

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
      <RigidBody type="fixed">
        <CuboidCollider args={[2200, 0.5, 3350]} position={[0, -5, 0]} />
      </RigidBody>
    </group>
  )
}

export default function Terrain({ useGLB: shouldUseGLB = false }) {
  if (shouldUseGLB) {
    return <GLBTerrain />
  }
  return <ProceduralTerrain />
}
