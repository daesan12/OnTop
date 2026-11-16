import { effectsOutput } from '../../audio/bgm'
import { moverSfx, type MoverState } from '../../audio/sfxEvents'
import type { AvatarSnapshot } from '../../network/worldClient'
import { blockAtFeet, START } from './activeCourse'
import { nearJumpmapStart } from './xrEntry'
import { playJumpMotionSound, playJumpSound, preloadJumpMotionSounds } from './audio'

// WebXR controllers may expose the legacy pulse API, the newer actuator, or neither.
type Actuator = {
  pulse?: (value: number, duration: number) => unknown
  playEffect?: (type: 'dual-rumble', parameters: GamepadEffectParameters) => unknown
  reset?: () => unknown
}
type HapticPad = { hapticActuators?: readonly Actuator[]; vibrationActuator?: Actuator | null }

function resetActuator(actuator: Actuator) {
  try {
    void Promise.resolve(actuator.reset ? actuator.reset() : actuator.pulse?.(0, 0)).catch(() => undefined)
  } catch { /* Disconnected/unsupported actuators must not interrupt XR. */ }
}

/** Presentation only: consumes replicated body motion, never moves the player or reads head height. */
export class JumpmapXRFeedback {
  private session: XRSession | null = null
  private motion?: MoverState
  private abort?: AbortController
  private context?: AudioContext
  private jumpRequestedAt: number | null = null
  private grounded = false
  private readonly actuators = new Map<'left' | 'right', Actuator>()
  get active() { return this.session !== null }

  start(session: XRSession) {
    this.stop()
    this.session = session
  }

  suspend() {
    this.motion = undefined
    this.grounded = false; this.jumpRequestedAt = null
    this.abort?.abort(); this.abort = undefined
    for (const actuator of new Set(this.actuators.values())) resetActuator(actuator)
    this.actuators.clear()
  }

  stop() {
    this.suspend()
    this.session = null; this.context = undefined
  }

  requestJump() {
    if (this.session && this.grounded) this.jumpRequestedAt = performance.now()
  }

  update(avatar: AvatarSnapshot, allowed: boolean) {
    if (!this.session) return
    if (!allowed || !avatar.connected || avatar.swimming || avatar.carry || avatar.tableId
      || avatar.benchId || avatar.fitnessId || avatar.telescopeId) { this.suspend(); return }
    const p = avatar.current
    if (![p.x, p.y, p.z, avatar.at].every(Number.isFinite)) { this.suspend(); return }
    this.abort ??= new AbortController()
    const output = effectsOutput('jumpmap')
    if (output && output.context !== this.context) {
      this.context = output.context
      void preloadJumpMotionSounds(output.context)
    }
    if (this.motion?.at === avatar.at) return
    // A relocation/reconnect is not a jump, even if it goes straight upwards.
    const before = this.motion
    const previous = before && Math.hypot(p.x - before.x, p.y - before.y, p.z - before.z) <= 8 ? before : undefined
    const [motion, cues] = moverSfx(previous, { ...p, at: avatar.at,
      moving: avatar.moving, running: avatar.running, swimming: false, free: true, paved: false })
    this.motion = motion
    // Unchanged server poses retain their old timestamp. A fresh A request plus
    // actual body ascent confirms takeoff even after a short stationary pause.
    const requested = this.jumpRequestedAt !== null && performance.now() - this.jumpRequestedAt <= 500
    if (cues.includes('move-jump') || requested && previous && !previous.airborne && p.y - previous.y > .03) {
      motion.airborne = true; this.jumpRequestedAt = null
      this.pulse(.16, 40)
      if (output) playJumpMotionSound('jump', { output, signal: this.abort.signal })
    }
    const pad = blockAtFeet({ ...p, y: p.y - .8 })
    const contact = !!pad || nearJumpmapStart(p) && Math.abs(p.y - .8 - START.y) < .12
    const airborne = motion.airborne || !!previous?.airborne || cues.includes('move-land')
    // Detect contact on the first replicated touchdown. An idle landing may
    // never receive another changed pose, so waiting for zero velocity misses it.
    if (airborne && contact && previous && p.y <= previous.y + .002) {
      motion.airborne = false
      const impact = Math.min(1, Math.abs(previous.vy) / 12)
      const soft = pad && ['cloud', 'lily', 'kite'].includes(pad.theme) ? .65 : 1
      this.pulse((.2 + impact * .2) * soft, 50 + impact * 40)
      if (output) {
        const options = { output, signal: this.abort.signal }
        if (pad) playJumpSound({ id: 0, pad: { ...pad, stage: pad.stage - 1 }, time: avatar.at, kind: 'land' }, options)
        else playJumpMotionSound('land', options)
      }
    } else if (airborne && !contact) {
      // A slowing fall or a correction in mid-air must not consume the landing.
      motion.airborne = true
    }
    this.grounded = contact && !motion.airborne
  }

  private pulse(strength: number, duration: number) {
    if (!this.session) return
    for (const source of this.session.inputSources) {
      if (source.handedness !== 'left' && source.handedness !== 'right') continue
      if (source.gamepad?.mapping !== 'xr-standard') continue
      const pad = source.gamepad as unknown as HapticPad
      const actuator = pad.hapticActuators?.find(a => typeof a?.pulse === 'function') ?? pad.vibrationActuator
      if (!actuator) continue
      const previous = this.actuators.get(source.handedness)
      if (previous && previous !== actuator) resetActuator(previous)
      this.actuators.set(source.handedness, actuator)
      try {
        const result = actuator.pulse ? actuator.pulse(strength, duration)
          : actuator.playEffect?.('dual-rumble', { startDelay: 0, duration, weakMagnitude: strength, strongMagnitude: strength })
        void Promise.resolve(result).catch(() => undefined)
      } catch { /* Haptics are optional; audio and gameplay remain available. */ }
    }
  }
}

// One immersive session owns the local player's jump/landing sounds at a time.
export const jumpmapXRFeedback = new JumpmapXRFeedback()
