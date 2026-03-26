import { useEffect, useState, useRef } from 'react'
import { usePlayerStore } from '../stores/usePlayerStore'
import { inputState } from '../systems/InputSystem'
import weaponData from '../data/weapons.json'

const WHEEL_RADIUS = 120
const ITEM_SIZE = 56

const WEAPON_COLORS = {
  pistol: '#aaa',
  shotgun: '#8B0000',
  rifle: '#556B2F',
  ak47: '#8B4513',
  molotov: '#cc4400',
  grenade: '#3a3a2a',
  crowbar: '#666',
}

export default function WeaponWheel() {
  const [visible, setVisible] = useState(false)
  const [hoveredIndex, setHoveredIndex] = useState(-1)
  const weapons = usePlayerStore(s => s.weapons)
  const activeWeapon = usePlayerStore(s => s.activeWeapon)
  const wasHoldingRef = useRef(false)

  // Filtrer til kun opplåste våpen (memoisert med useMemo-aktig pattern)
  const unlockedWeaponsRef = useRef([])
  const unlockedWeapons = Object.entries(weaponData)
    .filter(([id]) => weapons[id]?.unlocked)
    .map(([id, data]) => ({ id, ...data }))
  unlockedWeaponsRef.current = unlockedWeapons

  // Enkel polling – kun når synlig, via en enkel interval
  useEffect(() => {
    let interval

    const poll = () => {
      const isHolding = inputState.weaponWheel

      if (isHolding && !wasHoldingRef.current) {
        wasHoldingRef.current = true
        setVisible(true)
      } else if (!isHolding && wasHoldingRef.current) {
        wasHoldingRef.current = false
        // Velg våpen ved slipp
        setVisible(false)
        setHoveredIndex(prev => {
          if (prev >= 0 && prev < unlockedWeaponsRef.current.length) {
            const selected = unlockedWeaponsRef.current[prev]
            if (selected.id !== usePlayerStore.getState().activeWeapon) {
              usePlayerStore.getState().setActiveWeapon(selected.id)
            }
          }
          return -1
        })
      }

      if (isHolding) {
        // Beregn hovered basert på musposisjon
        const cx = window.innerWidth / 2
        const cy = window.innerHeight / 2
        const mx = inputState.mouseX - cx
        const my = inputState.mouseY - cy
        const dist = Math.sqrt(mx * mx + my * my)

        if (dist > 30) {
          let angle = Math.atan2(my, mx)
          if (angle < 0) angle += Math.PI * 2
          const count = unlockedWeaponsRef.current.length
          if (count > 0) {
            const sliceAngle = (Math.PI * 2) / count
            const idx = Math.floor((angle + sliceAngle / 2) % (Math.PI * 2) / sliceAngle)
            setHoveredIndex(idx % count)
          }
        }
      }
    }

    // Sjekk kun 10 ganger per sekund (ikke hvert frame)
    interval = setInterval(poll, 100)
    return () => clearInterval(interval)
  }, []) // Tom dependency array – bruker refs i stedet

  if (!visible) return null

  const count = unlockedWeapons.length

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50,
      pointerEvents: 'none',
    }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
      }} />

      <div style={{ position: 'relative', width: WHEEL_RADIUS * 2 + ITEM_SIZE, height: WHEEL_RADIUS * 2 + ITEM_SIZE }}>
        {unlockedWeapons.map((weapon, i) => {
          const angle = (i / count) * Math.PI * 2 - Math.PI / 2
          const x = Math.cos(angle) * WHEEL_RADIUS
          const y = Math.sin(angle) * WHEEL_RADIUS
          const isHovered = i === hoveredIndex
          const isActive = weapon.id === activeWeapon
          const wState = weapons[weapon.id]

          return (
            <div
              key={weapon.id}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))${isHovered ? ' scale(1.15)' : ''}`,
                width: ITEM_SIZE,
                height: ITEM_SIZE,
                borderRadius: '50%',
                background: isHovered
                  ? 'rgba(255,255,255,0.25)'
                  : isActive
                    ? 'rgba(255,215,0,0.2)'
                    : 'rgba(0,0,0,0.6)',
                border: `2px solid ${isHovered ? '#fff' : isActive ? '#ffd700' : '#555'}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'transform 0.1s, background 0.1s',
              }}
            >
              <div style={{
                width: 24,
                height: 24,
                borderRadius: 4,
                background: WEAPON_COLORS[weapon.id] || '#888',
                marginBottom: 2,
              }} />
              <div style={{
                fontFamily: 'monospace',
                fontSize: 9,
                color: '#fff',
                textAlign: 'center',
                whiteSpace: 'nowrap',
              }}>
                {weapon.displayName}
              </div>
              {wState && wState.mag !== -1 && (
                <div style={{
                  fontFamily: 'monospace',
                  fontSize: 8,
                  color: '#aaa',
                }}>
                  {wState.mag}/{wState.reserve}
                </div>
              )}
            </div>
          )
        })}

        <div style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.7)',
          border: '2px solid #555',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'monospace',
          fontSize: 10,
          color: '#888',
        }}>
          Q
        </div>
      </div>
    </div>
  )
}
