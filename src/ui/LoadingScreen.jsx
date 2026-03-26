import { useState, useEffect } from 'react'

const TIPS = [
  'Shift for å sprinte – men pass på utholdenheten!',
  'Trykk F for å hoppe inn i et kjøretøy.',
  'Hold Q for våpenhjulet.',
  'Zombier tiltrekkes av lyd – skyt med omhu.',
  'Nå Eløya med båt for å vinne spillet.',
  'Snakk med NPC-er for å få misjoner.',
  'R for å lade om våpenet.',
]

export default function LoadingScreen() {
  const [tip, setTip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)])
  const [dots, setDots] = useState('')

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.')
    }, 500)
    return () => clearInterval(interval)
  }, [])

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'linear-gradient(180deg, #0a0a0a 0%, #1a0505 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'monospace',
      color: '#fff',
      zIndex: 300,
    }}>
      {/* Tittel */}
      <h1 style={{
        fontSize: 36,
        margin: 0,
        color: '#e63946',
        textShadow: '0 0 30px rgba(230,57,70,0.4)',
      }}>
        LARKOLLEN
      </h1>

      {/* Lasteindikar */}
      <div style={{
        marginTop: 32,
        fontSize: 18,
        color: '#ccc',
        minWidth: 120,
        textAlign: 'center',
      }}>
        Laster{dots}
      </div>

      {/* Progress-bar (animert) */}
      <div style={{
        marginTop: 16,
        width: 240,
        height: 4,
        background: '#333',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          width: '100%',
          height: '100%',
          background: 'linear-gradient(90deg, #e63946, #ffd700)',
          borderRadius: 2,
          animation: 'loadingPulse 2s ease-in-out infinite',
          transformOrigin: 'left',
        }} />
      </div>

      {/* Tips */}
      <p style={{
        marginTop: 40,
        fontSize: 13,
        color: '#666',
        maxWidth: 400,
        textAlign: 'center',
        lineHeight: 1.5,
      }}>
        {tip}
      </p>

      <style>{`
        @keyframes loadingPulse {
          0% { transform: scaleX(0.1); opacity: 0.5; }
          50% { transform: scaleX(0.8); opacity: 1; }
          100% { transform: scaleX(0.1); opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
