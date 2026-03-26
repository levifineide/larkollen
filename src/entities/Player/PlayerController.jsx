import { useRef } from 'react'
import PlayerPhysics from './PlayerPhysics'

// PlayerController koordinerer kameravinkel (delt med CameraSystem)
// Brukes som enkel wrapper rundt PlayerPhysics
export default function PlayerController({ cameraYaw }) {
  return <PlayerPhysics cameraYaw={cameraYaw} />
}
