import { useMemo, useEffect, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { RigidBody, CuboidCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { getTerrainHeight, setTerrainMesh } from './terrainHeight'

/**
 * Terreng-komponent.
 * Visuell geometri: 128×128 (høy detalj).
 * Kollisjon-geometri: 32×32 (rask fysikk – 16× færre triangler).
 */

function createTerrainGeometry(resolution) {
  const SIZE_X = 4550
  const SIZE_Z = 6680
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
        <CuboidCollider args={[2275, 0.5, 3340]} position={[0, -5, 0]} />
      </RigidBody>
    </group>
  )
}

function GLBTerrain() {
  const { scene } = useGLTF('/map/terrain.glb')
  const groupRef = useRef()

  // Bygg kollisjon-geometri fra GLB-terrengets meshes (merge alle)
  const collisionGeo = useMemo(() => {
    const geos = []
    scene.updateMatrixWorld(true)
    scene.traverse(child => {
      if (child.isMesh && child.geometry) {
        const cloned = child.geometry.clone()
        cloned.applyMatrix4(child.matrixWorld)
        // Fjern attributter Rapier ikke trenger for å spare minne
        for (const key of Object.keys(cloned.attributes)) {
          if (key !== 'position') cloned.deleteAttribute(key)
        }
        geos.push(cloned)
      }
    })
    if (geos.length === 0) return null
    if (geos.length === 1) return geos[0]
    return mergeGeometries(geos)
  }, [scene])

  useMemo(() => {
    scene.traverse(child => {
      if (child.isMesh) {
        child.receiveShadow = true
        if (child.material) {
          child.material.roughness = 0.92
          child.material.metalness = 0.0
        }
      }
    })
  }, [scene])

  // Registrer terreng-mesh for heightmap-cache (vannområder er bakt inn i GLB)
  useEffect(() => {
    setTerrainMesh(scene)
    return () => setTerrainMesh(null)
  }, [scene])

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
      {/* Trimesh-collider fra GLB-terrenget – nødvendig for kjøretøy-fysikk */}
      {collisionGeo && (
        <RigidBody type="fixed" colliders="trimesh">
          <mesh geometry={collisionGeo} visible={false} />
        </RigidBody>
      )}
      {/* Flat catch-all under terrenget */}
      <RigidBody type="fixed">
        <CuboidCollider args={[2275, 0.5, 3340]} position={[0, -5, 0]} />
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
