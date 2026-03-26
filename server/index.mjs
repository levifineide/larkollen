import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'

const PORT = 3001
const app = express()
const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
})

// ── Norske 4-bokstavs romkoder ───────────────────────────────────────────────
const NORSKE_ORD = [
  'ULVE', 'BJRN', 'ELGR', 'REVN', 'HAUK', 'ØRNE', 'TROL', 'GEIT',
  'HVAL', 'SEIL', 'FJEL', 'SKOG', 'VIND', 'REGN', 'SNOE', 'DAGE',
  'NATT', 'MORK', 'LJOS', 'KALD', 'BLOD', 'DOED', 'GRAV', 'SKUM',
]

function generateRoomCode() {
  return NORSKE_ORD[Math.floor(Math.random() * NORSKE_ORD.length)]
}

// ── Rom-state ────────────────────────────────────────────────────────────────
const rooms = new Map() // roomCode → RoomState

function createRoom(hostId) {
  let code = generateRoomCode()
  let attempts = 0
  while (rooms.has(code) && attempts < 50) {
    code = NORSKE_ORD[Math.floor(Math.random() * NORSKE_ORD.length)]
    attempts++
  }
  if (rooms.has(code)) {
    code = code + Math.floor(Math.random() * 10)
  }

  const room = {
    code,
    hostId,
    players: new Map(), // socketId → PlayerState
    zombies: new Map(), // zombieId → { x, y, z, health, state }
    nextZombieId: 0,
    started: false,
    createdAt: Date.now(),
  }
  rooms.set(code, room)
  return room
}

function getPlayerRoom(socketId) {
  for (const [, room] of rooms) {
    if (room.players.has(socketId)) return room
  }
  return null
}

// ── Server tick (20 Hz) ──────────────────────────────────────────────────────
const TICK_RATE = 20
const TICK_MS = 1000 / TICK_RATE

setInterval(() => {
  for (const [code, room] of rooms) {
    if (!room.started || room.players.size === 0) continue

    // Bygg state-snapshot for alle spillere i rommet
    const playerStates = {}
    for (const [id, p] of room.players) {
      playerStates[id] = {
        x: p.x, y: p.y, z: p.z,
        rotY: p.rotY,
        health: p.health,
        activeWeapon: p.activeWeapon,
        isDriving: p.isDriving,
        isSprinting: p.isSprinting,
        isCrouching: p.isCrouching,
        isShooting: p.isShooting,
        name: p.name,
      }
    }

    // Broadcast til alle i rommet
    io.to(code).emit('state', {
      players: playerStates,
      serverTime: Date.now(),
    })

    // Rydd opp tomme rom (eldre enn 10 min uten spillere)
    if (room.players.size === 0 && Date.now() - room.createdAt > 600000) {
      rooms.delete(code)
    }
  }
}, TICK_MS)

