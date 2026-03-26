import { Component, lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import * as THREE from 'three'

import { InputSystem } from '../systems/InputSystem'
import CameraSystem from '../systems/CameraSystem'
import PlayerController from '../entities/Player/PlayerController'
import LarkollenWorld from '../world/LarkollenWorld'
import VehicleManager from '../entities/Vehicle/VehicleManager'
import ZombieManager from '../systems/ZombieManager'
import NPCManager from '../systems/NPCManager'
import CombatSystem from '../systems/CombatSystem'
import ProjectileSystem from '../systems/ProjectileSystem'
import WeaponPickups from '../systems/WeaponPickups'
import MissionSystem from '../systems/MissionSystem'
import DayNightCycle from '../systems/DayNightCycle'
import RainSystem from '../systems/RainSystem'
import PostProcessing from '../systems/PostProcessing'
import HUD from '../ui/HUD'
import WeaponWheel from '../ui/WeaponWheel'
import MissionPanel from '../ui/MissionPanel'
import Minimap from '../ui/Minimap'
import DialoguePanel from '../ui/DialoguePanel'

/* ── Startskjerm ── */
function StartScreen({ onStart }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'linear-gradient(180deg, #0a0a0a 0%, #1a0a0a 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'monospace',
        color: '#fff',
        zIndex: 100,
      }}
    >
      <h1 style={{ fontSize: 48, margin: 0, color: '#e63946', textShadow: '0 0 30px rgba(230,57,70,0.5)' }}>
        LARKOLLEN
      </h1>
      <p style={{ fontSize: 16, color: '#888', margin: '8px 0 40px' }}>
        Dag En – Zombie Apocalypse
      </p>
      <button
        onClick={onStart}
        style={{
          padding: '16px 48px',
          fontSize: 20,
          fontFamily: 'monospace',
          fontWeight: 'bold',
          color: '#fff',
          background: '#e63946',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          transition: 'transform 0.1s, box-shadow 0.2s',
          boxShadow: '0 0 20px rgba(230,57,70,0.4)',
        }}
        onMouseEnter={e => { e.target.style.transform = 'scale(1.05)'; e.target.style.boxShadow = '0 0 30px rgba(230,57,70,0.6)' }}
        onMouseLeave={e => { e.target.style.transform = 'scale(1)'; e.target.style.boxShadow = '0 0 20px rgba(230,57,70,0.4)' }}
      >
        START SPILLET
      </button>
      <p style={{ fontSize: 12, color: '#555', marginTop: 32 }}>
        WASD: Beveg &nbsp;|&nbsp; Shift: Sprint &nbsp;|&nbsp; Space: Hopp
      </p>
    </div>
  )
}

// Error boundary – fanger feil og viser dem i stedet for blank skjerm
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    console.error('Larkollen feil:', error, info?.componentStack)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          position: 'fixed', inset: 0, background: '#111', color: '#f44',
          fontFamily: 'monospace', padding: 40, whiteSpace: 'pre-wrap',
        }}>
          <h2 style={{ color: '#fff' }}>Noe gikk galt!</h2>
          <p>{this.state.error?.message || String(this.state.error)}</p>
          <p style={{ color: '#888', fontSize: 12 }}>{this.state.error?.stack}</p>
        </div>
      )
    }
    return this.props.children
  }
}

function PointerLockOverlay() {
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    const onChange = () => setLocked(document.pointerLockElement !== null)
    document.addEventListener('pointerlockchange', onChange)
    return () => document.removeEventListener('pointerlockchange', onChange)
  }, [])

  if (locked) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.45)',
      color: '#fff',
      fontFamily: 'monospace',
      fontSize: 18,
      pointerEvents: 'none',
      zIndex: 10,
    }}>
      Klikk for å spille
    </div>
  )
}

// StatsGl fjernet – spiste ~2 FPS med sin useFrame callback

function Scene({ cameraYaw, cameraPitch }) {
  return (
    <>
      {/* Dag/natt-syklus styrer sol, himmel, ambient og fog */}
      <DayNightCycle />
      <fog attach="fog" args={['#c9d6df', 50, 300]} />

      {/* Regn */}
      <RainSystem />

      <Physics gravity={[0, -9.81, 0]}>
        <LarkollenWorld />
        <PlayerController cameraYaw={cameraYaw} />
        <VehicleManager />
        <ZombieManager />
        <NPCManager />
        <CombatSystem />
        <ProjectileSystem />
        <MissionSystem />
      </Physics>

      <CameraSystem cameraYaw={cameraYaw} cameraPitch={cameraPitch} />

      {/* WeaponPickups utenfor Physics – trenger ikke fysikkmotor */}
      <WeaponPickups />

      {/* Post-processing deaktivert – versjonsinkompatibilitet */}
      {/* <PostProcessing /> */}
    </>
  )
}

export default function GameApp() {
  const [started, setStarted] = useState(false)
  const cameraYaw   = useRef(0)
  const cameraPitch = useRef(0.15)

  if (!started) {
    return <StartScreen onStart={() => setStarted(true)} />
  }

  return (
    <ErrorBoundary>
      {/* Fang museklikk for kamerakontroll */}
      <Canvas
        shadows
        camera={{ position: [0, 8, 10], fov: 60, near: 0.1, far: 1000 }}
        gl={{
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
          antialias: false,
        }}
        dpr={1}
        style={{ background: '#87CEEB', cursor: 'none' }}
      >
        <Scene cameraYaw={cameraYaw} cameraPitch={cameraPitch} />
      </Canvas>

      <InputSystem />
      <HUD />
      <WeaponWheel />
      <MissionPanel />
      <Minimap />
      <DialoguePanel />
      <PointerLockOverlay />

      <div style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        color: '#aaa',
        fontSize: 11,
        fontFamily: 'monospace',
        pointerEvents: 'none',
        lineHeight: 1.8,
        textAlign: 'right',
      }}>
        WASD: Beveg &nbsp;|&nbsp; E: NPC / Plukk opp<br />
        Shift: Sprint &nbsp;|&nbsp; Ctrl: Knele<br />
        Space: Hopp &nbsp;|&nbsp; F: Kjøretøy<br />
        G: Skyt &nbsp;|&nbsp; T: Sikt &nbsp;|&nbsp; R: Lad om<br />
        1-7: Våpen &nbsp;|&nbsp; Q (hold): Våpenhjul
      </div>
    </ErrorBoundary>
  )
}
