import { secretCorridorContains } from './horrorPlan'
import { accessAt } from './interiorAccess'
import { pickStyle, stagePlan, type StagePlan, type StageStyle } from './encounterStaging'

type Position = { x: number; y: number; z: number; interiorExitReady?: boolean }
type Point = readonly [number, number, number]
export type Encounter = { id: number; at: Point; duration: number; plan: StagePlan; presentedAt?: number }
// S15P31B105-450: 12 (the eyes) is no longer a scare that pops up; the climb to the gallery is lined with them
// (RampEyes), so it is never drawn.
const pool = Array.from({ length: 11 }, (_, i) => i + 1)
export const diamond: Point = [18.1, 7.95, -76.5]
export const visitScope = (user: string, room: string) => user && room ? user + ':' + room : ''

// Each stretch has anchors on both approaches to the same landmark.
const lower: Point[][] = [
  [[16,7.6,-78], [14,7.6,-53], [5,7.6,-53]],
  [[-4,7.6,-55], [-8,7.6,-77], [-10,7.6,-91], [-4,7.6,-63]],
  [[-31,7.6,-57], [-36,7.6,-89], [-43,7.6,-78], [-31,7.6,-65]],
  [[-47,7.6,-57], [-46.7,7.6,-90], [-47,7.6,-76], [-46.7,7.6,-65]],
]
const lowerAnchors = lower.flat()
const ascent: Point[] = [[-52,8.7,-61], [-52,10.3,-70], [-52,11.65,-78]]
const gallery: Point[] = [[-44.8,12.65,-91],[-18,12.65,-91],[18,12.65,-83],
  [18,12.65,-62],[10,12.65,-54],[-22,12.65,-54],[-45,12.65,-66],[-45,12.65,-84]]
const exit: Point[] = [[-52.9,12.65,-90.75], [-56.4,12.65,-90.3], [-56.9,12.65,-88]]
// S15P31B105-450: build-up, a long look and a rush (encounterStaging), spread across the hall instead of five
// scares in the first sixty metres.
const encounterDuration = 3600
const encounterSpacing = 11000
const upperSpacing = 5000
const departureDuration = 2600
const finaleDuration = 3400
const departureTimeout = 14000

function near(p: Position, [x,y,z]: Point, radius: number) {
  return Math.abs(p.y-y) < 1.35 && Math.hypot(p.x-x,p.z-z) <= radius
}

function draw(remaining: number[], count: number, random: () => number) {
  const bag = [...remaining]
  return Array.from({length:count}, () => bag.splice(Math.floor(random() * bag.length), 1)[0]!)
}

export class InteriorVisit {
  selected: number[] = []
  fired = new Set<number>()
  added = false
  active: Encounter | undefined
  private scope = ''
  private upperVisited = false
  private exitApproached = false
  private requestedExit: { submit: () => void; expires: number } | undefined
  private lastAt = -Infinity
  private lastStyle: StageStyle | undefined
  private readonly usedAnchors = new Set<Point>()

  constructor(private readonly random = Math.random) {}

  reset() {
    this.scope = ''
    this.selected = []
    this.fired.clear()
    this.added = false
    this.active = undefined
    this.upperVisited = false
    this.exitApproached = false
    this.requestedExit = undefined
    this.lastAt = -Infinity
    this.lastStyle = undefined
    this.usedAnchors.clear()
  }

  addDiamond(scope: string, p: Position) {
    if (!this.canAddDiamond(scope, p)) return false
    this.selected.push(...draw(pool.filter(id => !this.selected.includes(id)), 2, this.random))
    this.added = true
    return true
  }

  canAddDiamond(scope: string, p: Position) {
    return !!scope && scope === this.scope && !this.added && secretCorridorContains(p) && near(p, diamond, 1.8)
  }

  deferExit(scope: string, p: Position, now: number, submit: () => void) {
    if (scope !== this.scope || !p.interiorExitReady || accessAt(p) !== 'exit') return false
    if (!this.active && this.selected.every(id => this.fired.has(id))) return false
    this.requestedExit ??= { submit, expires: now + departureTimeout }
    this.exitApproached = true
    return true
  }

  update(scope: string, p: Position | undefined, now: number, visible = true, ahead?: Point) {
    if (!scope || !p || !secretCorridorContains(p)) {
      if (this.scope) this.reset()
      return
    }
    if (this.scope !== scope) {
      this.reset()
      this.scope = scope
      this.selected = draw(pool, 4, this.random)
    }
    if (p.interiorExitReady) this.upperVisited = true
    const atExit = this.upperVisited && exit.find(at => near(p, at, 1.7) && Math.abs(p.y - at[1]) < .55)
    if (atExit) this.exitApproached = true
    if (this.requestedExit && accessAt(p) !== 'exit') this.requestedExit = undefined
    if (this.active?.presentedAt !== undefined && now - this.active.presentedAt >= this.active.duration) {
      this.active = undefined
    }
    const pending = this.selected.filter(id => !this.fired.has(id))
    if (this.requestedExit && ((!pending.length && !this.active) || now >= this.requestedExit.expires)) {
      const { submit } = this.requestedExit
      this.requestedExit = undefined
      submit()
      return
    }
    if (!visible || this.active || now - this.lastAt < (this.upperVisited ? upperSpacing : encounterSpacing)) return
    const nearby: Point = ahead ?? [p.x, p.y, p.z]
    if (this.upperVisited && pending.includes(12)) return this.fire(12, nearby, now)

    const ordinary = pending.find(id => id !== 10 && id !== 12)
    const atLower = lowerAnchors.find(at => !this.usedAnchors.has(at) && near(p, at, 3.8))
    const atAscent = ascent.find(at => !this.usedAnchors.has(at) && near(p, at, 2.1))
    const atGallery = gallery.find(at => !this.usedAnchors.has(at) && near(p, at, 3))
    const anchor = atLower || atAscent || atGallery
    if (ordinary !== undefined && (anchor || this.upperVisited)) {
      if (anchor) this.usedAnchors.add(anchor)
      return this.fire(ordinary, anchor ?? nearby, now)
    }
    if (this.exitApproached && pending.includes(10)) return this.fire(10, nearby, now)
  }

  private fire(id: number, at: Point, started: number) {
    this.fired.add(id)
    this.lastAt = started
    const base = id === 10 || id === 12 ? finaleDuration
      : this.upperVisited ? departureDuration : encounterDuration
    // S15P31B105-450: a different way to happen each time (encounterStaging styles).
    const style = pickStyle(id, this.lastStyle, this.random)
    const plan = stagePlan(style, base, this.random)
    this.lastStyle = style
    this.active = { id, at, duration: plan.duration, plan }
  }
}

export const interiorVisit = new InteriorVisit()
