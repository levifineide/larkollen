import { useEffect, useRef } from 'react'
import { Howl, Howler } from 'howler'
import { useFrame } from '@react-three/fiber'
import { usePlayerStore } from '../stores/usePlayerStore'
import { useWorldStore } from '../stores/useWorldStore'
import { useGameStore, GameState } from '../stores/useGameStore'
import { inputState } from './InputSystem'

/*
  AudioSystem – Ekte lydfiler via howler.js
  - Per-våpen skuddlyder
  - Ambient (vind, regn)
  - Fottrinn (gress/asfalt)
  - Dynamisk musikk med crossfade (calm/tense/intense)
  - Intro- og victory-musikk
*/

const VOLUMES = {
  master: 0.7,
  music: 0.3,
  sfx: 0.6,
  ambient: 0.25,
  footsteps: 0.3,
  ui: 0.5,
}

// Hjelpefunksjon: last en Howl med feilhåndtering
function loadSound(src, opts = {}) {
  return new Howl({
    src: [src],
    preload: true,
    onloaderror: (id, err) => {
      console.warn(`AudioSystem: Kunne ikke laste ${src}`, err)
    },
    ...opts,
  })
}

class AudioManager {
  constructor() {
    this.sounds = {}
    this.music = {}        // calm, tense, intense
    this.musicSpecial = {} // intro, victory
    this.ambient = {}      // wind, rain
    this.footsteps = {}    // grass, road
    this.initialized = false
    this.musicIntensity = 'calm'
    this.currentFootstep = null
    this.isMoving = false
    this._disposed = false
  }

  init() {
    if (this.initialized) return
    this.initialized = true
    this._disposed = false

    Howler.volume(VOLUMES.master)

    // === SFX ===
    // Gunshots (WAV fra OpenGameArt CC0 – CZ-52, shotgun, SKS)
    this.sounds.gunshot_pistol = loadSound('/sounds/gunshot_pistol.wav', { volume: VOLUMES.sfx })
    this.sounds.gunshot_shotgun = loadSound('/sounds/gunshot_shotgun.wav', { volume: VOLUMES.sfx })
    this.sounds.gunshot_rifle = loadSound('/sounds/gunshot_rifle.wav', { volume: VOLUMES.sfx })
    this.sounds.reload = loadSound('/sounds/reload.wav', { volume: VOLUMES.sfx * 0.7 })
    // Kenney Impact Sounds (OGG, CC0)
    this.sounds.empty_click = loadSound('/sounds/empty_click.ogg', { volume: VOLUMES.sfx * 0.5 })
    // Zombie lyder (WAV fra OpenGameArt CC0)
    this.sounds.zombie_groan = loadSound('/sounds/zombie_groan.wav', { volume: VOLUMES.sfx * 0.5 })
    this.sounds.zombie_death = loadSound('/sounds/zombie_death.wav', { volume: VOLUMES.sfx * 0.6 })
    this.sounds.zombie_attack = loadSound('/sounds/zombie_attack.wav', { volume: VOLUMES.sfx * 0.6 })
    // Impact/treff (Kenney OGG, CC0)
    this.sounds.hit_flesh = loadSound('/sounds/hit_flesh.ogg', { volume: VOLUMES.sfx })
    this.sounds.player_hurt = loadSound('/sounds/player_hurt.ogg', { volume: VOLUMES.sfx * 0.7 })
    this.sounds.pickup = loadSound('/sounds/pickup.ogg', { volume: VOLUMES.ui })
    this.sounds.explosion = loadSound('/sounds/explosion.ogg', { volume: VOLUMES.sfx })
    this.sounds.water_splash = loadSound('/sounds/water_splash.ogg', { volume: VOLUMES.sfx * 0.5 })
    this.sounds.engine_car = loadSound('/sounds/engine_car.ogg', {
      volume: VOLUMES.sfx * 0.4,
      loop: true,
    })
    // Kjøretøy-lyder
    this.sounds.car_crash = loadSound('/sounds/car_crash.mp3', { volume: VOLUMES.sfx * 0.8 })
    this.sounds.car_impact = loadSound('/sounds/car_impact.mp3', { volume: VOLUMES.sfx * 0.6 })
    this.sounds.car_horn = loadSound('/sounds/car_horn.mp3', { volume: VOLUMES.sfx * 0.7 })
    this.sounds.car_window_break = loadSound('/sounds/car_window_break.mp3', { volume: VOLUMES.sfx * 0.5 })
    this.sounds.tire_screech = loadSound('/sounds/tire_screech.mp3', { volume: VOLUMES.sfx * 0.4 })

    // === Fottrinn (Kenney OGG, CC0) ===
    this.footsteps.grass = loadSound('/sounds/footsteps_grass.ogg', {
      volume: VOLUMES.footsteps,
      loop: true,
    })
    this.footsteps.road = loadSound('/sounds/footsteps_road.ogg', {
      volume: VOLUMES.footsteps,
      loop: true,
    })

    // === Ambient ===
    this.ambient.wind = loadSound('/sounds/wind_ambient.ogg', {
      volume: VOLUMES.ambient,
      loop: true,
    })
    this.ambient.rain = loadSound('/sounds/rain_loop.mp3', {
      volume: VOLUMES.ambient * 0.8,
      loop: true,
    })

    // === Musikk (dynamisk – 3 lag) ===
    this.music.calm = loadSound('/sounds/music_calm.mp3', {
      volume: 0,
      loop: true,
    })
    this.music.tense = loadSound('/sounds/music_tense.mp3', {
      volume: 0,
      loop: true,
    })
    this.music.intense = loadSound('/sounds/music_intense.mp3', {
      volume: 0,
      loop: true,
    })

    // === Spesialmusikk ===
    this.musicSpecial.intro = loadSound('/sounds/music_intro.mp3', {
      volume: VOLUMES.music,
      loop: false,
    })
    this.musicSpecial.victory = loadSound('/sounds/music_victory.mp3', {
      volume: VOLUMES.music,
      loop: false,
    })
  }

