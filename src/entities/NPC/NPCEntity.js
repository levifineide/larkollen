import {
  Vehicle,
  StateMachine,
  State,
  WanderBehavior,
  SeekBehavior,
  FleeBehavior,
  Vector3 as YukaVector3,
} from 'yuka'

// ─── Konstanter ──────────────────────────────────────────────────────────────
const INTERACT_RANGE = 2.5      // meter – spilleren kan snakke
const FLEE_DETECT_RANGE = 30    // meter – oppdager zombie
const FLEE_PANIC_RANGE = 15     // meter – full panikk
const FOLLOW_DISTANCE = 4       // meter – hold avstand til spiller
const FOLLOW_CLOSE = 2          // meter – slutt å bevege seg
const PATROL_SPEED = 1.2        // m/s
const FLEE_SPEED = 4.0          // m/s
const FOLLOW_SPEED = 3.5        // m/s
const WANDER_RADIUS = 6
const WANDER_DISTANCE = 10
const WANDER_JITTER = 1.5

// ─── FSM States ──────────────────────────────────────────────────────────────

class IdleState extends State {
  enter(entity) {
    entity.maxSpeed = 0
    entity.velocity.set(0, 0, 0)
    entity.animState = 'idle'
    entity._idleTimer = 3 + Math.random() * 4

    // Deaktiver alle behaviors
    for (const b of entity.steering.behaviors) b.active = false
  }
  execute(entity, dt) {
    // Sjekk for zombie i nærheten → flykt
    if (entity._nearestZombieDist < FLEE_DETECT_RANGE && !entity.isTalking) {
      entity.stateMachine.changeTo('flee')
      return
    }

    entity._idleTimer -= dt
    if (entity._idleTimer <= 0 && !entity.isTalking && !entity.isRecruited) {
      entity.stateMachine.changeTo('patrol')
    }
  }
}

class PatrolState extends State {
  enter(entity) {
    entity.maxSpeed = PATROL_SPEED
    entity.animState = 'walk'

    const wander = entity.steering.behaviors.find((b) => b instanceof WanderBehavior)
    if (wander) wander.active = true
    const seek = entity.steering.behaviors.find((b) => b instanceof SeekBehavior)
    if (seek) seek.active = false
    const flee = entity.steering.behaviors.find((b) => b instanceof FleeBehavior)
    if (flee) flee.active = false

    entity._patrolTimer = 5 + Math.random() * 8
  }
  execute(entity, dt) {
    if (entity._nearestZombieDist < FLEE_DETECT_RANGE) {
      entity.stateMachine.changeTo('flee')
      return
    }

    entity._patrolTimer -= dt
    if (entity._patrolTimer <= 0) {
      entity.stateMachine.changeTo('idle')
    }
  }
  exit(entity) {
    const wander = entity.steering.behaviors.find((b) => b instanceof WanderBehavior)
    if (wander) wander.active = false
  }
}

class FleeState extends State {
  enter(entity) {
    entity.maxSpeed = FLEE_SPEED
    entity.animState = 'run'

    const flee = entity.steering.behaviors.find((b) => b instanceof FleeBehavior)
    if (flee) flee.active = true
    const wander = entity.steering.behaviors.find((b) => b instanceof WanderBehavior)
    if (wander) wander.active = false
    const seek = entity.steering.behaviors.find((b) => b instanceof SeekBehavior)
    if (seek) seek.active = false

    entity._fleeTimer = 0
  }
  execute(entity, dt) {
    // Oppdater flee-target til nærmeste zombie
    const flee = entity.steering.behaviors.find((b) => b instanceof FleeBehavior)
    if (flee && entity._nearestZombiePos) {
      flee.target = entity._nearestZombiePos
    }

    // Gå tilbake til idle når zombier er langt unna
    entity._fleeTimer += dt
    if (entity._nearestZombieDist > FLEE_DETECT_RANGE * 1.5 && entity._fleeTimer > 2) {
      entity.stateMachine.changeTo('idle')
    }
  }
  exit(entity) {
    const flee = entity.steering.behaviors.find((b) => b instanceof FleeBehavior)
    if (flee) flee.active = false
  }
}

class TalkState extends State {
  enter(entity) {
    entity.maxSpeed = 0
    entity.velocity.set(0, 0, 0)
    entity.animState = 'talk'
    entity.isTalking = true

    for (const b of entity.steering.behaviors) b.active = false
  }
  execute(entity) {
    // Snur NPC mot spilleren
    if (entity._playerDist > INTERACT_RANGE * 2) {
      entity.isTalking = false
      entity.stateMachine.changeTo('idle')
    }
  }
  exit(entity) {
    entity.isTalking = false
  }
}

