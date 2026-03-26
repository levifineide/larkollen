import { Suspense, useState, useEffect } from 'react'
import { useWorldStore } from '../stores/useWorldStore'
import { setExpectingGLBTerrain } from './terrainHeight'
import Terrain from './Terrain'
import Buildings from './Buildings'
import Roads from './Roads'
import Water from './Water'
import GameplayTriggers from './GameplayTriggers'

/**
 * LarkollenWorld – Hovedkomponent for Larkollen-kartet.
 *
 * Erstatter TestWorld med det ekte Larkollen-kartet.
 * Prøver å laste pre-bakte .glb-filer fra public/map/.
 * Faller tilbake til prosedyrelle placeholder-versjoner hvis .glb ikke finnes.
 */

function MapLoadingFallback() {
  return (
    <mesh position={[0, 0.5, 0]}>
      <boxGeometry args={[2, 1, 2]} />
      <meshStandardMaterial color="#666" wireframe />
    </mesh>
  )
}

export default function LarkollenWorld() {
  const [hasGLBFiles, setHasGLBFiles] = useState(false)
  const setLoaded = useWorldStore(s => s.setLoaded)

  // Sett forventing tidlig — sjekk synchront om map-meta finnes i cache
  // (useEffect er for sent, PlayerPhysics kjører useFrame før den)
  useState(() => {
    // Optimistisk: anta at GLB-terreng finnes. Vil bli korrigert i useEffect under.
    // Bedre å vente litt enn å clampe til feil prosedyrell høyde.
    setExpectingGLBTerrain(true)
  })

  // Sjekk om GLB-filer finnes ved oppstart
  useEffect(() => {
    async function checkMapFiles() {
      try {
        const res = await fetch('/map/map-meta.json')
        if (res.ok) {
          const meta = await res.json()
          console.log('[LarkollenWorld] Kartdata funnet:', meta)
          if (meta.hasDTM) {
            setExpectingGLBTerrain(true)
            setHasGLBFiles(true)
            console.log('[LarkollenWorld] Bruker ekte Larkollen-kart med høydedata')
          } else {
            setExpectingGLBTerrain(false)
            console.log('[LarkollenWorld] Ingen høydedata – bruker prosedyrell fallback')
          }
        } else {
          setExpectingGLBTerrain(false)
          console.log('[LarkollenWorld] Ingen kartdata – bruker prosedyrell fallback')
        }
      } catch {
        setExpectingGLBTerrain(false)
        console.log('[LarkollenWorld] Ingen kartdata – bruker prosedyrell fallback')
      }
      setLoaded(true)
    }
    checkMapFiles()
  }, [setLoaded])

  return (
    <Suspense fallback={<MapLoadingFallback />}>
      {/* Terreng */}
      <Terrain useGLB={hasGLBFiles} />

      {/* Bygninger med LOD */}
      <Buildings useGLB={hasGLBFiles} />

      {/* Veier */}
      <Roads useGLB={hasGLBFiles} />

      {/* Vann (alltid prosedyrell – Gerstner-bølger i Fase 7) */}
      <Water />

      {/* Gameplay-triggere (bensinstasjon + Eløya) */}
      <GameplayTriggers />
    </Suspense>
  )
}
