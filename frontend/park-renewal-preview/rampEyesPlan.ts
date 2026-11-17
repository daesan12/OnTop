// Where the ramp's eyes sit (RampEyes, S15P31B105-450): both inner walls of the climb to the gallery, a jittered
// grid from knee height to well over your head, denser and larger towards the top. Pure data for tests.

/** The ramp: walls' inner faces (x0 west, x1 east), its foot and top (z), and where the eyes all shut. */
export const RAMP = { x0: -54.55, x1: -49.45, z0: -56, z1: -84, top: -79.5 } as const

export interface RampEye { x: number; z: number; h: number; nx: number; size: number; roll: number; delay: number }

const rnd = (n: number) => { const s = Math.sin(n * 91.345 + 47.853) * 43758.5453; return s - Math.floor(s) }

export function rampEyeLayout(): RampEye[] {
  const eyes: RampEye[] = []
  let k = 0
  for (const [x, nx] of [[RAMP.x0 + .02, 1], [RAMP.x1 - .02, -1]] as const) {
    for (let z = -58.5; z > -82.5; z -= .95) {
      const up = (-58.5 - z) / 24
      const rows = 2 + (rnd(k++) < .45 + up * .4 ? 1 : 0)
      for (let r = 0; r < rows; r++) {
        eyes.push({
          x, nx,
          z: z + (rnd(k++) - .5) * .7,
          h: .45 + r * 1.05 + rnd(k++) * .7,
          size: .32 + rnd(k++) * .22 + up * .12,
          roll: (rnd(k++) - .5) * .7,
          delay: rnd(k++) * .7,
        })
      }
    }
  }
  return eyes
}
