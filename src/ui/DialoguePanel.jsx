import { useState, useEffect } from 'react'
import { npcInteraction, npcPool } from '../systems/NPCManager'
import { useMissionStore } from '../stores/useMissionStore'
import dialogueData from '../data/npc_dialogue.json'
import missionData from '../data/missions.json'

export default function DialoguePanel() {
  const [, forceUpdate] = useState(0)

  // Poll interaksjonsstaten 10 ganger per sekund
  useEffect(() => {
    const timer = setInterval(() => forceUpdate((n) => n + 1), 100)
    return () => clearInterval(timer)
  }, [])

  const talkingId = npcInteraction.talkingToNpcId
  const nearbyId = npcInteraction.nearbyNpcId
  const lineIndex = npcInteraction.dialogueLineIndex

  // Vis «Trykk E»-prompt
  if (!talkingId && nearbyId) {
    const entity = npcPool.get(nearbyId)
    const name = entity?.name || nearbyId
    return (
      <div style={{
        position: 'fixed',
        bottom: 200,
        left: '50%',
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        fontFamily: 'monospace',
        fontSize: 14,
        color: '#fff',
        background: 'rgba(0, 0, 0, 0.6)',
        padding: '8px 16px',
        borderRadius: 6,
        border: '1px solid rgba(255,255,255,0.2)',
        textAlign: 'center',
        zIndex: 15,
      }}>
        <span style={{ color: '#f4a261' }}>E</span> – Snakk med {name}
      </div>
    )
  }

  // Vis dialog
  if (!talkingId) return null

  const entity = npcPool.get(talkingId)
  if (!entity) return null

  const npcDialogue = dialogueData[entity.dialogueId]
  if (!npcDialogue) return null

  // Bestem teksten som vises
  let displayText = ''
  let speakerName = npcDialogue.name

  if (lineIndex === -1) {
    // Greeting
    displayText = npcDialogue.greeting
  } else if (lineIndex === -2) {
    // After mission
    displayText = npcDialogue.afterMission
  } else if (npcDialogue.lines[lineIndex]) {
    displayText = npcDialogue.lines[lineIndex].text

    // Vis misjonsinformasjon om tilgjengelig
    const currentLine = npcDialogue.lines[lineIndex]
    if (currentLine.mission) {
      const mission = missionData[currentLine.mission]
      if (mission) {
        const store = useMissionStore.getState()
        const alreadyActive = store.activeMissions.some((m) => m.id === mission.id)
        const alreadyCompleted = store.completedMissions.some((m) => m.id === mission.id)
        if (!alreadyActive && !alreadyCompleted) {
          displayText += `\n\n📋 Nytt oppdrag: ${mission.title}`
        }
      }
    }
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 140,
      left: '50%',
      transform: 'translateX(-50%)',
      pointerEvents: 'none',
      fontFamily: 'monospace',
      maxWidth: 500,
      width: '90%',
      zIndex: 15,
    }}>
      <div style={{
        background: 'rgba(0, 0, 0, 0.8)',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.15)',
        padding: '16px 20px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      }}>
        {/* Navnelabel */}
        <div style={{
          color: '#f4a261',
          fontSize: 13,
          fontWeight: 'bold',
          marginBottom: 8,
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}>
          {speakerName}
        </div>

        {/* Dialogtekst */}
        <div style={{
          color: '#eee',
          fontSize: 15,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
        }}>
          {displayText}
        </div>

        {/* Fortsett-prompt */}
        <div style={{
          color: '#888',
          fontSize: 11,
          marginTop: 10,
          textAlign: 'right',
        }}>
          Trykk <span style={{ color: '#f4a261' }}>E</span> for å fortsette
        </div>
      </div>
    </div>
  )
}
