import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { useOneCardDefense, type Reach } from './defenseEvents'
import { useGame } from '../store'
import './onecardDefense.css'

interface Strike { id: string; attemptId: string; actorUserId: string; x: number; y: number; phase: 'windup' | 'hit' | 'miss' }

function ReachingHand({ attempt, index, now, held, pending, name, hit }: {
  attempt: Reach; index: number; now: number; held: boolean; pending: boolean; name: string; hit(event: MouseEvent<HTMLButtonElement>): void
}) {
  const root = useRef<HTMLButtonElement>(null), offset = useRef(Math.max(0, performance.now() - attempt.startedAt))
  useLayoutEffect(() => {
    const cards = useGame.getState().game?.hand?.hand, cardId = cards?.[attempt.cardIndex ?? 0]?.id
    const target = cardId ? document.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(cardId)}"]`) : document.querySelector<HTMLElement>('.onecard-hand')
    const bounds = target?.getBoundingClientRect(), x = Math.max(90, Math.min(innerWidth - 90, bounds ? bounds.left + bounds.width * .5 + index * 26 : innerWidth * .6))
    const y = Math.max(240, Math.min(innerHeight - 140, bounds ? bounds.top + bounds.height * .25 : innerHeight * .65))
    if (root.current) {
      root.current.style.left = `${x}px`; root.current.style.top = `${y}px`
      root.current.style.setProperty('--reach-start-x', `${x > innerWidth / 2 ? -140 : 140}px`)
    }
  }, [attempt, index, now])
  return <button ref={root} className="onecard-ghost-hand" data-actor-user-id={attempt.actorUserId} data-armed={held}
    style={{ '--reach-duration': `${attempt.duration}ms`, animationDelay: `-${offset.current}ms` } as CSSProperties}
    aria-label={`${name}의 손 막기`} aria-disabled={!held || pending} disabled={pending} onClick={hit}>
    <img src="/art/onecard/prank/ghost-hand.webp" alt="" draggable={false} />
    <span>{name}의 손 · {held ? '눌러서 막기' : '우클릭으로 망치 꺼내기'}<small>방어 {Math.max(0, (attempt.until - now) / 1000).toFixed(1)}초</small></span>
  </button>
}

export function OneCardDefenseOverlay({ held, active, ownId }: { held: boolean; active: boolean; ownId: string }) {
  const defense = useOneCardDefense(), profiles = useSession(s => s.profiles), runtime = useParkRuntime()
  const root = useRef<HTMLDivElement>(null), [now, setNow] = useState(() => performance.now()), [strike, setStrike] = useState<Strike | null>(null)
  useEffect(() => { const timer = setInterval(() => setNow(performance.now()), 100); return () => clearInterval(timer) }, [])
  useEffect(() => { if (!held || !active) setStrike(null) }, [held, active])
  useEffect(() => {
    const block = defense.lastBlock
    if (!active || !held || !block || block.targetUserId !== ownId || block.until <= performance.now()) return
    // Only a server-approved block produces contact, recoil and sparks. A click alone is a wind-up.
    setStrike(previous => previous?.attemptId === block.attemptId
      ? { ...previous, id: block.eventId, phase: 'hit' } : previous)
  }, [defense.lastBlock, active, held, ownId])
  useEffect(() => {
    if (!strike || strike.phase === 'windup') return
    const timer = setTimeout(() => setStrike(previous => previous?.id === strike.id ? null : previous), 760)
    return () => clearTimeout(timer)
  }, [strike?.id, strike?.phase])
  useEffect(() => {
    if (!held) return
    let frame = 0, x = 0, y = 0
    const move = (event: globalThis.PointerEvent) => {
      x = event.clientX; y = event.clientY
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        root.current?.style.setProperty('--hammer-x', `${Math.max(60, Math.min(innerWidth - 70, x))}px`)
        root.current?.style.setProperty('--hammer-y', `${Math.max(80, Math.min(innerHeight - 90, y))}px`)
      })
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => { window.removeEventListener('pointermove', move); cancelAnimationFrame(frame) }
  }, [held])
  if (!active) return null
  const attempts = defense.enabled ? defense.attempts.filter(a => a.targetUserId === ownId && a.until > now) : []
  const block = defense.lastBlock?.targetUserId === ownId && defense.lastBlock.until > now ? defense.lastBlock : null
  return <div ref={root} className="onecard-defense-overlay" aria-label="뿅망치 방어">
    {attempts.map((attempt, index) => <ReachingHand key={attempt.attemptId} attempt={attempt} index={index} now={now}
      held={held} pending={defense.pending} name={profiles[attempt.actorUserId]?.nickname ?? '관전자'} hit={event => {
        if (!held || defense.pending || strike) return
        const bounds = event.currentTarget.querySelector('img')!.getBoundingClientRect()
        setStrike({ id: attempt.attemptId, attemptId: attempt.attemptId, actorUserId: attempt.actorUserId,
          x: bounds.x + bounds.width * .46, y: bounds.y + bounds.height * .45, phase: 'windup' })
        void runtime.hitOneCardHand?.(attempt.attemptId).then(approved => {
          if (!approved) setStrike(previous => previous?.attemptId === attempt.attemptId ? { ...previous, phase: 'miss' } : previous)
        })
      }} />)}
    {strike?.phase === 'hit' && <div key={`strike/${strike.id}`} className="onecard-strike-contact" style={{ left: strike.x, top: strike.y }} aria-hidden="true">
      <img className="onecard-hit-hand" src="/art/onecard/prank/ghost-hand.webp" alt="" draggable={false} />
      <span className="onecard-impact-ring" /><span className="onecard-impact-spark">✦</span><b className="onecard-impact-word">퍽!</b>
    </div>}
    {held && <><div className="onecard-hammer" data-strike-phase={strike?.phase ?? 'idle'} aria-hidden="true"
      style={strike ? { left: strike.x, top: strike.y } : undefined}><img key={strike ? `${strike.id}/${strike.phase}` : 'idle'} src="/art/onecard/prank/hammer.webp" alt="" draggable={false} /></div>
      <p className="onecard-hammer-hint" role="status">{!defense.enabled ? '뿅망치 준비 완료 · 방해 차단은 서버 연동 후 사용할 수 있어요'
        : defense.pending ? '서버에서 방어를 확인하고 있어요…' : '다가오는 손을 눌러 막기 · 우클릭으로 내려놓기'}</p></>}
    {block && <div key={block.eventId} className="onecard-hit-feedback" role="status"><b>퍽!</b><span>방해 차단 {Math.max(0, Math.ceil((block.until - now) / 1000))}초</span><small>{profiles[block.actorUserId]?.nickname ?? '관전자'}가 잠시 내 패를 뒤집을 수 없어요</small></div>}
  </div>
}
