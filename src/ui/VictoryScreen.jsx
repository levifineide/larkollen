import { useState, useEffect } from 'react'
import { useMissionStore } from '../stores/useMissionStore'
import { usePlayerStore } from '../stores/usePlayerStore'
import { audioManager } from '../systems/AudioSystem'

export default function VictoryScreen({ onRestart }) {
  const [fadeIn, setFadeIn] = useState(false)
  const [showButton, setShowButton] = useState(false)
  const zombieKills = usePlayerStore((s) => s.zombieKills)
  const level = useMissionStore((s) => s.level)
  const xp = useMissionStore((s) => s.xp)
  const completedMissions = useMissionStore((s) => s.completedMissions)

  useEffect(() => {
    const t1 = setTimeout(() => setFadeIn(true), 100)
    const t2 = setTimeout(() => setShowButton(true), 3000)

    // Stopp gameplay-musikk og spill victory
    if (audioManager.initialized) {
      audioManager.stopMusic()
      audioManager.playSpecial('victory')
    }

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      audioManager.stopSpecial('victory')
    }
  }, [])

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: fadeIn ? 'rgba(0, 0, 0, 0.92)' : 'transparent',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'monospace',
      color: '#fff',
      zIndex: 200,
      transition: 'background 2s ease-in',
    }}>
      {/* Tittel */}
      <h1 style={{
        fontSize: 56,
        margin: 0,
        color: '#ffd700',
        textShadow: '0 0 40px rgba(255, 215, 0, 0.5)',
        opacity: fadeIn ? 1 : 0,
        transform: fadeIn ? 'translateY(0)' : 'translateY(30px)',
        transition: 'all 1.5s ease-out 0.5s',
      }}>
        DU OVERLEVDE
      </h1>

      {/* Undertekst */}
      <p style={{
        fontSize: 18,
        color: '#ccc',
        margin: '12px 0 40px',
        textAlign: 'center',
        maxWidth: 500,
        lineHeight: 1.6,
        opacity: fadeIn ? 1 : 0,
        transition: 'opacity 1.5s ease-out 1.5s',
      }}>
        Du nådde Eløya og fant kuren.<br />
        Larkollen er reddet.
      </p>

      {/* Statistikk */}
      <div style={{
        display: 'flex',
        gap: 40,
        marginBottom: 48,
        opacity: fadeIn ? 1 : 0,
        transition: 'opacity 1.5s ease-out 2.5s',
      }}>
        <Stat label="Zombier drept" value={zombieKills} />
        <Stat label="Nivå" value={level} />
        <Stat label="Totalt XP" value={xp} />
        <Stat label="Misjoner" value={completedMissions.length} />
      </div>

      {/* Spill igjen-knapp */}
      <button
        onClick={onRestart}
        style={{
          padding: '16px 48px',
          fontSize: 20,
          fontFamily: 'monospace',
          fontWeight: 'bold',
          color: '#000',
          background: '#ffd700',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          transition: 'all 0.3s',
          boxShadow: '0 0 30px rgba(255, 215, 0, 0.4)',
          opacity: showButton ? 1 : 0,
          transform: showButton ? 'translateY(0)' : 'translateY(20px)',
          pointerEvents: showButton ? 'auto' : 'none',
        }}
        onMouseEnter={e => {
          e.target.style.transform = 'scale(1.05)'
          e.target.style.boxShadow = '0 0 40px rgba(255, 215, 0, 0.6)'
        }}
        onMouseLeave={e => {
          e.target.style.transform = 'scale(1)'
          e.target.style.boxShadow = '0 0 30px rgba(255, 215, 0, 0.4)'
        }}
      >
        SPILL IGJEN
      </button>

      {/* Credits */}
      <p style={{
        position: 'absolute',
        bottom: 30,
        color: '#555',
        fontSize: 12,
        opacity: fadeIn ? 1 : 0,
        transition: 'opacity 2s ease-out 4s',
      }}>
        Larkollen Zombie Apocalypse – Laget med React Three Fiber
      </p>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 32, fontWeight: 'bold', color: '#ffd700' }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
        {label}
      </div>
    </div>
  )
}
