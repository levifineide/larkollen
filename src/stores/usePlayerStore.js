import { create } from 'zustand'

export const usePlayerStore = create((set, get) => ({
  health: 100,
  stamina: 100,
  position: [50, 2, 0],
  isDriving: false,
  activeVehicleId: null,
  isCrouching: false,
  isSprinting: false,
  pendingTeleport: null,

  // Vanntilstand
  isInWater: false,
  isSwimming: false,
  waterDepth: 0,

  // Våpensystem
  activeWeapon: 'pistol',
  weapons: {
    pistol:  { unlocked: true,  mag: 12, reserve: 48 },
    shotgun: { unlocked: true,  mag: 6,  reserve: 24 },
    rifle:   { unlocked: true,  mag: 30, reserve: 90 },
    ak47:    { unlocked: false, mag: 30, reserve: 0 },
    molotov: { unlocked: false, mag: 1,  reserve: 0 },
    grenade: { unlocked: false, mag: 1,  reserve: 0 },
    crowbar: { unlocked: true,  mag: -1, reserve: -1 },
  },
  isReloading: false,
  isAiming: false,
  zombieKills: 0,

  setHealth: (health) => set({ health: Math.max(0, Math.min(100, health)) }),
  setStamina: (stamina) => set({ stamina: Math.max(0, Math.min(100, stamina)) }),
  setPosition: (position) => set({ position }),
  setPendingTeleport: (pos) => set({ pendingTeleport: pos }),

  setWaterState: (isInWater, isSwimming, waterDepth) =>
    set({ isInWater, isSwimming, waterDepth }),

  setDriving: (vehicleId) => set({ isDriving: !!vehicleId, activeVehicleId: vehicleId }),
  setIsCrouching: (isCrouching) => set({ isCrouching }),
  setCrouching: (isCrouching) => set({ isCrouching }),
  setIsSprinting: (isSprinting) => set({ isSprinting }),
  setSprinting: (isSprinting) => set({ isSprinting }),

  setActiveWeapon: (weapon) => set({ activeWeapon: weapon, isReloading: false }),
  setIsReloading: (isReloading) => set({ isReloading }),
  setIsAiming: (isAiming) => set({ isAiming }),

  // Bruk ammunisjon – returnerer true om skuddet er gyldig
  consumeAmmo: (weaponId) => {
    const { weapons } = get()
    const w = weapons[weaponId]
    if (!w || !w.unlocked) return false
    if (w.mag === -1) return true // melee
    if (w.mag <= 0) return false
    set({
      weapons: {
        ...weapons,
        [weaponId]: { ...w, mag: w.mag - 1 },
      },
    })
    return true
  },

  // Reload aktivt våpen
  reloadWeapon: (weaponId, magSize) => {
    const { weapons } = get()
    const w = weapons[weaponId]
    if (!w || w.mag === -1) return // melee
    const needed = magSize - w.mag
    const available = Math.min(needed, w.reserve)
    if (available <= 0) return
    set({
      weapons: {
        ...weapons,
        [weaponId]: { ...w, mag: w.mag + available, reserve: w.reserve - available },
      },
      isReloading: false,
    })
  },

  addAmmo: (weaponId, amount) => {
    const { weapons } = get()
    const w = weapons[weaponId]
    if (!w) return
    set({
      weapons: {
        ...weapons,
        [weaponId]: { ...w, reserve: w.reserve + amount },
      },
    })
  },

  incrementKills: () => set((s) => ({ zombieKills: s.zombieKills + 1 })),

  takeDamage: (amount) => {
    const { health } = get()
    const newHealth = Math.max(0, health - amount)
    set({ health: newHealth })
    return newHealth
  },
}))
