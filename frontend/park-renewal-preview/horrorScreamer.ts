// Screamers (S15P31B105-450): pass certain spots underground and a horrible face fills the screen for half a
// second with a scream. 2D images (Gemini, sources in screamers/README.md), shown over everything as a DOM layer so
// they work the same in the park and the local preview. Each spot can fire once a visit, at most two a visit, never
// during or just after a 3D scare, and never the same picture twice in one visit.

export const SCREAMERS = {
  ghost: new URL('./screamers/scream-ghost.webp', import.meta.url).href,
  ghoul: new URL('./screamers/scream-ghoul.webp', import.meta.url).href,
  ceiling: new URL('./screamers/scream-ceiling.webp', import.meta.url).href,
  cctv: new URL('./screamers/scream-cctv.webp', import.meta.url).href,
  door: new URL('./screamers/scream-door.webp', import.meta.url).href,
  crawler: new URL('./screamers/scream-crawler.webp', import.meta.url).href,
  lens: new URL('./screamers/scream-lens.webp', import.meta.url).href,
  red: new URL('./screamers/scream-red.webp', import.meta.url).href,
} as const
export type Screamer = keyof typeof SCREAMERS
const NAMES = Object.keys(SCREAMERS) as Screamer[]
/** Pictures that are a face right at the lens (the CCTV one is a figure down a corridor). */
export const FACES: readonly Screamer[] = NAMES.filter(n => n !== 'cctv')

// Shown most recently last; every screamer and every strike that shows a face draws from the least recently seen.
const recent: Screamer[] = []
/** The least recently shown picture (a face at the lens when `face`). */
export function nextScreamer(face = false, random: () => number = Math.random, exclude: readonly Screamer[] = []): Screamer {
  const pool = (face ? FACES : NAMES).filter(n => !exclude.includes(n))
  const unseen = pool.filter(n => !recent.includes(n))
  if (unseen.length) return unseen[Math.floor(random() * unseen.length)]!
  return [...pool].sort((a, b) => recent.indexOf(a) - recent.indexOf(b))[0]!
}

/** Feet positions on the way through: mid hall, the climb, the gallery corners, the last stair. */
export const SCREAMER_SPOTS: readonly (readonly [number, number, number])[] = [
  [-18, 6.8, -78], [6, 6.8, -66], [-52, 9, -66], [0, 11.86, -91], [18, 11.86, -72], [-51.4, 12.9, -88],
]
const RADIUS = 2.2
/** Seconds after a 3D scare before a screamer may fire. */
const QUIET = 5
const MAX_PER_VISIT = 2

export class ScreamerPlan {
  private used = new Set<number>()
  private shown: Screamer[] = []
  private busyUntil = -Infinity
  private chance: number[] = []

  constructor(private readonly random = Math.random) { this.reset() }

  reset() {
    this.used.clear(); this.shown = []; this.busyUntil = -Infinity
    // Which spots are live this visit: not every one, so the route is not learnt by heart.
    this.chance = SCREAMER_SPOTS.map(() => this.random())
  }

  /** The picture to show now for feet at `p` at `now` seconds, or undefined. `busy`: a 3D scare is playing. */
  update(p: { x: number; y: number; z: number }, now: number, busy: boolean): Screamer | undefined {
    if (busy) { this.busyUntil = now + QUIET; return }
    if (now < this.busyUntil || this.shown.length >= MAX_PER_VISIT) return
    const spot = SCREAMER_SPOTS.findIndex(([x, y, z], i) => !this.used.has(i) && Math.abs(p.y - y) < 1.3 && Math.hypot(p.x - x, p.z - z) < RADIUS)
    if (spot < 0) return
    this.used.add(spot)
    if (this.chance[spot]! > .55) return
    const name = nextScreamer(false, this.random, this.shown)
    this.shown.push(name)
    this.busyUntil = now + QUIET
    return name
  }
}

let preloaded = false
/** Fetch and decode the pictures ahead of time so the first one is not a blank frame. */
export function preloadScreamers() {
  if (preloaded || typeof Image === 'undefined') return
  preloaded = true
  for (const url of Object.values(SCREAMERS)) { const img = new Image(); img.src = url; void img.decode?.().catch(() => {}) }
}

