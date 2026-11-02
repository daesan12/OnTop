import { useEffect, useRef } from 'react'
import { CardBack, FruitCard } from './FruitCard'
import { stageRef } from './anchors'
import { flightElapsed, flightPhase, installHalliFlights, useHalliFlights, type Flight, type FlightPlan } from './flights'

/** Lift of a card's arc on the fixed table, in CSS pixels, and its sideways tilt at mid-flight. */
const FIXED_ARC = 22, FIXED_TILT = 7

/**
 * Copies of the cards moving after a bell, for players and spectators. On the table stage the 3D board places them
 * every frame (StageProjector); on the fixed table they move between the piles' boxes here. Never interactive.
 */
export function HalliFlights({ layout }: { layout: 'stage' | 'fixed' }) {
  const plan = useHalliFlights(s => s.plan), root = useRef<HTMLDivElement>(null)
  useEffect(() => installHalliFlights(), [])
  useEffect(() => {
    if (layout !== 'fixed' || !plan) return
    let frame = 0
    const step = () => { if (placeFixed(root.current, plan)) frame = requestAnimationFrame(step) }
    step()
    return () => cancelAnimationFrame(frame)
  }, [layout, plan])
  return <div ref={root} className="hg-flights" aria-hidden="true">
    {plan?.flights.map((f, i) => <div key={`${plan.key}:${i}`} ref={layout === 'stage' ? stageRef(`flight:${i}`) : undefined}
      className="hg-flight" data-kind={f.kind} data-layer={f.layer} style={{ zIndex: plan.flights.length - i }}>
      {f.kind !== 'collect' ? <CardBack /> : f.card ? <FruitCard card={f.card} /> : <span className="hg-flight-blank" />}
    </div>)}
  </div>
}

/** The card (or empty spot) a pile shows on the fixed table, or the 2D bell for an issued card. */
function pileBox(table: Element, f: Flight, end: 'from' | 'to') {
  const target = end === 'to' ? { pile: 'draw', userId: f.to.userId } : f.from
  if (target.pile === 'bell') return table.querySelector('.hg-center .hg-bell')?.getBoundingClientRect()
  return table.querySelector(`[data-pile="${target.pile}:${target.userId}"]`)?.querySelector('.hg-card, .hg-empty')?.getBoundingClientRect()
}

/** One frame on the fixed table. Boxes are read every frame, so a resize mid-flight still lands on the pile. */
function placeFixed(root: HTMLDivElement | null, plan: FlightPlan) {
  const table = root?.parentElement
  if (!root || !table) return false
  const elapsed = flightElapsed(), base = root.getBoundingClientRect()
  root.querySelectorAll<HTMLElement>(':scope > .hg-flight').forEach((element, i) => {
    const f = plan.flights[i], phase = f && flightPhase(f, elapsed), to = f && pileBox(table, f, 'to'), from = f && pileBox(table, f, 'from')
    if (!f || !phase || !to || !from) { element.style.visibility = 'hidden'; return }
    // An issued card grows out of the bell at the target's size, then moves like any other card.
    const start = f.from.pile === 'bell'
      ? { x: from.left + from.width / 2 - to.width / 2, y: from.top + from.height / 2 - to.height / 2, w: to.width, h: to.height }
      : { x: from.left, y: from.top, w: from.width, h: from.height }
    const t = phase.t, mix = (a: number, b: number) => a + (b - a) * t, grow = .5 + .5 * phase.appear
    const w = mix(start.w, to.width) * grow, h = mix(start.h, to.height) * grow
    const x = mix(start.x, to.left) + (mix(start.w, to.width) - w) / 2 - base.left
    const y = mix(start.y, to.top) + (mix(start.h, to.height) - h) / 2 - Math.sin(t * Math.PI) * FIXED_ARC - base.top
    const tilt = Math.sin(t * Math.PI) * FIXED_TILT * (to.left >= start.x ? 1 : -1)
    element.style.width = `${w.toFixed(1)}px`; element.style.height = `${h.toFixed(1)}px`
    element.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) rotate(${tilt.toFixed(1)}deg)`
    element.style.opacity = String(phase.appear)
    element.style.visibility = 'visible'
  })
  return elapsed < plan.total
}
