import { useState, useEffect } from 'react'
import { useMissionStore } from '../stores/useMissionStore'

export default function MissionPanel() {
  const activeMissions = useMissionStore((s) => s.activeMissions)
  const notifications = useMissionStore((s) => s.notifications)
  const dismissNotification = useMissionStore((s) => s.dismissNotification)

  // Auto-dismiss notifikasjoner etter 4 sekunder
  useEffect(() => {
    if (notifications.length === 0) return
    const timer = setInterval(() => {
      const now = Date.now()
      for (const n of notifications) {
        if (now - n.timestamp > 4000) {
          dismissNotification(n.timestamp)
        }
      }
    }, 500)
    return () => clearInterval(timer)
  }, [notifications, dismissNotification])

  return (
    <>
      {/* GTA-stil oppdragsliste – øvre høyre (under drap-teller) */}
      <div style={{
        position: 'fixed',
        top: 70,
        right: 24,
        pointerEvents: 'none',
        fontFamily: 'monospace',
        maxWidth: 280,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        {activeMissions.map((mission) => (
          <MissionCard key={mission.id} mission={mission} />
        ))}
      </div>

      {/* Notifikasjoner – øvre senter */}
      <div style={{
        position: 'fixed',
        top: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        fontFamily: 'monospace',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        zIndex: 20,
      }}>
        {notifications.slice(-3).map((n) => (
          <Notification key={n.timestamp} notification={n} />
        ))}
      </div>
    </>
  )
}

function MissionCard({ mission }) {
  return (
    <div style={{
      background: 'rgba(0, 0, 0, 0.65)',
      borderLeft: '3px solid #f4a261',
      padding: '8px 12px',
      borderRadius: '0 4px 4px 0',
    }}>
      <div style={{
        color: '#f4a261',
        fontSize: 12,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 4,
      }}>
        {mission.title}
      </div>
      {mission.objectives.map((obj, i) => {
        const prog = mission.progress?.[i]
        const isComplete = checkObjectiveComplete(obj, prog)

        return (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            color: isComplete ? '#6bbd6b' : '#ccc',
            marginTop: 2,
            opacity: isComplete ? 0.7 : 1,
          }}>
            <span style={{ fontSize: 10 }}>{isComplete ? '✓' : '○'}</span>
            <span style={{
              textDecoration: isComplete ? 'line-through' : 'none',
            }}>
              {formatObjective(obj, prog)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function Notification({ notification }) {
  const colorMap = {
    mission_new: '#f4a261',
    mission_complete: '#6bbd6b',
    level_up: '#ffd700',
  }
  const color = colorMap[notification.type] || '#ccc'

  // Fade-in animasjon via CSS
  const age = Date.now() - notification.timestamp
  const opacity = age < 300 ? age / 300 : age > 3500 ? 1 - (age - 3500) / 500 : 1

  return (
    <div style={{
      background: 'rgba(0, 0, 0, 0.75)',
      border: `1px solid ${color}`,
      borderRadius: 6,
      padding: '8px 20px',
      color,
      fontSize: notification.type === 'level_up' ? 16 : 13,
      fontWeight: 'bold',
      textAlign: 'center',
      opacity: Math.max(0, opacity),
      transition: 'opacity 0.3s',
      textShadow: notification.type === 'level_up' ? `0 0 10px ${color}` : 'none',
    }}>
      {notification.text}
    </div>
  )
}

function checkObjectiveComplete(obj, prog) {
  if (!prog) return false
  if (obj.type === 'kill_count') return prog.current >= prog.target
  if (obj.type === 'reach_location') return prog.reached
  if (obj.type === 'escort_npc') return prog.delivered
  if (obj.type === 'collect_item') return prog.collected
  return false
}

function formatObjective(obj, prog) {
  if (obj.type === 'kill_count' && prog) {
    return `${obj.description} (${prog.current}/${prog.target})`
  }
  return obj.description
}
