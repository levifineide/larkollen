import { Component, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { Html } from '@react-three/drei'
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
import NetworkSystem from '../systems/NetworkSystem'
import AudioSystem from '../systems/AudioSystem'
import RemotePlayersRenderer from '../entities/Player/RemotePlayersRenderer'
import HUD from '../ui/HUD'
import WeaponWheel from '../ui/WeaponWheel'
import MissionPanel from '../ui/MissionPanel'
import Minimap from '../ui/Minimap'
import DialoguePanel from '../ui/DialoguePanel'
import Lobby from '../ui/Lobby'
import IntroSequence, { IntroOverlay } from '../ui/IntroSequence'
import VictoryScreen from '../ui/VictoryScreen'
import { useMultiplayerStore } from '../stores/useMultiplayerStore'
import { useGameStore, GameState } from '../stores/useGameStore'

/* ── Startskjerm ── */
function StartScreen({ onStart, onMultiplayer }) {
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
          marginBottom: 12,
        }}
        onMouseEnter={e => { e.target.style.transform = 'scale(1.05)'; e.target.style.boxShadow = '0 0 30px rgba(230,57,70,0.6)' }}
        onMouseLeave={e => { e.target.style.transform = 'scale(1)'; e.target.style.boxShadow = '0 0 20px rgba(230,57,70,0.4)' }}
      >
        SPILL ALENE
      </button>
      <button
        onClick={onMultiplayer}
        style={{
          padding: '14px 48px',
          fontSize: 18,
          fontFamily: 'monospace',
          fontWeight: 'bold',
          color: '#fff',
          background: '#2d2d4e',
          border: '1px solid #4ecdc4',
          borderRadius: 8,
          cursor: 'pointer',
          transition: 'transform 0.1s, box-shadow 0.2s',
          boxShadow: '0 0 15px rgba(78,205,196,0.2)',
        }}
        onMouseEnter={e => { e.target.style.transform = 'scale(1.05)'; e.target.style.boxShadow = '0 0 25px rgba(78,205,196,0.4)' }}
        onMouseLeave={e => { e.target.style.transform = 'scale(1)'; e.target.style.boxShadow = '0 0 15px rgba(78,205,196,0.2)' }}
      >
        FLERSPILLER
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

// R3F-kompatibel loading fallback (vises inne i Canvas via drei Html)
function R3FLoadingFallback() {
  return (
    <Html fullscreen>
      <div style={{
        width: '100vw',
        height: '100vh',
        background: 'linear-gradient(180deg, #0a0a0a 0%, #1a0505 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'monospace',
        color: '#fff',
      }}>
        <h1 style={{ fontSize: 36, margin: 0, color: '#e63946', textShadow: '0 0 30px rgba(230,57,70,0.4)' }}>
          LARKOLLEN
        </h1>
        <p style={{ marginTop: 24, fontSize: 16, color: '#888' }}>Laster...</p>
      </div>
    </Html>
  )
}

/*
  Scene – én enkelt scene som veksler mellom intro og gameplay.
  Bruker samme Canvas for å unngå dobbel WebGL-kontekst og asset-reloading.
*/
function Scene({ cameraYaw, cameraPitch, introPhase, onIntroComplete }) {
  return (
    <>
      {/* Dag/natt-syklus – alltid aktiv */}
      <DayNightCycle />
      <fog attach="fog" args={['#c9d6df', 50, 300]} />

      {/* Regn – kun i gameplay */}
      {!introPhase && <RainSystem />}

      <Suspense fallback={<R3FLoadingFallback />}>
        <Physics gravity={[0, -9.81, 0]}>
          {/* Verdenen lastes én gang, gjenbrukes i intro og gameplay */}
          <LarkollenWorld />

          {/* Gameplay-elementer – kun når intro er ferdig */}
          {!introPhase && (
            <>
              <PlayerController cameraYaw={cameraYaw} />
              <RemotePlayersRenderer />
              <VehicleManager />
              <ZombieManager />
              <NPCManager />
              <CombatSystem />
              <ProjectileSystem />
              <MissionSystem />
            </>
          )}
        </Physics>
      </Suspense>

      {/* Intro: kameraflyvning med tekst */}
      {introPhase && <IntroSequence onComplete={onIntroComplete} />}

      {/* Audio – alltid aktiv (intro-musikk + gameplay-lyder) */}
      <AudioSystem />

      {/* Gameplay-systemer – kun etter intro */}
      {!introPhase && (
        <>
          <NetworkSystem />
          <CameraSystem cameraYaw={cameraYaw} cameraPitch={cameraPitch} />
          <WeaponPickups />
        </>
      )}
    </>
  )
}

export default function GameApp() {
  const [started, setStarted] = useState(false)
  const [showLobby, setShowLobby] = useState(false)
  const [introPhase, setIntroPhase] = useState(true)
  const cameraYaw   = useRef(0)
  const cameraPitch = useRef(0.15)

  const gameStarted = useMultiplayerStore((s) => s.gameStarted)
  const isConnected = useMultiplayerStore((s) => s.isConnected)
  const ping = useMultiplayerStore((s) => s.ping)
  const gameState = useGameStore((s) => s.state)
  const setGameState = useGameStore((s) => s.setState)

  // Start spillet når multiplayer-lobby starter
  const effectiveStarted = started || gameStarted

  // Sett riktig GameState ved oppstart
  useEffect(() => {
    if (effectiveStarted && introPhase) {
      setGameState(GameState.INTRO)
    }
  }, [effectiveStarted, introPhase, setGameState])

  const handleIntroComplete = useCallback(() => {
    setIntroPhase(false)
    setGameState(GameState.PLAYING)
  }, [setGameState])

  const handleRestart = useCallback(() => {
    window.location.reload()
  }, [])

  // ── Ikke startet → Startskjerm / Lobby ──
  if (!effectiveStarted) {
    if (showLobby) {
      return <Lobby onClose={() => setShowLobby(false)} />
    }
    return (
      <StartScreen
        onStart={() => setStarted(true)}
        onMultiplayer={() => setShowLobby(true)}
      />
    )
  }

  // ── Seiersskjerm ──
  if (gameState === GameState.VICTORY) {
    return <VictoryScreen onRestart={handleRestart} />
  }

  // ── Spill (intro + gameplay i samme Canvas) ──
  return (
    <ErrorBoundary>
      <Canvas
        shadows
        camera={{
          position: introPhase ? [0, 60, 100] : [0, 8, 10],
          fov: 60,
          near: 0.1,
          far: 1000,
        }}
        gl={{
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
          antialias: false,
        }}
        dpr={1}
        style={{
          background: introPhase ? '#1a1a2e' : '#87CEEB',
          cursor: introPhase ? 'default' : 'none',
        }}
      >
        <Scene
          cameraYaw={cameraYaw}
          cameraPitch={cameraPitch}
          introPhase={introPhase}
          onIntroComplete={handleIntroComplete}
        />
      </Canvas>

      {/* Intro-overlay */}
      {introPhase && <IntroOverlay />}

      {/* Gameplay UI – kun etter intro */}
      {!introPhase && (
        <>
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

          {isConnected && (
            <div style={{
              position: 'fixed',
              top: 12,
              right: 12,
              color: '#4ecdc4',
              fontSize: 11,
              fontFamily: 'monospace',
              pointerEvents: 'none',
              textAlign: 'right',
              background: 'rgba(0,0,0,0.5)',
              padding: '6px 10px',
              borderRadius: 4,
            }}>
              ONLINE &bull; {ping}ms
            </div>
          )}
        </>
      )}
    </ErrorBoundary>
  )
}
