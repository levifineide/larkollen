import { useState } from 'react'
import { useMultiplayerStore } from '../stores/useMultiplayerStore'
import { createRoom, joinRoom, startGame, disconnectFromServer } from '../systems/NetworkSystem'

const STYLES = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'monospace',
    color: '#fff',
    zIndex: 200,
  },
  panel: {
    background: '#1a1a2e',
    borderRadius: 12,
    padding: '32px 40px',
    minWidth: 360,
    maxWidth: 440,
    border: '1px solid #333',
    boxShadow: '0 0 40px rgba(230,57,70,0.2)',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#e63946',
    margin: '0 0 24px',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    margin: '0 0 20px',
    textAlign: 'center',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    fontSize: 16,
    fontFamily: 'monospace',
    background: '#0f0f23',
    border: '1px solid #444',
    borderRadius: 6,
    color: '#fff',
    marginBottom: 12,
    boxSizing: 'border-box',
    outline: 'none',
  },
  btn: {
    width: '100%',
    padding: '12px 0',
    fontSize: 16,
    fontFamily: 'monospace',
    fontWeight: 'bold',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    marginBottom: 8,
    transition: 'opacity 0.15s',
  },
  btnPrimary: {
    background: '#e63946',
    color: '#fff',
  },
  btnSecondary: {
    background: '#2d2d4e',
    color: '#ccc',
    border: '1px solid #444',
  },
  error: {
    color: '#e63946',
    fontSize: 13,
    marginBottom: 12,
  },
  playerList: {
    listStyle: 'none',
    padding: 0,
    margin: '16px 0',
  },
  playerItem: {
    padding: '8px 12px',
    background: '#0f0f23',
    borderRadius: 4,
    marginBottom: 4,
    fontSize: 14,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roomCode: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#4ecdc4',
    textAlign: 'center',
    letterSpacing: 8,
    margin: '16px 0',
    padding: '12px 0',
    background: '#0f0f23',
    borderRadius: 8,
  },
  divider: {
    height: 1,
    background: '#333',
    margin: '16px 0',
    border: 'none',
  },
}