// ── Socket.io hendelser ──────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Spiller koblet til: ${socket.id}`)

  // ── Opprett rom ──────────────────────────────────────────────────────────
  socket.on('create-room', ({ name }, callback) => {
    // Forlat eksisterende rom
    const existingRoom = getPlayerRoom(socket.id)
    if (existingRoom) {
      existingRoom.players.delete(socket.id)
      socket.leave(existingRoom.code)
      io.to(existingRoom.code).emit('player-left', { id: socket.id })
    }

    const room = createRoom(socket.id)
    room.players.set(socket.id, {
      x: 0, y: 2, z: 0,
      rotY: 0,
      health: 100,
      activeWeapon: 'pistol',
      isDriving: false,
      isSprinting: false,
      isCrouching: false,
      isShooting: false,
      name: name || 'Spiller',
    })
    socket.join(room.code)
    console.log(`[ROM] ${socket.id} opprettet rom ${room.code}`)

    callback({
      ok: true,
      roomCode: room.code,
      playerId: socket.id,
    })
  })

  // ── Bli med i rom ────────────────────────────────────────────────────────
  socket.on('join-room', ({ code, name }, callback) => {
    const room = rooms.get(code?.toUpperCase())
    if (!room) {
      callback({ ok: false, error: 'Rommet finnes ikke' })
      return
    }
    if (room.players.size >= 10) {
      callback({ ok: false, error: 'Rommet er fullt (maks 10 spillere)' })
      return
    }

    // Forlat eksisterende rom
    const existingRoom = getPlayerRoom(socket.id)
    if (existingRoom) {
      existingRoom.players.delete(socket.id)
      socket.leave(existingRoom.code)
      io.to(existingRoom.code).emit('player-left', { id: socket.id })
    }

    room.players.set(socket.id, {
      x: 0, y: 2, z: 0,
      rotY: 0,
      health: 100,
      activeWeapon: 'pistol',
      isDriving: false,
      isSprinting: false,
      isCrouching: false,
      isShooting: false,
      name: name || 'Spiller',
    })
    socket.join(room.code)

    // Varsle andre spillere
    socket.to(room.code).emit('player-joined', {
      id: socket.id,
      name: name || 'Spiller',
    })

    console.log(`[ROM] ${socket.id} ble med i ${room.code} (${room.players.size} spillere)`)

    callback({
      ok: true,
      roomCode: room.code,
      playerId: socket.id,
      isHost: room.hostId === socket.id,
      players: Array.from(room.players.entries()).map(([id, p]) => ({
        id, name: p.name,
      })),
    })
  })

  // ── Start spill ──────────────────────────────────────────────────────────
  socket.on('start-game', () => {
    const room = getPlayerRoom(socket.id)
    if (!room) return
    if (room.hostId !== socket.id) return
    room.started = true
    io.to(room.code).emit('game-started')
    console.log(`[ROM] Spill startet i ${room.code}`)
  })

  // ── Spilleroppdatering (klient → server, ~20 Hz) ────────────────────────
  socket.on('player-update', (data) => {
    const room = getPlayerRoom(socket.id)
    if (!room) return

    const player = room.players.get(socket.id)
    if (!player) return

    player.x = data.x ?? player.x
    player.y = data.y ?? player.y
    player.z = data.z ?? player.z
    player.rotY = data.rotY ?? player.rotY
    player.health = data.health ?? player.health
    player.activeWeapon = data.activeWeapon ?? player.activeWeapon
    player.isDriving = data.isDriving ?? player.isDriving
    player.isSprinting = data.isSprinting ?? player.isSprinting
    player.isCrouching = data.isCrouching ?? player.isCrouching
    player.isShooting = data.isShooting ?? player.isShooting
  })

  // ── Zombie-synk: klient rapporterer zombiedrap ──────────────────────────
  socket.on('zombie-killed', ({ zombieId }) => {
    const room = getPlayerRoom(socket.id)
    if (!room) return
    // Broadcast til andre spillere at zombien er drept
    socket.to(room.code).emit('zombie-killed', {
      zombieId,
      killedBy: socket.id,
    })
  })

  // ── Zombie-spawn: host broadcaster nye zombier ──────────────────────────
  socket.on('zombie-spawned', ({ zombieId, x, y, z }) => {
    const room = getPlayerRoom(socket.id)
    if (!room) return
    if (room.hostId !== socket.id) return
    socket.to(room.code).emit('zombie-spawned', { zombieId, x, y, z })
  })

  // ── Chat ─────────────────────────────────────────────────────────────────
  socket.on('chat', ({ message }) => {
    const room = getPlayerRoom(socket.id)
    if (!room) return
    const player = room.players.get(socket.id)
    io.to(room.code).emit('chat', {
      from: socket.id,
      name: player?.name || 'Ukjent',
      message,
    })
  })

  // ── Ping ─────────────────────────────────────────────────────────────────
  socket.on('ping-check', (_, callback) => {
    callback(Date.now())
  })

  // ── Frakobling ───────────────────────────────────────────────────────────
  socket.on('disconnect', (reason) => {
    console.log(`[-] Spiller frakoblet: ${socket.id} (${reason})`)

    const room = getPlayerRoom(socket.id)
    if (!room) return

    room.players.delete(socket.id)
    io.to(room.code).emit('player-left', { id: socket.id })

    // Overfør host-rollen
    if (room.hostId === socket.id && room.players.size > 0) {
      const newHost = room.players.keys().next().value
      room.hostId = newHost
      io.to(room.code).emit('host-changed', { newHostId: newHost })
      console.log(`[ROM] Ny host i ${room.code}: ${newHost}`)
    }

    // Slett tomme rom
    if (room.players.size === 0) {
      rooms.delete(room.code)
      console.log(`[ROM] Rom ${room.code} slettet (tomt)`)
    }
  })
})

// ── Health-endpoint ──────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    rooms: rooms.size,
    players: Array.from(rooms.values()).reduce((n, r) => n + r.players.size, 0),
  })
})

httpServer.listen(PORT, () => {
  console.log(`Larkollen server kjører på port ${PORT}`)
  console.log(`Helse-sjekk: http://localhost:${PORT}/health`)
})
