import { create } from 'zustand'

// Mulige spilltilstander
const GameState = {
  INTRO: 'intro',
  LOADING: 'loading',
  PLAYING: 'playing',
  PAUSED: 'paused',
  GAMEOVER: 'gameover',
}

export const useGameStore = create((set) => ({
  state: GameState.LOADING,
  day: 1,
  timeOfDay: 6, // timer (0-24)

  setState: (state) => set({ state }),
  setTimeOfDay: (timeOfDay) => set({ timeOfDay }),
  nextDay: () => set((s) => ({ day: s.day + 1 })),
}))
