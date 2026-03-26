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

io.on('connection', (socket) => {
  console.log(`[+] Spiller koblet til: ${socket.id}`)

  socket.on('disconnect', (reason) => {
    console.log(`[-] Spiller frakoblet: ${socket.id} (${reason})`)
  })
})

httpServer.listen(PORT, () => {
  console.log(`Server kjører på port ${PORT}`)
})