  // Spill en navngitt lyd
  play(name) {
    if (this.sounds[name]) {
      this.sounds[name].play()
    }
  }

  // Per-våpen skuddlyd
  playGunshot(weaponId) {
    const map = {
      pistol: 'gunshot_pistol',
      shotgun: 'gunshot_shotgun',
      rifle: 'gunshot_rifle',
      ak47: 'gunshot_rifle', // gjenbruk rifle-lyd
    }
    const soundName = map[weaponId] || 'gunshot_pistol'
    this.play(soundName)
  }

  // Start ambient-lyder
  startAmbient() {
    if (this.ambient.wind && !this.ambient.wind.playing()) {
      this.ambient.wind.play()
    }
  }

  // Oppdater regn basert på vær
  updateRain(weather) {
    if (!this.ambient.rain) return
    if (weather !== 'none' && !this.ambient.rain.playing()) {
      this.ambient.rain.play()
      this.ambient.rain.fade(0, VOLUMES.ambient * 0.8, 2000)
    } else if (weather === 'none' && this.ambient.rain.playing()) {
      this.ambient.rain.fade(this.ambient.rain.volume(), 0, 2000)
      setTimeout(() => {
        if (this.ambient.rain && !this._disposed) this.ambient.rain.stop()
      }, 2100)
    }
  }

  // Fottrinn
  updateFootsteps(moving, surface = 'grass') {
    if (moving && !this.isMoving) {
      // Start fottrinn
      this.isMoving = true
      this.currentFootstep = surface
      const sound = this.footsteps[surface]
      if (sound && !sound.playing()) sound.play()
    } else if (!moving && this.isMoving) {
      // Stopp fottrinn
      this.isMoving = false
      Object.values(this.footsteps).forEach(s => { if (s.playing()) s.stop() })
    } else if (moving && surface !== this.currentFootstep) {
      // Bytt overflate
      Object.values(this.footsteps).forEach(s => { if (s.playing()) s.stop() })
      this.currentFootstep = surface
      const sound = this.footsteps[surface]
      if (sound) sound.play()
    }
  }

  // Start all gameplay-musikk (alle 3 spor starter, bare ett har volum)
  startMusic() {
    Object.values(this.music).forEach(m => {
      if (m && !m.playing()) m.play()
    })
    this.setMusicIntensity('calm')
  }

  stopMusic() {
    Object.values(this.music).forEach(m => {
      if (m && m.playing()) {
        m.fade(m.volume(), 0, 1000)
        setTimeout(() => { if (m && !this._disposed) m.stop() }, 1100)
      }
    })
  }

  // Crossfade mellom calm/tense/intense
  setMusicIntensity(intensity) {
    if (intensity === this.musicIntensity) return
    this.musicIntensity = intensity

    const targets = {
      calm: { calm: VOLUMES.music, tense: 0, intense: 0 },
      tense: { calm: 0, tense: VOLUMES.music, intense: 0 },
      intense: { calm: 0, tense: 0, intense: VOLUMES.music },
    }
    const vols = targets[intensity] || targets.calm

    Object.entries(vols).forEach(([key, vol]) => {
      const m = this.music[key]
      if (m) m.fade(m.volume(), vol, 1500)
    })
  }

  // Spesialmusikk (intro/victory)
  playSpecial(name) {
    const m = this.musicSpecial[name]
    if (m) {
      m.stop()
      m.play()
    }
  }

  stopSpecial(name) {
    const m = this.musicSpecial[name]
    if (m && m.playing()) {
      m.fade(m.volume(), 0, 500)
      setTimeout(() => { if (m && !this._disposed) m.stop() }, 600)
    }
  }

  // Bilmotor
  startEngine() {
    const e = this.sounds.engine_car
    if (e && !e.playing()) e.play()
  }

