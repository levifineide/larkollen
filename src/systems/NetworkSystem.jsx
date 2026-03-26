import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { io } from 'socket.io-client'
import { useMultiplayerStore } from '../stores/useMultiplayerStore'
import { usePlayerStore } from '../stores/usePlayerStore'
import { inputState } from './InputSystem'

const SERVER_URL = 'http://localhost:3001'
const SEND_RATE = 20 // Hz – synkroniseringsfrekvens til server
const PING_INTERVAL = 3000 // ms mellom ping-sjekker

// Modul-nivå socket – delt med andre systemer
export let socket = null

export function getSocket() {
  return socket
}

export function connectToServer() {
  if (socket?.connected) return socket
  socket = io(SERVER_URL, {
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  })
  return socket
}

export function disconnectFromServer() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
  useMultiplayerStore.getState().reset()
}

export function createRoom(name) {
  return new Promise((resolve) => {
    const s = connectToServer()
    s.emit('create-room', { name }, (response) => {
      if (response.ok) {
        const store = useMultiplayerStore.getState()
        store.setConnected(true)
        store.setRoomCode(response.roomCode)
        store.setLocalPlayerId(response.playerId)
        store.setIsHost(true)
        store.setLobbyPlayers([{ id: response.playerId, name }])
      }
      resolve(response)
    })
  })
}

export function joinRoom(code, name) {
  return new Promise((resolve) => {
    const s = connectToServer()
    s.emit('join-room', { code, name }, (response) => {
      if (response.ok) {
        const store = useMultiplayerStore.getState()
        store.setConnected(true)
        store.setRoomCode(response.roomCode)
        store.setLocalPlayerId(response.playerId)
        store.setIsHost(response.isHost)
        store.setLobbyPlayers(response.players)
      }
      resolve(response)
    })
  })
}

export function startGame() {
  socket?.emit('start-game')
}

export function sendChat(message) {
  socket?.emit('chat', { message })
}

// ── React-komponent: håndterer socket-events og sender spillerdata ───────────
export default function NetworkSystem() {
  const sendTimerRef = useRef(0)
  const pingTimerRef = useRef(0)
  const lastSentRef = useRef({})

  useEffect(() => {
    // Koble til socket-events bare når socket finnes
    const s = socket
    if (!s) return

    const store = useMultiplayerStore.getState

    const onPlayerJoined = ({ id, name }) => {
      store().addLobbyPlayer({ id, name })
    }

    const onPlayerLeft = ({ id }) => {
      store().removeLobbyPlayer(id)
      store().removeRemotePlayer(id)
    }

    const onGameStarted = () => {
      store().setGameStarted(true)
      store().setLobbyOpen(false)
    }

    const onState = ({ players, serverTime }) => {
      const localId = store().localPlayerId
      store().updateRemotePlayers(players, localId)
    }

    const onHostChanged = ({ newHostId }) => {
      store().setIsHost(newHostId === store().localPlayerId)
    }

    const onChat = (msg) => {
      store().addChatMessage(msg)
    }

    const onZombieKilled = ({ zombieId, killedBy }) => {
      // Dispatche til ZombieManager via custom event
      window.dispatchEvent(
        new CustomEvent('network-zombie-killed', { detail: { zombieId, killedBy } })
      )
    }

    const onZombieSpawned = ({ zombieId, x, y, z }) => {
      window.dispatchEvent(
        new CustomEvent('network-zombie-spawned', { detail: { zombieId, x, y, z } })
      )
    }

    const onDisconnect = () => {
      store().setConnected(false)
    }

    const onReconnect = () => {
      store().setConnected(true)
    }

    s.on('player-joined', onPlayerJoined)
    s.on('player-left', onPlayerLeft)
    s.on('game-started', onGameStarted)
    s.on('state', onState)
    s.on('host-changed', onHostChanged)
    s.on('chat', onChat)
    s.on('zombie-killed', onZombieKilled)
    s.on('zombie-spawned', onZombieSpawned)
    s.on('disconnect', onDisconnect)
    s.on('connect', onReconnect)

    return () => {
      s.off('player-joined', onPlayerJoined)
      s.off('player-left', onPlayerLeft)
      s.off('game-started', onGameStarted)
      s.off('state', onState)
      s.off('host-changed', onHostChanged)
      s.off('chat', onChat)
      s.off('zombie-killed', onZombieKilled)
      s.off('zombie-spawned', onZombieSpawned)
      s.off('disconnect', onDisconnect)
      s.off('connect', onReconnect)
    }
  }, [])

  // Send spillerdata til server ved fast rate
  useFrame((_, delta) => {
    if (!socket?.connected) return

    const { isConnected, gameStarted } = useMultiplayerStore.getState()
    if (!isConnected || !gameStarted) return

    // Send spillerposisjon
    sendTimerRef.current += delta
    if (sendTimerRef.current >= 1 / SEND_RATE) {
      sendTimerRef.current = 0

      const { position, health, activeWeapon, isDriving, isSprinting, isCrouching } =
        usePlayerStore.getState()

      const data = {
        x: position[0],
        y: position[1],
        z: position[2],
        rotY: 0, // Settes av mesh rotation
        health,
        activeWeapon,
        isDriving,
        isSprinting,
        isCrouching,
        isShooting: inputState.shoot,
      }

      // Bare send om data har endret seg
      const last = lastSentRef.current
      const changed =
        Math.abs((last.x || 0) - data.x) > 0.01 ||
        Math.abs((last.y || 0) - data.y) > 0.01 ||
        Math.abs((last.z || 0) - data.z) > 0.01 ||
        last.health !== data.health ||
        last.activeWeapon !== data.activeWeapon ||
        last.isDriving !== data.isDriving ||
        last.isShooting !== data.isShooting

      if (changed) {
        socket.volatile.emit('player-update', data)
        lastSentRef.current = data
      }
    }

    // Ping-sjekk
    pingTimerRef.current += delta * 1000
    if (pingTimerRef.current >= PING_INTERVAL) {
      pingTimerRef.current = 0
      const start = Date.now()
      socket.emit('ping-check', null, (serverTime) => {
        const rtt = Date.now() - start
        useMultiplayerStore.getState().setPing(rtt)
      })
    }
  })

  return null
}
