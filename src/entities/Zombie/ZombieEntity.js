import {
  Vehicle,
  StateMachine,
  State,
  WanderBehavior,
  SeekBehavior,
  Vector3 as YukaVector3,
} from 'yuka'

// ─── Konstanter ──────────────────────────────────────────────────────────────
const DETECTION_RANGE = 20    // meter – oppdager spiller
const ATTACK_RANGE = 1.8      // meter – næringsangrep
const LOSE_RANGE = 35         // meter – mister interesse
const ATTACK_COOLDOWN = 1.2   // sekunder mellom angrep
const ATTACK_DAMAGE = 10      // skade per treff
const WANDER_RADIUS = 8
const WANDER_DISTANCE = 12
const WANDER_JITTER = 2
const WALK_SPEED = 1.5        // m/s roaming
const CHASE_SPEED = 3.8       // m/s jaging

// ─── FSM States ──────────────────────────────────────────────────────────────

class IdleState extends State {
  enter(entity) {
    entity.maxSpeed = WALK_SPEED
    entity.animState = 'idle'
    entity._idleTimer = 2 + Math.random() * 3
  }
  execute(entity, dt) {
    entity._idleTimer -= dt
    if (entity._idleTimer <= 0) {
      entity.stateMachine.changeTo('roam')
      return
    }
    if (entity._playerDist < DETECTION_RANGE) {
      entity.stateMachine.changeTo('chase')
    }
  }
}

class RoamState extends State {
  enter(entity) {
    entity.maxSpeed = WALK_SPEED
    entity.animState = 'walk'

    // Aktiver wander-oppførsel
    const wander = entity.steering.behaviors.find((b) => b instanceof WanderBehavior)
    if (wander) wander.active = true
    const seek = entity.steering.behaviors.find((b) => b instanceof SeekBehavior)
    if (seek) seek.active = false

    entity._roamTimer = 4 + Math.random() * 6
  }
  execute(entity, dt) {
    entity._roamTimer -= dt
    if (entity._roamTimer <= 0) {
      entity.stateMachine.changeTo('idle')
      return
    }
    if (entity._playerDist < DETECTION_RANGE) {
      entity.stateMachine.changeTo('chase')
    }
  }
  exit(entity) {
    const wander = entity.steering.behaviors.find((b) => b instanceof WanderBehavior)
    if (wander) wander.active = false
  }
}

class ChaseState extends State {
  enter(entity) {
    entity.maxSpeed = CHASE_SPEED
    entity.animState = 'run'

    const seek = entity.steering.behaviors.find((b) => b instanceof SeekBehavior)
    if (seek) seek.active = true
    const wander = entity.steering.behaviors.find((b) => b instanceof WanderBehavior)
    if (wander) wander.active = false
  }
  execute(entity) {
    // Oppdater seek-target til spillerposisjon
    const seek = entity.steering.behaviors.find((b) => b instanceof SeekBehavior)
    if (seek) seek.target = entity._playerPosition

    if (entity._playerDist < ATTACK_RANGE) {
      entity.stateMachine.changeTo('attack')
      return
    }
    if (entity._playerDist > LOSE_RANGE) {
      entity.stateMachine.changeTo('roam')
    }
  }
  exit(entity) {
    const seek = entity.steering.behaviors.find((b) => b instanceof SeekBehavior)
    if (seek) seek.active = false
  }
}

class AttackState extends State {
  enter(entity) {
    entity.maxSpeed = 0
    entity.velocity.set(0, 0, 0)
    entity.animState = 'attack'
    entity._attackTimer = 0 // Angrip umiddelbart ved entry
  }
  execute(entity, dt) {
    entity._attackTimer -= dt

    if (entity._playerDist > ATTACK_RANGE * 1.5) {
      entity.stateMachine.changeTo('chase')
      return
    }

    if (entity._attackTimer <= 0) {
      entity._attackTimer = ATTACK_COOLDOWN
      entity._pendingDamage = ATTACK_DAMAGE
    }
  }
}

class DeadState extends State {
  enter(entity) {
    entity.maxSpeed = 0
    entity.velocity.set(0, 0, 0)
    entity.animState = 'dead'
    entity._deadTimer = 4 // Ragdoll i 4 sekunder, så despawn
    entity.active = false // Stopp AI-oppdatering

    // Deaktiver alle steering behaviors
    for (const b of entity.steering.behaviors) b.active = false
  }
  execute(entity, dt) {
    entity._deadTimer -= dt
    if (entity._deadTimer <= 0) {
      entity._shouldDespawn = true
    }
  }
}

// ─── Zombie GameEntity ───────────────────────────────────────────────────────

export default class ZombieEntity extends Vehicle {
  constructor(id) {
    super()
    this.name = `zombie_${id}`
    this.zombieId = id
    this.maxSpeed = WALK_SPEED
    this.health = 100
    this.active = true
    this.frozen = false // frosset når > 80m fra spiller

    // AI-state
    this.animState = 'idle'           // leses av React-komponent
    this._playerPosition = new YukaVector3()
    this._playerDist = Infinity
    this._pendingDamage = 0           // skade som skal påføres spiller
    this._shouldDespawn = false
    this._attackTimer = 0
    this._idleTimer = 0
    this._roamTimer = 0
    this._deadTimer = 0

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

    // FSM
    this.stateMachine = new StateMachine(this)
    this.stateMachine.add('idle', new IdleState())
    this.stateMachine.add('roam', new RoamState())
    this.stateMachine.add('chase', new ChaseState())
    this.stateMachine.add('attack', new AttackState())
    this.stateMachine.add('dead', new DeadState())
    this.stateMachine.changeTo('idle')
  }

  update(delta) {
    if (!this.active || this.frozen) return this

    // Oppdater FSM
    this.stateMachine.update(delta)

    // La Yuka beregne steering
    super.update(delta)

    return this
  }

  updatePlayerInfo(playerPos, dist) {
    this._playerPosition.set(playerPos.x, playerPos.y, playerPos.z)
    this._playerDist = dist
  }

  takeDamage(amount) {
    if (this.health <= 0) return
    this.health -= amount
    if (this.health <= 0) {
      this.health = 0
      this.stateMachine.changeTo('dead')
    }
  }

  reset(x, y, z) {
    this.position.set(x, y, z)
    this.velocity.set(0, 0, 0)
    this.health = 100
    this.active = true
    this.frozen = false
    this._shouldDespawn = false
    this._pendingDamage = 0
    this.animState = 'idle'

    for (const b of this.steering.behaviors) b.active = false

    this.stateMachine.changeTo('idle')
  }
}

export { DETECTION_RANGE, ATTACK_RANGE, ATTACK_DAMAGE }