  stopEngine() {
    const e = this.sounds.engine_car
    if (e && e.playing()) {
      e.fade(e.volume(), 0, 300)
      setTimeout(() => { if (e && !this._disposed) e.stop() }, 400)
    }
  }

  setEngineRate(rate) {
    const e = this.sounds.engine_car
    if (e) e.rate(Math.max(0.5, Math.min(2.0, rate)))
  }

  dispose() {
    this._disposed = true
    Object.values(this.sounds).forEach(s => s.unload())
    Object.values(this.music).forEach(s => s.unload())
    Object.values(this.musicSpecial).forEach(s => s.unload())
    Object.values(this.ambient).forEach(s => s.unload())
    Object.values(this.footsteps).forEach(s => s.unload())
    this.sounds = {}
    this.music = {}
    this.musicSpecial = {}
    this.ambient = {}
    this.footsteps = {}
    this.initialized = false
  }
}

// Singleton
export const audioManager = new AudioManager()

export default function AudioSystem() {
  const prevHealth = useRef(100)
  const prevAmmo = useRef(null)
  const prevDriving = useRef(false)
  const prevInWater = useRef(false)
  const prevWeather = useRef('none')
  const initedRef = useRef(false)

  // Init ved første brukerinteraksjon
  useEffect(() => {
    const initAudio = () => {
      if (initedRef.current) return
      initedRef.current = true
      window.removeEventListener('click', initAudio)
      window.removeEventListener('keydown', initAudio)

      audioManager.init()
      audioManager.startAmbient()
      audioManager.startMusic()
    }

    window.addEventListener('click', initAudio)
    window.addEventListener('keydown', initAudio)

    return () => {
      window.removeEventListener('click', initAudio)
      window.removeEventListener('keydown', initAudio)
      audioManager.dispose()
    }
  }, [])

  // Per-frame oppdateringer
  useFrame(() => {
    if (!audioManager.initialized) return

    const {
      health, weapons, activeWeapon, isDriving, isInWater,
    } = usePlayerStore.getState()
    const { weather, zombieCount } = useWorldStore.getState()

    // --- Skade-lyd ---
    if (health < prevHealth.current) {
      audioManager.play('player_hurt')
    }
    prevHealth.current = health

    // --- Skudd-lyd (per våpen) ---
    const currentAmmo = weapons[activeWeapon]?.mag
    if (prevAmmo.current !== null && currentAmmo < prevAmmo.current) {
      audioManager.playGunshot(activeWeapon)
    }
    prevAmmo.current = currentAmmo

    // --- Dynamisk musikk ---
    if (zombieCount > 10) {
      audioManager.setMusicIntensity('intense')
    } else if (zombieCount > 5) {
      audioManager.setMusicIntensity('tense')
    } else {
      audioManager.setMusicIntensity('calm')
    }

    // --- Fottrinn ---
    const moving = inputState.forward || inputState.backward ||
                   inputState.left || inputState.right
    if (!isDriving && health > 0) {
      // Enkel overflate-deteksjon (kan utvides med terrain-sjekk)
      audioManager.updateFootsteps(moving, 'grass')
    } else {
      audioManager.updateFootsteps(false)
    }

    // --- Bilmotor ---
    if (isDriving && !prevDriving.current) {
      audioManager.startEngine()
    } else if (!isDriving && prevDriving.current) {
      audioManager.stopEngine()
    }
    prevDriving.current = isDriving

    // --- Vannplask ---
    if (isInWater && !prevInWater.current) {
      audioManager.play('water_splash')
    }
    prevInWater.current = isInWater

    // --- Regn ---
    if (weather !== prevWeather.current) {
      audioManager.updateRain(weather)
      prevWeather.current = weather
    }
  })

  // Lytt til custom events
  useEffect(() => {
    const onZombieKill = () => audioManager.play('zombie_death')
    const onZombieAttack = () => audioManager.play('zombie_attack')
    const onReload = () => audioManager.play('reload')
    const onPickup = () => audioManager.play('pickup')
    const onExplosion = () => audioManager.play('explosion')
    const onEmptyClip = () => audioManager.play('empty_click')

    window.addEventListener('zombie-killed', onZombieKill)
    window.addEventListener('zombie-attack', onZombieAttack)
    window.addEventListener('weapon-reload', onReload)
    window.addEventListener('weapon-pickup', onPickup)
    window.addEventListener('explosion', onExplosion)
    window.addEventListener('empty-clip', onEmptyClip)

    return () => {
      window.removeEventListener('zombie-killed', onZombieKill)
      window.removeEventListener('zombie-attack', onZombieAttack)
      window.removeEventListener('weapon-reload', onReload)
      window.removeEventListener('weapon-pickup', onPickup)
      window.removeEventListener('explosion', onExplosion)
      window.removeEventListener('empty-clip', onEmptyClip)
    }
  }, [])

  return null
}