class FollowState extends State {
  enter(entity) {
    entity.maxSpeed = FOLLOW_SPEED
    entity.animState = 'walk'

    const seek = entity.steering.behaviors.find((b) => b instanceof SeekBehavior)
    if (seek) seek.active = true
    const wander = entity.steering.behaviors.find((b) => b instanceof WanderBehavior)
    if (wander) wander.active = false
    const flee = entity.steering.behaviors.find((b) => b instanceof FleeBehavior)
    if (flee) flee.active = false
  }
  execute(entity) {
    // Sjekk for zombie → flykt
    if (entity._nearestZombieDist < FLEE_PANIC_RANGE) {
      entity.stateMachine.changeTo('flee')
      return
    }

    // Oppdater seek-target til spillerposisjon
    const seek = entity.steering.behaviors.find((b) => b instanceof SeekBehavior)
    if (seek) seek.target = entity._playerPosition

    // Sett hastighet basert på avstand til spiller
    if (entity._playerDist < FOLLOW_CLOSE) {
      entity.maxSpeed = 0
      entity.velocity.set(0, 0, 0)
      entity.animState = 'idle'
    } else if (entity._playerDist > FOLLOW_DISTANCE * 2) {
      entity.maxSpeed = FOLLOW_SPEED
      entity.animState = 'run'
    } else {
      entity.maxSpeed = PATROL_SPEED
      entity.animState = 'walk'
    }
  }
  exit(entity) {
    const seek = entity.steering.behaviors.find((b) => b instanceof SeekBehavior)
    if (seek) seek.active = false
  }
}

// ─── NPC GameEntity ─────────────────────────────────────────────────────────

export default class NPCEntity extends Vehicle {
  constructor(config) {
    super()
    this.npcId = config.id
    this.name = config.name || `npc_${config.id}`
    this.dialogueId = config.dialogueId || config.id
    this.maxSpeed = PATROL_SPEED

    // NPC-tilstand
    this.animState = 'idle'
    this.isTalking = false
    this.isRecruited = false
    this.canRecruit = config.canRecruit || false
    this.isEscortTarget = config.isEscortTarget || false
    this.hasGivenMission = false
    this.spawnPosition = new YukaVector3(
      config.position?.[0] || 0,
      config.position?.[1] || 0.5,
      config.position?.[2] || 0,
    )

    // Referanser
    this._playerPosition = new YukaVector3()
    this._playerDist = Infinity
    this._nearestZombiePos = new YukaVector3()
    this._nearestZombieDist = Infinity

    // Steering behaviors
    const wander = new WanderBehavior()
    wander.radius = WANDER_RADIUS
    wander.distance = WANDER_DISTANCE
    wander.jitter = WANDER_JITTER
    wander.active = false
    this.steering.add(wander)

    const seek = new SeekBehavior()
    seek.active = false
    this.steering.add(seek)

    const flee = new FleeBehavior()
    flee.active = false
    flee.panicDistance = FLEE_DETECT_RANGE
    this.steering.add(flee)

    // FSM
    this.stateMachine = new StateMachine(this)
    this.stateMachine.add('idle', new IdleState())
    this.stateMachine.add('patrol', new PatrolState())
    this.stateMachine.add('flee', new FleeState())
    this.stateMachine.add('talk', new TalkState())
    this.stateMachine.add('follow', new FollowState())
    this.stateMachine.changeTo('idle')
  }

  update(delta) {
    this.stateMachine.update(delta)
    super.update(delta)
    return this
  }

  updatePlayerInfo(playerPos, dist) {
    this._playerPosition.set(playerPos.x, playerPos.y, playerPos.z)
    this._playerDist = dist
  }

  updateNearestZombie(zombiePos, dist) {
    if (zombiePos) {
      this._nearestZombiePos.set(zombiePos.x, zombiePos.y, zombiePos.z)
    }
    this._nearestZombieDist = dist
  }

  startTalking() {
    if (this.isTalking) return
    this.stateMachine.changeTo('talk')
  }

  stopTalking() {
    if (!this.isTalking) return
    if (this.isRecruited) {
      this.stateMachine.changeTo('follow')
    } else {
      this.stateMachine.changeTo('idle')
    }
  }

  recruit() {
    this.isRecruited = true
    this.stateMachine.changeTo('follow')
  }
}

export { INTERACT_RANGE }
