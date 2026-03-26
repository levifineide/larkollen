import { create } from 'zustand'

export const useMultiplayerStore = create((set) => ({
  isConnected: false,
  roomCode: null,
  localPlayerId: null,
  remotePlayers: {},
  ping: 0,

  setConnected: (isConnected) => set({ isConnected }),
  setRoomCode: (roomCode) => set({ roomCode }),
  setLocalPlayerId: (localPlayerId) => set({ localPlayerId }),
  setPing: (ping) => set({ ping }),
  updateRemotePlayer: (id, data) =>
    set((s) => ({ remotePlayers: { ...s.remotePlayers, [id]: data } })),
  removeRemotePlayer: (id) =>
    set((s) => {
      const remotePlayers = { ...s.remotePlayers }
      delete remotePlayers[id]
      return { remotePlayers }
    }),
}))
