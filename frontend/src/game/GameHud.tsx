import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { GameSpectatorCount } from './GameSpectatorCount'
import './gameHud.css'

/** Scrollable score sheets and transformed board panels must not clip the common HUD. */
function HudLayer({children,embedded=false}:{children:ReactNode;embedded?:boolean}) {
  const [host,setHost]=useState<Element|null>(null)
  useLayoutEffect(()=>{if(!embedded)setHost(document.querySelector('.park-page'))},[embedded])
  return host ? createPortal(children,host) : children
}

/** Same navigation and focus behavior in every game. Game-specific callbacks stay with the caller. */
export function GameHudMenu({ children, embedded = false }: { children: ReactNode; embedded?: boolean }) {
  const menu = useRef<HTMLDetailsElement>(null)
  const [node,setNode]=useState<HTMLElement|null>(null)
  useLayoutEffect(()=>{
    const root=node?.closest<HTMLElement>('.park-page')
    if(!node||!root)return
    let owned=''
    const update=()=>{const value=Math.ceil(node.getBoundingClientRect().bottom+12)+'px';if(value!==owned){owned=value;root.style.setProperty('--game-hud-menu-bottom',value)}}
    const observer=new ResizeObserver(update);observer.observe(node);window.addEventListener('resize',update);update()
    return()=>{observer.disconnect();window.removeEventListener('resize',update);if(root.style.getPropertyValue('--game-hud-menu-bottom')===owned)root.style.removeProperty('--game-hud-menu-bottom')}
  },[node])
  return <HudLayer embedded={embedded}><nav ref={setNode} className="game-hud-menu" data-embedded={embedded || undefined} aria-label="게임 메뉴">
    <GameSpectatorCount />
    <details ref={menu} onKeyDownCapture={event => {
      const node = menu.current
      if (event.key !== 'Escape' || !node?.open || !(event.target instanceof Node) || !node.contains(event.target)) return
      // A confirmation dialog owns Escape while it is open, including dialogs rendered through a portal.
      if (document.querySelector('dialog[open],[role="dialog"]')) return
      event.preventDefault(); event.stopPropagation(); node.open = false
      node.querySelector('summary')?.focus()
    }}>
      <summary><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>게임 메뉴<span aria-hidden="true">⌄</span></summary>
      <div className="game-hud-menu-content">{children}</div>
    </details>
  </nav></HudLayer>
}

/** Displays a supplied server deadline. This component never starts a new turn or changes game timing. */
export function GameHudClock({ game, label, remainingMs, limitMs = 30000, hint, myTurn = false, phase }: {
  game: string; label: string; remainingMs: number | null; limitMs?: number; hint?: string; myTurn?: boolean; phase?: string
}) {
  const total = Number.isFinite(limitMs) && limitMs > 0 ? limitMs : 30000
  const value = remainingMs === null || !Number.isFinite(remainingMs) ? null : Math.min(total, Math.max(0, remainingMs))
  return <HudLayer><div className="game-hud-clock" role="timer" aria-label={`${game} 남은 시간`} data-my-turn={myTurn} data-phase={!!phase}
    data-urgent={!phase && value !== null && value > 0 && value <= Math.min(10000, total / 3)}>
    <span className="game-hud-eyebrow"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></svg>{game}</span><span className="game-hud-turn" title={label}>{label}</span>
    <strong>{phase ?? (value === null ? '—' : Math.ceil(value / 1000))}{!phase && <small>초</small>}</strong>
    {!phase && <progress aria-label={`${game} 차례 남은 시간`} max={total} value={Math.min(total, value ?? 0)} />}
    {hint && <small className="game-hud-clock-hint">{hint}</small>}
  </div></HudLayer>
}
