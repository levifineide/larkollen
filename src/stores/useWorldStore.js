import { create } from 'zustand'

// Dag/natt-syklus: 20 min real-time = full dag
const DAY_DURATION = 20 * 60 // sekunder

export const useWorldStore = create((set, get) => ({
  isLoaded: false,
  mapSource: 'procedural', // 'procedural' | 'glb'

  // Vær
  weather: 'none', // 'none' | 'heavy' | 'storm'
  windStrength: 0.2,

  // Dag/natt – timeOfDay: 0..1 (0=midnatt, 0.25=soloppgang, 0.5=midt på dagen, 0.75=solnedgang)
  timeOfDay: 0.35, // start litt etter soloppgang
  dayDuration: DAY_DURATION,
  dayNightPaused: false,

  // Lysmodus: 'normal' (følger klokke), 'day' (alltid dagslys), 'evening' (alltid kveld)
  lightingMode: 'normal',

  zombieCount: 0,
  vehicles: {},

  // Trigger-status for nøkkelposisjoner
  gasStationVisited: false,
  eloyaReached: false,

  setLoaded: (isLoaded) => set({ isLoaded }),
  setMapSource: (mapSource) => set({ mapSource }),
  setWeather: (weather) => set({ weather }),
  setWindStrength: (windStrength) => set({ windStrength }),
  setTimeOfDay: (timeOfDay) => set({ timeOfDay: timeOfDay % 1 }),
  setDayNightPaused: (paused) => set({ dayNightPaused: paused }),
  setLightingMode: (mode) => set({ lightingMode: mode }),
  advanceTime: (deltaSec) => {
    const s = get()
    if (s.dayNightPaused) return
    set({ timeOfDay: (s.timeOfDay + deltaSec / s.dayDuration) % 1 })
  },
  setZombieCount: (zombieCount) => set({ zombieCount }),
  setGasStationVisited: () => set({ gasStationVisited: true }),
  setEloyaReached: () => set({ eloyaReached: true }),
  addVehicle: (id, data) => set((s) => ({ vehicles: { ...s.vehicles, [id]: data } })),
  removeVehicle: (id) =>
    set((s) => {
      const vehicles = { ...s.vehicles }
      delete vehicles[id]
      return { vehicles }
    }),
}))
