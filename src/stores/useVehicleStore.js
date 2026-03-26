import { create } from 'zustand'

// Delt ref: CameraSystem leser dette for å følge aktivt kjøretøy.
// Oppdateres av VehicleController hvert frame – ikke Zustand-state (unngår re-render).
export const activeVehicleBodyRef = { current: null }

// Kjøretøy-helse terskler
export const VEHICLE_SMOKE_THRESHOLD = 75
export const VEHICLE_FLAME_THRESHOLD = 50
export const VEHICLE_EXPLODE_THRESHOLD = 0

export const useVehicleStore = create((set, get) => ({
  vehicles: {
    car:   { fuel: 100, health: 100, exploded: false },
    truck: { fuel: 100, health: 100, exploded: false },
    boat:  { fuel: 100, health: 100, exploded: false },
  },
  activeId: null,

  setFuel: (id, fuel) =>
    set((s) => ({
      vehicles: {
        ...s.vehicles,
        [id]: { ...s.vehicles[id], fuel: Math.max(0, Math.min(100, fuel)) },
      },
    })),

  setHealth: (id, health) =>
    set((s) => ({
      vehicles: {
        ...s.vehicles,
        [id]: { ...s.vehicles[id], health: Math.max(0, Math.min(100, health)) },
      },
    })),

  damageVehicle: (id, amount) => {
    const { vehicles } = get()
    const v = vehicles[id]
    if (!v || v.exploded) return v?.health ?? 0
    const newHealth = Math.max(0, v.health - amount)
    set({
      vehicles: {
        ...vehicles,
        [id]: { ...v, health: newHealth, exploded: newHealth <= 0 ? true : v.exploded },
      },
    })
    return newHealth
  },

  setExploded: (id) =>
    set((s) => ({
      vehicles: {
        ...s.vehicles,
        [id]: { ...s.vehicles[id], exploded: true, health: 0 },
      },
    })),

  setActive: (id) => set({ activeId: id }),
  clearActive: () => set({ activeId: null }),
}))
