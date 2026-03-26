import { useEffect, useState } from 'react'
import { usePlayerStore } from '../stores/usePlayerStore'
import { useVehicleStore } from '../stores/useVehicleStore'
import { useMissionStore } from '../stores/useMissionStore'
import { useWorldStore } from '../stores/useWorldStore'
import weaponData from '../data/weapons.json'

export default function HUD() {
  const health  = usePlayerStore((s) => s.health)
  const stamina = usePlayerStore((s) => s.stamina)
  const isDriving = usePlayerStore((s) => s.isDriving)
  const activeVehicleId = usePlayerStore((s) => s.activeVehicleId)
  const activeWeapon = usePlayerStore((s) => s.activeWeapon)
  const weapons = usePlayerStore((s) => s.weapons)
  const isReloading = usePlayerStore((s) => s.isReloading)
  const isAiming = usePlayerStore((s) => s.isAiming)
  const zombieKills = usePlayerStore((s) => s.zombieKills)
  const vehicleState = useVehicleStore((s) =>
    activeVehicleId ? s.vehicles[activeVehicleId] : null
  )
  const fuel = vehicleState?.fuel ?? 0
  const vehicleHealth = vehicleState?.health ?? 100
  const xp = useMissionStore((s) => s.xp)
  const level = useMissionStore((s) => s.level)
  const levelUpPending = useMissionStore((s) => s.levelUpPending)
  const clearLevelUp = useMissionStore((s) => s.clearLevelUp)

  const [pointerLocked, setPointerLocked] = useState(false)
  useEffect(() => {
    const onChange = () => setPointerLocked(document.pointerLockElement !== null)
    document.addEventListener('pointerlockchange', onChange)
    return () => document.removeEventListener('pointerlockchange', onChange)
  }, [])

  const wConfig = weaponData[activeWeapon]
  const wState = weapons[activeWeapon]

  // XP-fremgang innen nåværende nivå (0-100%)
  const xpInLevel = xp % 1000
  const xpProgress = (xpInLevel / 1000) * 100

  return (
    <>
      {/* Trådkors – kun synlig når musepeker er låst (gameplay-modus) */}
      {!isDriving && pointerLocked && <Crosshair isAiming={isAiming} />}

      {/* Statusbarene – nedre venstre */}
      <div style={{
        position: 'fixed',
        bottom: 24,
        left: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        pointerEvents: 'none',
        fontFamily: 'monospace',
        fontSize: 13,
      }}>
        <Bar label="Helse" value={health} color="#e63946" />
        <Bar label="Utholdenhet" value={stamina} color="#2a9d8f" />
        {isDriving && <Bar label="Drivstoff" value={fuel} color="#f4a261" />}
        {isDriving && <Bar label="Kjøretøy" value={vehicleHealth} color={vehicleHealth < 50 ? '#ff4400' : '#4a9eff'} />}
      </div>

      {/* Våpeninformasjon – nedre høyre */}
      {!isDriving && wConfig && wState && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          pointerEvents: 'none',
          fontFamily: 'monospace',
          fontSize: 13,
          color: '#ddd',
          textAlign: 'right',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}>
          <div style={{ fontSize: 16, fontWeight: 'bold', color: '#fff' }}>
            {wConfig.displayName}
          </div>
          {wConfig.magSize > 0 ? (
            <div style={{ fontSize: 22, letterSpacing: 1 }}>
              <span style={{ color: wState.mag <= 3 ? '#e63946' : '#fff' }}>
                {wState.mag}
              </span>
              <span style={{ color: '#666', fontSize: 14 }}> / {wState.reserve}</span>
            </div>
          ) : (
            <div style={{ fontSize: 14, color: '#aaa' }}>Nærkamp</div>
          )}
          {isReloading && (
            <div style={{ color: '#f4a261', fontSize: 14 }}>Lader om...</div>
          )}

          {/* Våpenvelger – vis kun opplåste våpen */}
          <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end', marginTop: 4, flexWrap: 'wrap', maxWidth: 260 }}>
            {Object.entries(weaponData)
              .filter(([id]) => weapons[id]?.unlocked)
              .map(([id, w]) => {
                const isActive = id === activeWeapon
                return (
                  <div key={id} style={{
                    width: 28,
                    height: 28,
                    borderRadius: 4,
                    border: `2px solid ${isActive ? '#fff' : '#555'}`,
                    background: isActive ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    color: '#ccc',
                  }}>
                    {w.slot}
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* Zombie-drap teller og XP – øvre høyre */}
      <div style={{
        position: 'fixed',
        top: 24,
        right: 24,
        pointerEvents: 'none',
        fontFamily: 'monospace',
        fontSize: 14,
        color: '#e63946',
        textAlign: 'right',
      }}>
        <span style={{ color: '#888', fontSize: 11 }}>DREPT</span>
        <br />
        <span style={{ fontSize: 24, fontWeight: 'bold' }}>{zombieKills}</span>
      </div>

      {/* Nivå og XP-bar – øvre venstre */}
      <div style={{
        position: 'fixed',
        top: 24,
        left: 24,
        pointerEvents: 'none',
        fontFamily: 'monospace',
        fontSize: 12,
        color: '#ccc',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '2px solid #ffd700',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)',
            color: '#ffd700',
            fontWeight: 'bold',
            fontSize: 14,
          }}>
            {level}
          </div>
          <div>
            <div style={{ color: '#888', fontSize: 10, marginBottom: 2 }}>
              NIVÅ {level} · {xp} XP
            </div>
            <div style={{
              width: 100,
              height: 6,
              background: '#333',
              borderRadius: 3,
              overflow: 'hidden',
              border: '1px solid #555',
            }}>
              <div style={{
                width: `${xpProgress}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #ffd700, #ffaa00)',
                borderRadius: 3,
                transition: 'width 0.3s',
              }} />
            </div>
          </div>
        </div>
      </div>

      {/* Level-up popup */}
      {levelUpPending && <LevelUpPopup levelUp={levelUpPending} onDismiss={clearLevelUp} />}

      {/* Vær-kontroll – øvre midt */}
      <WeatherControls />
    </>
  )
}

function Crosshair({ isAiming }) {
  const size = isAiming ? 12 : 20
  const gap = isAiming ? 2 : 5
  const thickness = 2
  const color = '#fff'

  return (
    <div style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
      zIndex: 5,
    }}>
      {/* Topp */}
      <div style={{
        position: 'absolute',
        width: thickness,
        height: size,
        background: color,
        left: -thickness / 2,
        top: -(size + gap),
        opacity: 0.8,
      }} />
      {/* Bunn */}
      <div style={{
        position: 'absolute',
        width: thickness,
        height: size,
        background: color,
        left: -thickness / 2,
        top: gap,
        opacity: 0.8,
      }} />
      {/* Venstre */}
      <div style={{
        position: 'absolute',
        width: size,
        height: thickness,
        background: color,
        left: -(size + gap),
        top: -thickness / 2,
        opacity: 0.8,
      }} />
      {/* Høyre */}
      <div style={{
        position: 'absolute',
        width: size,
        height: thickness,
        background: color,
        left: gap,
        top: -thickness / 2,
        opacity: 0.8,
      }} />
      {/* Sentral prikk */}
      <div style={{
        position: 'absolute',
        width: 3,
        height: 3,
        borderRadius: '50%',
        background: '#e63946',
        left: -1.5,
        top: -1.5,
      }} />
    </div>
  )
}

function LevelUpPopup({ levelUp, onDismiss }) {
  // Auto-dismiss etter 3 sekunder
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div style={{
      position: 'fixed',
      top: '35%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
      fontFamily: 'monospace',
      textAlign: 'center',
      zIndex: 30,
      animation: 'fadeInScale 0.4s ease-out',
    }}>
      <div style={{
        fontSize: 42,
        fontWeight: 'bold',
        color: '#ffd700',
        textShadow: '0 0 20px rgba(255, 215, 0, 0.6), 0 0 40px rgba(255, 215, 0, 0.3)',
        marginBottom: 8,
      }}>
        NIVÅ {levelUp.newLevel}!
      </div>
      {levelUp.unlock && (
        <div style={{
          fontSize: 16,
          color: '#fff',
          background: 'rgba(0,0,0,0.6)',
          padding: '6px 16px',
          borderRadius: 6,
          display: 'inline-block',
        }}>
          {levelUp.unlock.label}
        </div>
      )}
    </div>
  )
}

const WEATHER_MODES = ['none', 'drizzle', 'heavy', 'storm']
const WEATHER_LABELS = { none: 'Klart', drizzle: 'Yr', heavy: 'Regn', storm: 'Storm' }

function WeatherControls() {
  const weather = useWorldStore((s) => s.weather)
  const setWeather = useWorldStore((s) => s.setWeather)
  const timeOfDay = useWorldStore((s) => s.timeOfDay)
  const setTimeOfDay = useWorldStore((s) => s.setTimeOfDay)
  const dayNightPaused = useWorldStore((s) => s.dayNightPaused)
  const setDayNightPaused = useWorldStore((s) => s.setDayNightPaused)

  const hours = Math.floor(timeOfDay * 24)
  const minutes = Math.floor((timeOfDay * 24 - hours) * 60)
  const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`

  return (
    <div style={{
      position: 'fixed',
      top: 12,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      fontFamily: 'monospace',
      fontSize: 12,
      color: '#ccc',
      background: 'rgba(0,0,0,0.4)',
      padding: '6px 16px',
      borderRadius: 8,
      pointerEvents: 'auto',
      zIndex: 20,
    }}>
      <span style={{ fontSize: 16, fontWeight: 'bold', color: '#ffd700' }}>{timeStr}</span>
      <button
        onClick={() => setDayNightPaused(!dayNightPaused)}
        style={{
          background: dayNightPaused ? '#e63946' : '#333',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          padding: '2px 8px',
          cursor: 'pointer',
          fontFamily: 'monospace',
          fontSize: 11,
        }}
      >
        {dayNightPaused ? 'Pauset' : 'Pause'}
      </button>
      <span style={{ color: '#666' }}>|</span>
      {WEATHER_MODES.map(w => (
        <button
          key={w}
          onClick={() => setWeather(w)}
          style={{
            background: weather === w ? '#2a9d8f' : '#333',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            padding: '2px 8px',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: 11,
          }}
        >
          {WEATHER_LABELS[w]}
        </button>
      ))}
    </div>
  )
}

function Bar({ label, value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: '#ccc', width: 90, textAlign: 'right' }}>{label}</span>
      <div style={{
        width: 160,
        height: 10,
        background: '#333',
        borderRadius: 4,
        overflow: 'hidden',
        border: '1px solid #555',
      }}>
        <div style={{
          width: `${value}%`,
          height: '100%',
          background: color,
          borderRadius: 4,
          transition: 'width 0.15s',
        }} />
      </div>
      <span style={{ color: '#aaa', width: 30 }}>{Math.round(value)}</span>
    </div>
  )
}
