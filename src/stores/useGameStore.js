import { create } from 'zustand'

// Mulige spilltilstander
export const GameState = {
  INTRO: 'intro',
  LOADING: 'loading',
  PLAYING: 'playing',
  PAUSED: 'paused',
  GAMEOVER: 'gameover',
  VICTORY: 'victory',
}

export const useGameStore = create((set) => ({
  state: GameState.LOADING,
  day: 1,
  timeOfDay: 6, // timer (0-24)

  setState: (state) => set({ state }),
  setTimeOfDay: (timeOfDay) => set({ timeOfDay }),
  nextDay: () => set((s) => ({ day: s.day + 1 })),

  // Reset for å spille igjen
  reset: () => set({ state: GameState.LOADING, day: 1, timeOfDay: 6 }),
}))
