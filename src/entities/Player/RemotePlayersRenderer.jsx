import { useMultiplayerStore } from '../../stores/useMultiplayerStore'
import RemotePlayer from './RemotePlayer'

// Rendrer alle remote spillere i 3D-scenen
// Ligger inne i Canvas / Physics
export default function RemotePlayersRenderer() {
  const remotePlayers = useMultiplayerStore((s) => s.remotePlayers)

  const entries = Object.entries(remotePlayers)
  if (entries.length === 0) return null

  return (
    <>
      {entries.map(([id, data], i) => (
        <RemotePlayer key={id} playerId={id} data={data} colorIndex={i} />
      ))}
    </>
  )
}
