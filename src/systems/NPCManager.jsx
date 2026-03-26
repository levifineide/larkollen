import { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { EntityManager } from 'yuka'
import NPCEntity, { INTERACT_RANGE } from '../entities/NPC/NPCEntity'
import NPCInstance from '../entities/NPC/NPCInstance'
import { usePlayerStore } from '../stores/usePlayerStore'
import { useMissionStore } from '../stores/useMissionStore'
import { zombiePool } from './ZombieManager'
import { inputState } from './InputSystem'
import dialogueData from '../data/npc_dialogue.json'
import missionData from '../data/missions.json'
import { getTerrainHeight } from '../world/terrainHeight'
import * as THREE from 'three'

// NPC spawn-konfigurasjoner – Y beregnes fra terrenghøyde
const NPC_CONFIGS = [
  {
    id: 'erik',
    name: 'Erik',
    dialogueId: 'erik',
    position: [8, getTerrainHeight(8, 5), 5],
    canRecruit: true,
    isEscortTarget: false,
  },
  {
    id: 'ingrid',
    name: 'Ingrid',
    dialogueId: 'ingrid',
    position: [40, getTerrainHeight(40, 30), 30],
    canRecruit: true,
    isEscortTarget: false,
  },
  {
    id: 'ole',
    name: 'Ole',
    dialogueId: 'ole',
    position: [-30, getTerrainHeight(-30, 50), 50],
    canRecruit: true,
    isEscortTarget: false,
  },
  {
    id: 'astrid',
    name: 'Astrid',
    dialogueId: 'astrid',
    position: [-50, getTerrainHeight(-50, -60), -60],
    canRecruit: true,
    isEscortTarget: false,
  },
  {
    id: 'survivor_1',
    name: 'Maja',
    dialogueId: 'survivor_1',
    position: [70, getTerrainHeight(70, 80), 80],
    canRecruit: true,
    isEscortTarget: true,
  },
  {
    id: 'survivor_2',
    name: 'Lars',
    dialogueId: 'survivor_2',
    position: [-60, getTerrainHeight(-60, 100), 100],
    canRecruit: true,
    isEscortTarget: true,
  },
  {
    id: 'survivor_3',
    name: 'Hanne',
    dialogueId: 'survivor_3',
    position: [90, getTerrainHeight(90, -30), -30],
    canRecruit: true,
    isEscortTarget: true,
  },
]

const _playerPos = new THREE.Vector3()
const _zombiePos = new THREE.Vector3()

// Modul-nivå NPC EntityManager
export const npcEntityManager = new EntityManager()
export const npcPool = new Map() // npcId → NPCEntity

// Interaksjons-state eksportert for UI
export const npcInteraction = {
  nearbyNpcId: null,       // NPC innen interaksjonsrekkevidde
  talkingToNpcId: null,    // NPC vi snakker med akkurat nå
  dialogueLineIndex: -1,   // -1 = greeting, 0+ = lines[n]
  showPrompt: false,       // vis "Trykk E for å snakke"
}

export default function NPCManager() {
  const [npcs, setNpcs] = useState([])
  const initializedRef = useRef(false)
  const interactCooldownRef = useRef(0)
  const npcZombieFrame = useRef(0)

  // Spawn alle NPC-er
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    const spawned = []
    for (const config of NPC_CONFIGS) {
      const entity = new NPCEntity(config)
      entity.position.set(config.position[0], config.position[1], config.position[2])
      npcEntityManager.add(entity)
      npcPool.set(config.id, entity)
      spawned.push(entity)
    }
    setNpcs(spawned)
  }, [])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    npcZombieFrame.current++

    // Hent spillerposisjon
    const pos = usePlayerStore.getState().position
    _playerPos.set(pos[0], pos[1], pos[2])

    // Finn nærmeste zombie for hver NPC
    let closestNpcId = null
    let closestNpcDist = Infinity

    for (const [, entity] of npcPool) {
      // Oppdater spilleravstand
      const dx = entity.position.x - _playerPos.x
      const dz = entity.position.z - _playerPos.z
      const playerDist = Math.sqrt(dx * dx + dz * dz)
      entity.updatePlayerInfo(_playerPos, playerDist)

      // Finn nærmeste zombie – kun for NPC-er nær spilleren, hvert 30. frame
      if (playerDist < 80 && (npcZombieFrame.current % 30 === 0)) {
        let nearestZombieDistSq = Infinity
        let nearestZombieX = 0
        let nearestZombieZ = 0
        for (const [, zombie] of zombiePool) {
          if (zombie.health <= 0 || zombie.frozen) continue
          const zdx = zombie.position.x - entity.position.x
          const zdz = zombie.position.z - entity.position.z
          const zDistSq = zdx * zdx + zdz * zdz
          if (zDistSq < nearestZombieDistSq) {
            nearestZombieDistSq = zDistSq
            nearestZombieX = zombie.position.x
            nearestZombieZ = zombie.position.z
          }
        }
        _zombiePos.set(nearestZombieX, 0, nearestZombieZ)
        entity.updateNearestZombie(_zombiePos, Math.sqrt(nearestZombieDistSq))
      }

      // Sjekk interaksjonsavstand
      if (playerDist < closestNpcDist && playerDist < INTERACT_RANGE) {
        closestNpcDist = playerDist
        closestNpcId = entity.npcId
      }
    }

    // Oppdater interaksjonsstate
    npcInteraction.nearbyNpcId = closestNpcId
    npcInteraction.showPrompt = closestNpcId !== null && npcInteraction.talkingToNpcId === null

    // Håndter E-tast interaksjon
    interactCooldownRef.current -= dt
    if (inputState.interact && interactCooldownRef.current <= 0) {
      // Sjekk at vi ikke allerede er i kjøretøy-kontekst
      const isDriving = usePlayerStore.getState().isDriving
      if (!isDriving && (closestNpcId || npcInteraction.talkingToNpcId)) {
        handleInteract(closestNpcId)
        interactCooldownRef.current = 0.3
      }
    }

    // Sjekk eskorte-mål nådd
    checkEscortObjectives()

    // Oppdater Yuka EntityManager for NPC-er
    npcEntityManager.update(dt)
  })

  return (
    <>
      {npcs.map((entity) => (
        <NPCInstance key={entity.npcId} entity={entity} />
      ))}
    </>
  )
}

