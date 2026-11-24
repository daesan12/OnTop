// Where the ramp's eyes sit (RampEyes, S15P31B105-450): both inner walls of the climb to the gallery, a jittered
// scatter from knee height to well over your head, larger towards the top, now and then one far too big. Pure data.

/** The ramp: walls' inner faces (x0 west, x1 east), its foot and top (z), and where the eyes all shut. */
export const RAMP = { x0: -54.55, x1: -49.45, z0: -56, z1: -84, top: -79.5 } as const

export interface RampEye {
  x: number; z: number
  /** Height of its centre above the ramp floor. */
  h: number
  /** Which way it looks out of the wall (+1 from the west wall, -1 from the east). */
  nx: number
  /** Width in metres (the picture is 2:1). */
  size: number
  roll: number
  delay: number
  /** Which of the two eyes (0 the grey one, 1 the black one). */
  variant: number
  /** 1 or -1: mirrored, a left eye or a right one. */
  flip: number
}

const rnd = (n: number) => { const s = Math.sin(n * 91.345 + 47.853) * 43758.5453; return s - Math.floor(s) }

export function rampEyeLayout(): RampEye[] {
  const eyes: RampEye[] = []
  let k = 0
  for (const [x, nx] of [[RAMP.x0, 1], [RAMP.x1, -1]] as const) {
    for (let z = -58.5; z > -82.5; z -= 1.25) {
      const up = (-58.5 - z) / 24
      const rows = 2 + (rnd(k++) < .35 + up * .4 ? 1 : 0)
      for (let r = 0; r < rows; r++) {
        const giant = rnd(k++) < .08
        eyes.push({
          x, nx,
          z: z + (rnd(k++) - .5) * .8,
          h: giant ? 1.4 + rnd(k++) * .4 : .55 + r * 1.0 + rnd(k++) * .6,
          size: giant ? 1.6 + rnd(k++) * .5 : .45 + rnd(k++) * .35 + up * .2,
          roll: (rnd(k++) - .5) * .5,
          delay: rnd(k++) * .7,
          variant: rnd(k++) < .45 ? 1 : 0,
          flip: rnd(k++) < .5 ? -1 : 1,
        })
      }
    }
  }
  return eyes
}
