import { useEffect, useRef, useState } from 'react'
import { useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { useOneCardDefense } from './defenseEvents'
import './onecardDefense.css'

export function OneCardReachCard({ userId, name, disabled, onReach }: { userId: string; name: string; disabled: boolean; onReach(): void }) {
  const defense = useOneCardDefense(), [now, setNow] = useState(() => performance.now())
  const ownId = useSession(s => s.sessionId)
  useEffect(() => { const timer = setInterval(() => setNow(performance.now()), 100); return () => clearInterval(timer) }, [])
  const blocked = Math.max(0, Math.ceil(((defense.blocks[`${ownId}/${userId}`] ?? 0) - now) / 1000))
  return <div className="onecard-reach-control">
    <button className="onecard-reach-cards" aria-label={`${name} 손패에 손 뻗기`}
      disabled={disabled || !defense.enabled || defense.pending || blocked > 0} onClick={onReach}>
      <span className="onecard-public-backs" aria-hidden="true">{[0, 1, 2].map(index => <img key={index} src="/art/onecard/classic/B-1.svg" alt="" draggable={false} />)}</span>
      <span>{name}의 손패</span><small>{blocked ? `방해 차단 ${blocked}초` : defense.pending ? '손을 뻗는 중…' : '카드를 눌러 손 뻗기'}</small>
    </button>
    <p className="onecard-prank-status" role="status">{blocked ? '뿅망치에 맞았어요. 잠깐 쉬었다가 다시 구경해요.'
      : !defense.enabled ? '투명 손과 방해 차단은 서버 연동 후 사용할 수 있어요.'
        : defense.attempts.some(a => a.actorUserId === ownId && a.until > now) ? '손을 뻗었어요. 상대의 뿅망치를 조심하세요!'
          : '공개된 카드 뒷면만 보여요. 상대의 실제 패는 볼 수 없어요.'}</p>
  </div>
}

interface Strike { id: string; attemptId: string; actorUserId: string; x: number; y: number; phase: 'windup' | 'hit' | 'miss' }

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
    {attempts.map((attempt, index) => <button key={attempt.attemptId} className="onecard-ghost-hand" data-actor-user-id={attempt.actorUserId}
      style={{ left: `${48 + (index % 2 ? -1 : 1) * (14 + Math.floor(index / 2) * 13)}%` }}
      aria-label={`${profiles[attempt.actorUserId]?.nickname ?? '관전자'}의 손 막기`} disabled={!held || defense.pending}
      onClick={event => {
        if (!held || defense.pending || strike) return
        const bounds = event.currentTarget.querySelector('img')!.getBoundingClientRect()
        setStrike({ id: attempt.attemptId, attemptId: attempt.attemptId, actorUserId: attempt.actorUserId,
          x: bounds.x + bounds.width * .46, y: bounds.y + bounds.height * .45, phase: 'windup' })
        void runtime.hitOneCardHand?.(attempt.attemptId).then(approved => {
          if (!approved) setStrike(previous => previous?.attemptId === attempt.attemptId ? { ...previous, phase: 'miss' } : previous)
        })
      }}>
      <img src="/art/onecard/prank/ghost-hand.webp" alt="" draggable={false} />
      <span>{profiles[attempt.actorUserId]?.nickname ?? '관전자'}의 손 · {held ? '눌러서 막기' : '뿅망치를 들어 막아주세요'}</span>
    </button>)}
    {strike?.phase === 'hit' && <div key={`strike/${strike.id}`} className="onecard-strike-contact" style={{ left: strike.x, top: strike.y }} aria-hidden="true">
      <img className="onecard-hit-hand" src="/art/onecard/prank/ghost-hand.webp" alt="" draggable={false} />
      <span className="onecard-impact-ring" /><span className="onecard-impact-spark">✦</span><b className="onecard-impact-word">퍽!</b>
    </div>}
    {held && <><div className="onecard-hammer" data-strike-phase={strike?.phase ?? 'idle'} aria-hidden="true"
      style={strike ? { left: strike.x, top: strike.y } : undefined}><img key={strike ? `${strike.id}/${strike.phase}` : 'idle'} src="/art/onecard/prank/hammer.webp" alt="" draggable={false} /></div>
      <p className="onecard-hammer-hint" role="status">{!defense.enabled ? '뿅망치 준비 완료 · 방해 차단은 서버 연동 후 사용할 수 있어요'
        : defense.pending ? '서버에서 방어를 확인하고 있어요…' : '투명한 손을 눌러 내 패를 지켜주세요'}</p></>}
    {block && <div key={block.eventId} className="onecard-hit-feedback" role="status"><b>퍽!</b><span>방해 차단 {Math.max(0, Math.ceil((block.until - now) / 1000))}초</span><small>{profiles[block.actorUserId]?.nickname ?? '관전자'}가 잠시 내 패를 뒤집을 수 없어요</small></div>}
  </div>
}