const STYLE_ID = 'horror-screamer-style'
function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  // Slam in oversized, shudder, two black frames, then gone.
  style.textContent = `
.horror-screamer{position:fixed;inset:0;z-index:2147483000;pointer-events:none;background:#000;overflow:hidden;animation:horror-screamer-out .72s steps(1,end) forwards}
.horror-screamer img{position:absolute;inset:-6%;width:112%;height:112%;object-fit:cover;filter:contrast(1.25) brightness(1.1);animation:horror-screamer-shake .72s linear forwards}
.horror-screamer::after{content:'';position:absolute;inset:0;background:#fff;animation:horror-screamer-flash .12s ease-out forwards}
.horror-screamer img.horror-screamer-ghost{mix-blend-mode:difference;opacity:.55;animation:horror-screamer-split .2s steps(3,end) forwards}
@keyframes horror-screamer-split{0%{transform:scale(1.35) translate(3%,0)}50%{transform:scale(1.2) translate(-2.5%,1%)}100%{transform:scale(1.12) translate(0,0);opacity:0}}
.horror-static{position:fixed;inset:0;z-index:2147483001;pointer-events:none;width:100%;height:100%;image-rendering:pixelated;mix-blend-mode:screen}
.horror-red{position:fixed;inset:0;z-index:2147482999;pointer-events:none;background:radial-gradient(ellipse at center,rgba(120,0,0,.15) 20%,rgba(150,0,0,.85) 100%);animation:horror-red .8s ease-out forwards}
@keyframes horror-red{0%{opacity:0}8%{opacity:1}100%{opacity:0}}
@keyframes horror-screamer-flash{from{opacity:.85}to{opacity:0}}
@keyframes horror-screamer-shake{
0%{transform:scale(1.35) translate(0,0)}8%{transform:scale(1.12) translate(-1.5%,1%)}16%{transform:scale(1.1) translate(1.2%,-1%)}
24%{transform:scale(1.08) translate(-1%,-.6%)}32%{transform:scale(1.07) translate(.8%,1%)}48%{transform:scale(1.05) translate(-.6%,.4%)}
64%{transform:scale(1.04) translate(.5%,-.5%)}100%{transform:scale(1.02) translate(0,0)}}
@keyframes horror-screamer-out{0%{opacity:1}30%{opacity:0}35%{opacity:1}62%{opacity:0}66%{opacity:1}100%{opacity:0}}
`
  document.head.appendChild(style)
}

/** Fill the screen with `name` for a moment. */
export function showScreamer(name: Screamer) {
  if (typeof document === 'undefined') return
  ensureStyle()
  const layer = document.createElement('div')
  layer.className = 'horror-screamer'
  layer.setAttribute('aria-hidden', 'true')
  const img = document.createElement('img')
  img.src = SCREAMERS[name]; img.alt = ''
  // A torn double for the first frames: the picture arrives split, then snaps together.
  const ghost = img.cloneNode() as HTMLImageElement
  ghost.className = 'horror-screamer-ghost'
  layer.append(img, ghost)
  document.body.appendChild(layer)
  const seen = recent.indexOf(name)
  if (seen >= 0) recent.splice(seen, 1)
  recent.push(name)
  staticOverlay(720, .2)
  setTimeout(() => layer.remove(), 760)
}

/** Analogue snow and tearing lines over the whole screen for `ms`. */
export function staticOverlay(ms = 400, opacity = .5) {
  if (typeof document === 'undefined') return
  ensureStyle()
  const c = document.createElement('canvas'); c.width = 192; c.height = 108; c.className = 'horror-static'; c.style.opacity = String(opacity)
  const g = c.getContext('2d'); if (!g) return
  const frame = g.createImageData(c.width, c.height), end = performance.now() + ms
  const draw = () => {
    if (performance.now() >= end || !c.isConnected) { c.remove(); return }
    const d = frame.data
    for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255 }
    g.putImageData(frame, 0, 0)
    for (let k = 0; k < 3; k++) { g.fillStyle = `rgba(255,255,255,${.3 + Math.random() * .5})`; g.fillRect(0, Math.random() * c.height, c.width, 1 + Math.random() * 4) }
    requestAnimationFrame(draw)
  }
  document.body.appendChild(c)
  requestAnimationFrame(draw)
  setTimeout(() => c.remove(), ms + 100)
}

/** The edges of the screen flush blood-dark red and fade. */
export function redFlash() {
  if (typeof document === 'undefined') return
  ensureStyle()
  const layer = document.createElement('div'); layer.className = 'horror-red'; layer.setAttribute('aria-hidden', 'true')
  document.body.appendChild(layer)
  setTimeout(() => layer.remove(), 850)
}
