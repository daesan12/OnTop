import { useEffect, useRef, useState } from 'react'
import type { Card } from './protocol'

/** 버전/물리 tick이 아닌 서버 턴 번호로 표시를 한 번만 재생한다. */
export function AlkkagiTurnNotice({ gameId, turnNumber, turn, actor, stage, enabled, nickname, cards }: {
  gameId: string; turnNumber: number; turn: number; actor: number; stage: string; enabled: boolean
  nickname: string; cards: readonly Card[]
}) {
  const [visible, setVisible] = useState(() => !document.hidden)
  const [notice, setNotice] = useState<{ key: string; text: string; own: boolean } | null>(null)
  const previous = useRef({ gameId: '', seen: '', cards: new Set<string>(), awardUntil: 0 })
  const cardKey = cards.map(c => c.id).join(',')
  useEffect(() => {
    const changed = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', changed)
    return () => document.removeEventListener('visibilitychange', changed)
  }, [])
  useEffect(() => {
    const current = previous.current, ids = cardKey ? cardKey.split(',') : []
    if (current.gameId !== gameId) {
      current.gameId = gameId; current.seen = ''; current.cards = new Set(ids); current.awardUntil = 0
    } else {
      if (ids.some(id => !current.cards.has(id))) current.awardUntil = performance.now() + 1900
      current.cards = new Set(ids)
    }
    if (!enabled || !visible || stage !== 'AIMING') { setNotice(null); return }
    const key = `${gameId}:${turnNumber}:${turn}`
    if (current.seen === key) return
    const timer = setTimeout(() => {
      current.seen = key
      setNotice({ key, own: actor === turn, text: actor === turn ? '내 차례!' : actor < 0 ? `${nickname} 차례` : '상대 차례' })
    }, Math.max(0, current.awardUntil - performance.now()))
    return () => clearTimeout(timer)
  }, [gameId, turnNumber, turn, actor, stage, enabled, visible, nickname, cardKey])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 1500)
    return () => clearTimeout(timer)
  }, [notice])
  return notice && <div key={notice.key} className="alkkagi-turn-notice" data-own={notice.own}
    role="status" aria-live="polite"><strong>{notice.text}</strong></div>
}