export default function Lobby({ onClose }) {
  const [view, setView] = useState('menu') // menu | create | join | waiting
  const [name, setName] = useState(useMultiplayerStore.getState().playerName || 'Spiller')
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const roomCode = useMultiplayerStore((s) => s.roomCode)
  const isHost = useMultiplayerStore((s) => s.isHost)
  const lobbyPlayers = useMultiplayerStore((s) => s.lobbyPlayers)

  const handleCreate = async () => {
    setLoading(true)
    setError('')
    useMultiplayerStore.getState().setPlayerName(name)
    const res = await createRoom(name)
    setLoading(false)
    if (res.ok) {
      setView('waiting')
    } else {
      setError(res.error || 'Kunne ikke opprette rom')
    }
  }

  const handleJoin = async () => {
    if (!joinCode.trim()) {
      setError('Skriv inn romkode')
      return
    }
    setLoading(true)
    setError('')
    useMultiplayerStore.getState().setPlayerName(name)
    const res = await joinRoom(joinCode.toUpperCase(), name)
    setLoading(false)
    if (res.ok) {
      setView('waiting')
    } else {
      setError(res.error || 'Kunne ikke bli med i rom')
    }
  }

  const handleStart = () => {
    startGame()
  }

  const handleLeave = () => {
    disconnectFromServer()
    setView('menu')
  }

  // ── Meny ─────────────────────────────────────────────────────────────────
  if (view === 'menu') {
    return (
      <div style={STYLES.overlay}>
        <div style={STYLES.panel}>
          <h2 style={STYLES.title}>FLERSPILLER</h2>
          <p style={STYLES.subtitle}>Spill med venner (2–10 spillere)</p>

          <input
            style={STYLES.input}
            placeholder="Ditt navn"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={16}
          />

          <button
            style={{ ...STYLES.btn, ...STYLES.btnPrimary }}
            onClick={() => setView('create')}
          >
            OPPRETT ROM
          </button>

          <button
            style={{ ...STYLES.btn, ...STYLES.btnSecondary }}
            onClick={() => setView('join')}
          >
            BLI MED I ROM
          </button>

          <hr style={STYLES.divider} />

          <button
            style={{ ...STYLES.btn, ...STYLES.btnSecondary, marginBottom: 0 }}
            onClick={onClose}
          >
            TILBAKE
          </button>
        </div>
      </div>
    )
  }

  // ── Opprett rom ──────────────────────────────────────────────────────────
  if (view === 'create') {
    return (
      <div style={STYLES.overlay}>
        <div style={STYLES.panel}>
          <h2 style={STYLES.title}>OPPRETT ROM</h2>
          {error && <p style={STYLES.error}>{error}</p>}

          <button
            style={{ ...STYLES.btn, ...STYLES.btnPrimary }}
            onClick={handleCreate}
            disabled={loading}
          >
            {loading ? 'OPPRETTER...' : 'OPPRETT'}
          </button>

          <button
            style={{ ...STYLES.btn, ...STYLES.btnSecondary, marginBottom: 0 }}
            onClick={() => { setView('menu'); setError('') }}
          >
            TILBAKE
          </button>
        </div>
      </div>
    )
  }

  // ── Bli med ──────────────────────────────────────────────────────────────
  if (view === 'join') {
    return (
      <div style={STYLES.overlay}>
        <div style={STYLES.panel}>
          <h2 style={STYLES.title}>BLI MED</h2>
          {error && <p style={STYLES.error}>{error}</p>}

          <input
            style={{ ...STYLES.input, textAlign: 'center', fontSize: 24, letterSpacing: 6, textTransform: 'uppercase' }}
            placeholder="KODE"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={5}
          />

          <button
            style={{ ...STYLES.btn, ...STYLES.btnPrimary }}
            onClick={handleJoin}
            disabled={loading}
          >
            {loading ? 'KOBLER TIL...' : 'BLI MED'}
          </button>

          <button
            style={{ ...STYLES.btn, ...STYLES.btnSecondary, marginBottom: 0 }}
            onClick={() => { setView('menu'); setError('') }}
          >
            TILBAKE
          </button>
        </div>
      </div>
    )
  }

  // ── Venterom ─────────────────────────────────────────────────────────────
  return (
    <div style={STYLES.overlay}>
      <div style={STYLES.panel}>
        <h2 style={STYLES.title}>VENTER PÅ SPILLERE</h2>

        <p style={STYLES.subtitle}>Del denne koden med vennene dine:</p>
        <div style={STYLES.roomCode}>{roomCode}</div>

        <p style={STYLES.subtitle}>
          {lobbyPlayers.length} / 10 spillere
        </p>

        <ul style={STYLES.playerList}>
          {lobbyPlayers.map((p, i) => (
            <li key={p.id} style={STYLES.playerItem}>
              <span>{p.name}</span>
              {i === 0 && (
                <span style={{ fontSize: 11, color: '#e63946' }}>HOST</span>
              )}
            </li>
          ))}
        </ul>

        {isHost && (
          <button
            style={{
              ...STYLES.btn,
              ...STYLES.btnPrimary,
              opacity: lobbyPlayers.length < 1 ? 0.5 : 1,
            }}
            onClick={handleStart}
            disabled={lobbyPlayers.length < 1}
          >
            START SPILLET
          </button>
        )}

        {!isHost && (
          <p style={{ ...STYLES.subtitle, color: '#4ecdc4' }}>
            Venter på at host starter spillet...
          </p>
        )}

        <button
          style={{ ...STYLES.btn, ...STYLES.btnSecondary, marginBottom: 0 }}
          onClick={handleLeave}
        >
          FORLAT ROM
        </button>
      </div>
    </div>
  )
}