function handleInteract(nearbyNpcId) {
  if (npcInteraction.talkingToNpcId !== null) {
    // Vi snakker allerede – avansér dialog
    advanceDialogue()
  } else if (nearbyNpcId) {
    // Start samtale
    const entity = npcPool.get(nearbyNpcId)
    if (entity) {
      entity.startTalking()
      npcInteraction.talkingToNpcId = nearbyNpcId
      npcInteraction.dialogueLineIndex = -1 // Start med greeting
    }
  }
}

function advanceDialogue() {
  const npcId = npcInteraction.talkingToNpcId
  const entity = npcPool.get(npcId)
  if (!entity) {
    closeDialogue()
    return
  }

  const npcDialogue = dialogueData[entity.dialogueId]
  if (!npcDialogue) {
    closeDialogue()
    return
  }

  const currentIndex = npcInteraction.dialogueLineIndex

  // Sjekk om NPC allerede har gitt misjon (vis afterMission)
  const completedMissions = useMissionStore.getState().completedMissions
  const missionForNpc = Object.keys(missionData).find(
    (mId) => missionData[mId].giver === entity.dialogueId
  )
  const hasCompletedMission = missionForNpc && completedMissions.some((m) => m.id === missionForNpc)

  if (hasCompletedMission && currentIndex === -1) {
    // Vis afterMission-tekst og lukk
    npcInteraction.dialogueLineIndex = -2 // Spesiell: afterMission
    return
  }

  if (currentIndex === -2) {
    // Etter afterMission – rekrutter om mulig
    if (entity.canRecruit && !entity.isRecruited) {
      entity.recruit()
    }
    closeDialogue()
    return
  }

  // Normalt dialogforløp
  const nextIndex = currentIndex + 1

  if (currentIndex === -1) {
    // Var på greeting, gå til lines[0]
    if (npcDialogue.lines.length > 0) {
      npcInteraction.dialogueLineIndex = 0
    } else {
      closeDialogue()
    }
    return
  }

  const currentLine = npcDialogue.lines[currentIndex]
  if (!currentLine) {
    closeDialogue()
    return
  }

  // Sjekk om denne linjen gir en misjon
  if (currentLine.mission && !entity.hasGivenMission) {
    const mission = missionData[currentLine.mission]
    if (mission) {
      const store = useMissionStore.getState()
      const alreadyActive = store.activeMissions.some((m) => m.id === mission.id)
      const alreadyCompleted = store.completedMissions.some((m) => m.id === mission.id)
      if (!alreadyActive && !alreadyCompleted) {
        store.addMission({
          ...mission,
          progress: createInitialProgress(mission),
        })
        entity.hasGivenMission = true
      }
    }
  }

  // Gå til neste linje
  if (currentLine.next !== null && currentLine.next !== undefined) {
    npcInteraction.dialogueLineIndex = currentLine.next
  } else {
    closeDialogue()
  }
}

function closeDialogue() {
  const entity = npcPool.get(npcInteraction.talkingToNpcId)
  if (entity) {
    entity.stopTalking()
  }
  npcInteraction.talkingToNpcId = null
  npcInteraction.dialogueLineIndex = -1
}

function createInitialProgress(mission) {
  const progress = {}
  mission.objectives.forEach((obj, i) => {
    if (obj.type === 'kill_count') {
      progress[i] = { current: 0, target: obj.target }
    } else if (obj.type === 'reach_location') {
      progress[i] = { reached: false }
    } else if (obj.type === 'escort_npc') {
      progress[i] = { recruited: false, delivered: false }
    } else if (obj.type === 'collect_item') {
      progress[i] = { collected: false }
    } else if (obj.type === 'survive_duration') {
      progress[i] = { elapsed: 0, target: obj.target }
    }
  })
  return progress
}

function checkEscortObjectives() {
  const store = useMissionStore.getState()
  for (const mission of store.activeMissions) {
    if (!mission.progress) continue
    mission.objectives.forEach((obj, i) => {
      if (obj.type !== 'escort_npc') return
      const prog = mission.progress[i]
      if (prog.delivered) return

      const npc = npcPool.get(obj.target)
      if (!npc) return

      // Sjekk om NPC er rekruttert
      if (npc.isRecruited && !prog.recruited) {
        prog.recruited = true
      }

      // Sjekk om NPC har nådd destinasjonen
      if (npc.isRecruited) {
        const dest = obj.destination
        const dx = npc.position.x - dest[0]
        const dz = npc.position.z - dest[2]
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist < (obj.radius || 15)) {
          prog.delivered = true
          store.updateObjectiveProgress(mission.id, i, prog)
        }
      }
    })
  }
}
