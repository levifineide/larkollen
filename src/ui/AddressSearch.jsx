import { useState, useRef, useEffect, useCallback } from 'react'
import { usePlayerStore } from '../stores/usePlayerStore'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || ''

// Kartets origo (Støtvig Hotel, Larkollen) — same som Minimap og build-map
const ORIGIN_LAT = 59.3289
const ORIGIN_LON = 10.6682
const DEG_TO_M_LAT = 111320
const DEG_TO_M_LON = 111320 * Math.cos(ORIGIN_LAT * Math.PI / 180)

// Begrens søk til Larkollen-området
const BBOX = '10.63,59.30,10.71,59.36'

/** Konverter lat/lon til spill-koordinater (X, Z) */
function latLonToGame(lat, lon) {
  const gameX = (lon - ORIGIN_LON) * DEG_TO_M_LON
  const gameZ = -(lat - ORIGIN_LAT) * DEG_TO_M_LAT
  return [gameX, gameZ]
}

/** Søke-overlay – åpnes/lukkes via open/onClose props */
export default function AddressSearch({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

  // Reset ved åpning
  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Escape lukker
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Søk med debounce
  const handleSearch = useCallback((value) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (value.trim().length < 2) {
      setResults([])
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(value)}.json?access_token=${MAPBOX_TOKEN}&bbox=${BBOX}&limit=5&language=no&types=address,poi`
        const res = await fetch(url)
        const data = await res.json()
        setResults(data.features || [])
      } catch (err) {
        console.error('Adressesøk feil:', err)
        setResults([])
      }
      setLoading(false)
    }, 300)
  }, [])

  // Velg adresse → teleporter
  const handleSelect = useCallback((feature) => {
    const [lon, lat] = feature.center
    const [gameX, gameZ] = latLonToGame(lat, lon)
    usePlayerStore.getState().setPendingTeleport([gameX, 20, gameZ])
    onClose()
  }, [onClose])

  if (!open) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      paddingTop: 120,
      zIndex: 50,
      pointerEvents: 'auto',
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        width: 400,
        background: '#1a1a2e',
        borderRadius: 12,
        border: '1px solid #333',
        boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
        fontFamily: 'monospace',
        overflow: 'hidden',
      }}>
        {/* Søkefelt */}
        <div style={{ padding: 16, borderBottom: '1px solid #333' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18, color: '#888' }}>&#128269;</span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Søk adresse i Larkollen..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#fff',
                fontSize: 16,
                fontFamily: 'monospace',
              }}
            />
            {loading && <span style={{ color: '#888', fontSize: 12 }}>...</span>}
          </div>
        </div>

        {/* Resultatliste */}
        {results.length > 0 && (
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {results.map((feature) => (
              <button
                key={feature.id}
                onClick={() => handleSelect(feature)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '12px 16px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid #222',
                  color: '#ccc',
                  fontFamily: 'monospace',
                  fontSize: 13,
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => e.target.style.background = 'rgba(230,57,70,0.15)'}
                onMouseLeave={(e) => e.target.style.background = 'transparent'}
              >
                <div style={{ color: '#fff', marginBottom: 2 }}>{feature.text}</div>
                <div style={{ fontSize: 11, color: '#666' }}>{feature.place_name}</div>
              </button>
            ))}
          </div>
        )}

        {/* Ingen treff */}
        {query.length >= 2 && !loading && results.length === 0 && (
          <div style={{ padding: 16, color: '#666', fontSize: 13, textAlign: 'center' }}>
            Ingen adresser funnet
          </div>
        )}

        {/* Hint */}
        {query.length < 2 && (
          <div style={{ padding: 16, color: '#555', fontSize: 12, textAlign: 'center' }}>
            Skriv minst 2 tegn for å søke
          </div>
        )}
      </div>
    </div>
  )
}
