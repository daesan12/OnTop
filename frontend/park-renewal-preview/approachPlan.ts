// Something walking up behind you (HorrorPresence, S15P31B105-450): far off and slow at first, a step every second
// and a half, half lost in the echo; nearer and quicker; then it stops, and there is nothing for a few seconds; then
// it comes on again, closer, louder, quicker every step; then all at once it breaks into a run, a long drumming burst of
// steps right behind you, and it is on you. About twenty-five seconds. Pure timing, so it can be tested.
// Unless you keep the rule (horrorRules: stand still, do not look back): then the run goes on past you, close enough
// to feel, and away down the hall ahead (`passBy`).

export interface ApproachStep {
  /** Seconds from the first step. */
  t: number
  /** 0 far off .. 1 at your back: loudness, brightness and how dry it sounds. */
  near: number
  /** Part of the final rush. */
  burst: boolean
}
export interface Approach {
  steps: ApproachStep[]
  /** When the run reaches you. */
  strikeAt: number
  /** Index of the first step after it stops. */
  resume: number
  /** The run going on past you and away, from `strikeAt` (if you kept still and did not look). */
  passBy: ApproachStep[]
}

export function approachPlan(random: () => number = Math.random): Approach {
  const steps: ApproachStep[] = []
  let t = 0
  const walk = (count: number, near0: number, near1: number, gap0: number, gap1: number) => {
    for (let i = 0; i < count; i++) {
      const k = count > 1 ? i / (count - 1) : 0
      steps.push({ t, near: near0 + (near1 - near0) * k, burst: false })
      t += gap0 + (gap1 - gap0) * k + (random() - .5) * .04
    }
  }
  // Far off: slow and faint.
  walk(6 + Math.floor(random() * 2), .03, .2, 1.55, 1.15)
  // Coming.
  walk(5, .24, .4, 1.05, .78)
  // It stops. Nothing.
  t += 1.8 + random() * 1.2
  const resume = steps.length
  // And comes on again, much nearer, quicker every step.
  walk(8 + Math.floor(random() * 3), .46, .7, .72, .3)
  // And then it runs: a long drumming burst of steps, two and a half seconds of them, quicker and louder to the end.
  t -= .16
  const rush = 30 + Math.floor(random() * 7)
  for (let i = 0; i < rush; i++) {
    const k = i / (rush - 1)
    steps.push({ t, near: .72 + .28 * k, burst: true })
    t += .088 - .03 * k + random() * .012
  }
  const strikeAt = steps[steps.length - 1]!.t + .06
  const passBy: ApproachStep[] = []
  t = strikeAt
  for (let i = 0; i < 12; i++) {
    const k = i / 11
    passBy.push({ t, near: .95 - .75 * k, burst: true })
    t += .07 + .09 * k
  }
  return { steps, strikeAt, resume, passBy }
}
