import { create } from 'zustand'

export const useMultiplayerStore = create((set, get) => ({
  // Tilkobling
  isConnected: false,
  roomCode: null,
  localPlayerId: null,
  isHost: false,
  ping: 0,

  // Lobby
  lobbyOpen: false,
  lobbyPlayers: [], // { id, name }
  gameStarted: false,
  playerName: 'Spiller',

  // Andre spillere (nettverks-state)
  remotePlayers: {}, // id → { x, y, z, rotY, health, activeWeapon, isDriving, isSprinting, isCrouching, isShooting, name, prevX, prevY, prevZ, prevRotY, lastUpdate }

  // Chat
  chatMessages: [], // { from, name, message, timestamp }

  // Tilkoblings-handlinger
  setConnected: (isConnected) => set({ isConnected }),
  setRoomCode: (roomCode) => set({ roomCode }),
  setLocalPlayerId: (localPlayerId) => set({ localPlayerId }),
  setIsHost: (isHost) => set({ isHost }),
  setPing: (ping) => set({ ping }),
  setPlayerName: (playerName) => set({ playerName }),

  // Lobby
  setLobbyOpen: (lobbyOpen) => set({ lobbyOpen }),
  setLobbyPlayers: (lobbyPlayers) => set({ lobbyPlayers }),
  setGameStarted: (gameStarted) => set({ gameStarted }),

  addLobbyPlayer: (player) =>
    set((s) => ({
      lobbyPlayers: s.lobbyPlayers.some((p) => p.id === player.id)
        ? s.lobbyPlayers
        : [...s.lobbyPlayers, player],
    })),

  removeLobbyPlayer: (id) =>
    set((s) => ({
      lobbyPlayers: s.lobbyPlayers.filter((p) => p.id !== id),
    })),

  // Remote spillere – oppdateres fra server state-broadcast
  updateRemotePlayers: (serverPlayers, localId) =>
    set((s) => {
      const updated = {}
      for (const [id, data] of Object.entries(serverPlayers)) {
        if (id === localId) continue // Ikke inkluder lokal spiller

        const prev = s.remotePlayers[id]
        updated[id] = {
          ...data,
          // Lagre forrige posisjon for interpolering
          prevX: prev?.x ?? data.x,
          prevY: prev?.y ?? data.y,
          prevZ: prev?.z ?? data.z,
          prevRotY: prev?.rotY ?? data.rotY,
          lastUpdate: Date.now(),
        }
      }
      return { remotePlayers: updated }
    }),

  removeRemotePlayer: (id) =>
    set((s) => {
      const remotePlayers = { ...s.remotePlayers }
      delete remotePlayers[id]
      return { remotePlayers }
    }),

  // Chat
  addChatMessage: (msg) =>
    set((s) => ({
      chatMessages: [...s.chatMessages.slice(-49), { ...msg, timestamp: Date.now() }],
    })),

  // Tilbakestill alt ved frakobling
  reset: () =>
    set({
      isConnected: false,
      roomCode: null,
      localPlayerId: null,
      isHost: false,
      ping: 0,
      lobbyOpen: false,
      lobbyPlayers: [],
      gameStarted: false,
      remotePlayers: {},
      chatMessages: [],
    }),
}))
