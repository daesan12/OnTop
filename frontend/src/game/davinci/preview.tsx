import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DavinciScreen } from './DavinciScreen'
import type { CodeTile, DavinciHand, DavinciState } from './protocol'
import '../../styles.css'

/** 독립적인 2~4인 배치/접근성 검수. 규칙 판정·다인 통신 검수는 공원 엔트리와 BE 테스트에서 한다. */
function Preview() {
  const [count, setCount] = useState(4), [notice, setNotice] = useState('')
  const fixture = useMemo(() => {
    const deck: CodeTile[] = []
    for (const value of [...Array.from({ length: 12 }, (_, i) => i), -1]) {
      for (const color of ['BLACK', 'WHITE'] as const) deck.push({ id: `preview-${color}-${value}`, color, value, revealed: false })
    }
    const each = count === 4 ? 3 : 4
    const own = deck.slice(0, each)
    const players = Array.from({ length: count }, (_, seat) => ({ userId: String(101 * (seat + 1)), seat, active: true,
      forfeited: false, ready: true, tileCount: each, tiles: deck.slice(seat * each, (seat + 1) * each).map((t, i) => ({ ...t, value: seat === 1 && i === 0 ? t.value : null, revealed: seat === 1 && i === 0 })) }))
    const state: DavinciState = { gameCode: 'DAVINCI_CODE', status: 'PLAYING', stage: 'CONTINUE', version: 1,
      turnUserId: '101', turnDeadline: new Date(Date.now() + 120_000).toISOString(), endedAt: null, endReason: null, winnerUserIds: [], players,
      supply: deck.slice(count * each).map(({ id, color }) => ({ id, color })), lastEvent: null }
    const hand: DavinciHand = { userId: '101', tiles: own, pendingTile: null, validPositions: [], unplacedJokerIds: [] }
    return { state, hand }
  }, [count])
  return <DavinciScreen key={count} {...fixture} viewerId="101" names={{ '101': '온탑', '202': '봄바람', '303': '솔잎', '404': '달빛' }}
    enabled busy={false} error={notice} act={() => setNotice('화면 프리뷰예요. 실제 판정과 다인 플레이는 공원에서 확인해주세요.')}
    recover={() => setNotice('')} topActions={<><span>화면 프리뷰 · 서버 미연결</span>{[2, 3, 4].map(n => <button key={n} aria-pressed={count === n} onClick={() => { setCount(n); setNotice('') }}>{n}인</button>)}</>}
  />
}

if (import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(location.hostname)) {
  createRoot(document.getElementById('root')!).render(<Preview />)
} else document.getElementById('root')!.textContent = '로컬 화면 검수 전용입니다.'
