import { create } from 'zustand'

// XP-krav per nivå: nivå N krever N * 1000 XP totalt
// Nivå 1 = 0 XP, Nivå 2 = 1000, Nivå 3 = 2000 osv.
const XP_PER_LEVEL = 1000

// Opplåsinger per nivå
const LEVEL_UNLOCKS = {
  2: { type: 'weapon', id: 'shotgun', label: 'Hagle opplåst!' },
  3: { type: 'weapon', id: 'rifle', label: 'Rifle opplåst!' },
  4: { type: 'vehicle', id: 'truck', label: 'Lastebil opplåst!' },
  5: { type: 'area', id: 'harbor', label: 'Havneområdet opplåst!' },
  6: { type: 'companion', id: 'erik', label: 'Erik som følgesvenn opplåst!' },
  8: { type: 'vehicle', id: 'boat', label: 'Båt opplåst!' },
  10: { type: 'weapon', id: 'ak47', label: 'AK-47 opplåst!' },
  15: { type: 'ability', id: 'sprint_boost', label: 'Utholdenhet+50% opplåst!' },
  20: { type: 'victory', id: 'master', label: 'Mester av Larkollen!' },
}

export const useMissionStore = create((set, get) => ({
  activeMissions: [],
  completedMissions: [],
  xp: 0,
  level: 1,
  unlocks: [],

  // Notifikasjoner for UI
  notifications: [],       // { text, type, timestamp }
  levelUpPending: null,    // { newLevel, unlock } eller null

  addMission: (mission) =>
    set((s) => {
      // Unngå duplikater
      if (s.activeMissions.some((m) => m.id === mission.id)) return {}
      if (s.completedMissions.some((m) => m.id === mission.id)) return {}

      const notification = {
        text: `Nytt oppdrag: ${mission.title}`,
        type: 'mission_new',
        timestamp: Date.now(),
      }
      return {
        activeMissions: [...s.activeMissions, mission],
        notifications: [...s.notifications, notification],
      }
    }),

  completeMission: (missionId) =>
    set((s) => {
      const mission = s.activeMissions.find((m) => m.id === missionId)
      if (!mission) return {}

      const newXp = s.xp + (mission.xpReward || 0)
      const newLevel = Math.floor(newXp / XP_PER_LEVEL) + 1
      const oldLevel = s.level

      const notifications = [
        ...s.notifications,
        {
          text: `Oppdrag fullført: ${mission.title} (+${mission.xpReward} XP)`,
          type: 'mission_complete',
          timestamp: Date.now(),
        },
      ]

      // Sjekk level-up
      let levelUpPending = null
      const newUnlocks = [...s.unlocks]
      if (newLevel > oldLevel) {
        for (let lvl = oldLevel + 1; lvl <= newLevel; lvl++) {
          const unlock = LEVEL_UNLOCKS[lvl]
          if (unlock) {
            newUnlocks.push(unlock)
            levelUpPending = { newLevel: lvl, unlock }
            notifications.push({
              text: `Nivå ${lvl}! ${unlock.label}`,
              type: 'level_up',
              timestamp: Date.now(),
            })
          } else {
            levelUpPending = { newLevel: lvl, unlock: null }
            notifications.push({
              text: `Nivå ${lvl}!`,
              type: 'level_up',
              timestamp: Date.now(),
            })
          }
        }
      }

      return {
        activeMissions: s.activeMissions.filter((m) => m.id !== missionId),
        completedMissions: [...s.completedMissions, mission],
        xp: newXp,
        level: newLevel,
        unlocks: newUnlocks,
        notifications,
        levelUpPending,
      }
    }),

  updateObjectiveProgress: (missionId, objectiveIndex, progress) =>
    set((s) => {
      const missions = s.activeMissions.map((m) => {
        if (m.id !== missionId) return m
        return {
          ...m,
          progress: {
            ...m.progress,
            [objectiveIndex]: progress,
          },
        }
      })
      return { activeMissions: missions }
    }),

  addXp: (amount) =>
    set((s) => {
      const newXp = s.xp + amount
      const newLevel = Math.floor(newXp / XP_PER_LEVEL) + 1
      const oldLevel = s.level
      const newUnlocks = [...s.unlocks]
      const notifications = [...s.notifications]
      let levelUpPending = s.levelUpPending

      if (newLevel > oldLevel) {
        for (let lvl = oldLevel + 1; lvl <= newLevel; lvl++) {
          const unlock = LEVEL_UNLOCKS[lvl]
          if (unlock) {
            newUnlocks.push(unlock)
            levelUpPending = { newLevel: lvl, unlock }
          }
          notifications.push({
            text: unlock ? `Nivå ${lvl}! ${unlock.label}` : `Nivå ${lvl}!`,
            type: 'level_up',
            timestamp: Date.now(),
          })
        }
      }

      return {
        xp: newXp,
        level: newLevel,
        unlocks: newUnlocks,
        notifications,
        levelUpPending,
      }
    }),

  clearLevelUp: () => set({ levelUpPending: null }),

  dismissNotification: (timestamp) =>
    set((s) => ({
      notifications: s.notifications.filter((n) => n.timestamp !== timestamp),
    })),

  addUnlock: (unlock) => set((s) => ({ unlocks: [...s.unlocks, unlock] })),

  // Sjekk om en navngitt lokasjon er nådd (brukes av GameplayTriggers)
  checkLocationReached: (locationId) => {
    const s = get()
    for (const mission of s.activeMissions) {
      if (!mission.progress) continue
      mission.objectives.forEach((obj, i) => {
        if (obj.type === 'reach_location' && obj.locationId === locationId) {
          const prog = mission.progress[i]
          if (prog && !prog.reached) {
            prog.reached = true
            s.updateObjectiveProgress(mission.id, i, { ...prog })
          }
        }
      })
    }
  },
}))
