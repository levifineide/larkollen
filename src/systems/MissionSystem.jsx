import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { usePlayerStore } from '../stores/usePlayerStore'
import { useMissionStore } from '../stores/useMissionStore'
import { useGameStore, GameState } from '../stores/useGameStore'

// Sporer zombie-drap for kill_count-misjoner
let _lastKillCount = 0

export default function MissionSystem() {
  const checkTimerRef = useRef(0)

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    checkTimerRef.current -= dt
    if (checkTimerRef.current > 0) return
    checkTimerRef.current = 0.25 // Sjekk 4 ganger per sekund

    const store = useMissionStore.getState()
    const playerStore = usePlayerStore.getState()
    const playerPos = playerStore.position

    // ── Oppdater kill_count-misjoner ──────────────────────────────────────
    const currentKills = playerStore.zombieKills
    const newKills = currentKills - _lastKillCount
    if (newKills > 0) {
      _lastKillCount = currentKills
      for (const mission of store.activeMissions) {
        if (!mission.progress) continue
        mission.objectives.forEach((obj, i) => {
          if (obj.type !== 'kill_count') return
          const prog = mission.progress[i]
          if (prog.current < prog.target) {
            prog.current = Math.min(prog.current + newKills, prog.target)
            store.updateObjectiveProgress(mission.id, i, { ...prog })
          }
        })
      }
    }

    // ── Sjekk reach_location-misjoner ─────────────────────────────────────
    for (const mission of store.activeMissions) {
      if (!mission.progress) continue

      // Sjekk at tidligere mål er fullført (sekvensielle mål)
      let previousComplete = true

      mission.objectives.forEach((obj, i) => {
        if (obj.type === 'reach_location') {
          const prog = mission.progress[i]
          if (prog.reached) {
            previousComplete = true
            return
          }

          // Bare sjekk dette målet hvis forrige mål er fullført
          if (!previousComplete) return

          const target = obj.target
          const dx = playerPos[0] - target[0]
          const dz = playerPos[2] - target[2]
          const dist = Math.sqrt(dx * dx + dz * dz)

          if (dist < (obj.radius || 10)) {
            prog.reached = true
            store.updateObjectiveProgress(mission.id, i, { ...prog })
          } else {
            previousComplete = false
          }
        } else if (obj.type === 'kill_count') {
          const prog = mission.progress[i]
          if (prog.current < prog.target) {
            previousComplete = false
          }
        } else if (obj.type === 'escort_npc') {
          const prog = mission.progress[i]
          if (!prog.delivered) {
            previousComplete = false
          }
        }
      })
    }

    // ── Sjekk om hele misjonen er fullført ─────────────────────────────────
    for (const mission of store.activeMissions) {
      if (!mission.progress) continue

      const allComplete = mission.objectives.every((obj, i) => {
        const prog = mission.progress[i]
        if (!prog) return false
        if (obj.type === 'kill_count') return prog.current >= prog.target
        if (obj.type === 'reach_location') return prog.reached
        if (obj.type === 'escort_npc') return prog.delivered
        if (obj.type === 'collect_item') return prog.collected
        if (obj.type === 'survive_duration') return prog.elapsed >= prog.target
        return false
      })

      if (allComplete) {
        store.completeMission(mission.id)

        // Sjekk om misjonen gir seier
        if (mission.unlocks && mission.unlocks.includes('victory')) {
          useGameStore.getState().setState(GameState.VICTORY)
        }
      }
    }
  })

  return null
}
