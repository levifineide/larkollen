import { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { audioManager } from '../systems/AudioSystem'

// Catmull-Rom spline-punkter over Larkollen-kartet
const CAMERA_POINTS = [
  new THREE.Vector3(0, 60, 100),
  new THREE.Vector3(40, 50, 50),
  new THREE.Vector3(80, 45, -20),
  new THREE.Vector3(30, 55, -80),
  new THREE.Vector3(-20, 50, -40),
  new THREE.Vector3(0, 40, 20),
]

const LOOK_AT = new THREE.Vector3(0, 0, 0)

const INTRO_DURATION = 12 // sekunder

const INTRO_LINES = [
  { text: 'Larkollen, dag en.', startAt: 1.5, endAt: 4.5 },
  { text: 'Det begynte natten i forveien.', startAt: 5.3, endAt: 8.3 },
  { text: 'Nå er det bare oss igjen.', startAt: 9.0, endAt: 11.5 },
]

const FADE_DURATION = 0.8 // sekunder

export default function IntroSequence({ onComplete }) {
  const { camera } = useThree()
  const timeRef = useRef(0)
  const completedRef = useRef(false)
  const [currentLine, setCurrentLine] = useState('')
  const [opacity, setOpacity] = useState(0)

  const curve = useMemo(() => {
    return new THREE.CatmullRomCurve3(CAMERA_POINTS, false, 'catmullrom', 0.5)
  }, [])

  const handleComplete = useCallback(() => {
    if (!completedRef.current) {
      completedRef.current = true
      onComplete()
    }
  }, [onComplete])

  // Spill intro-musikk (init audio om nødvendig – brukeren har allerede klikket "Spill")
  useEffect(() => {
    audioManager.init()
    audioManager.stopMusic()
    audioManager.playSpecial('intro')

    return () => {
      audioManager.stopSpecial('intro')
    }
  }, [])

  // Skip med Enter eller Escape
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        handleComplete()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleComplete])

  useFrame((_, delta) => {
    if (completedRef.current) return

    timeRef.current += delta
    const elapsed = timeRef.current
    const t = Math.min(elapsed / INTRO_DURATION, 1)

    // Flytt kamera langs spline
    const point = curve.getPointAt(t)
    camera.position.copy(point)
    camera.lookAt(LOOK_AT)

    // Finn aktiv tekstlinje og beregn opacity
    let newOpacity = 0
    let lineText = ''

    for (const line of INTRO_LINES) {
      if (elapsed >= line.startAt && elapsed <= line.endAt) {
        lineText = line.text
        const fadeIn = Math.min((elapsed - line.startAt) / FADE_DURATION, 1)
        const fadeOut = Math.min((line.endAt - elapsed) / FADE_DURATION, 1)
        newOpacity = Math.min(fadeIn, fadeOut)
        break
      }
    }

    // Oppdater state (throttled — bare når verdiene endres merkbart)
    setOpacity(prev => Math.abs(prev - newOpacity) > 0.02 ? newOpacity : prev)
    setCurrentLine(prev => prev === lineText ? prev : lineText)

    // Fullført?
    if (t >= 1) {
      handleComplete()
    }
  })

  if (!currentLine) return null

  return (
    <Text
      position={[0, 25, 0]}
      fontSize={3}
      anchorX="center"
      anchorY="middle"
      maxWidth={40}
      textAlign="center"
      outlineWidth={0.15}
      outlineColor="#000000"
      color="#ffffff"
      fillOpacity={opacity}
      depthOffset={-1}
    >
      {currentLine}
    </Text>
  )
}

// HTML-overlay med "Trykk Enter for å hoppe over"
export function IntroOverlay() {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 4000)
    return () => clearTimeout(timer)
  }, [])

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 40,
      left: '50%',
      transform: 'translateX(-50%)',
      color: '#888',
      fontFamily: 'monospace',
      fontSize: 14,
      pointerEvents: 'none',
      zIndex: 50,
    }}>
      Trykk Enter for å hoppe over
    </div>
  )
}
