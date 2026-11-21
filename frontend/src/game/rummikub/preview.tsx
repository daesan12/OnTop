import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { RummikubTable } from './RummikubTable'
import { physical, type Placed, type Rummikub } from './protocol'
import './rummikub.css'

const p = (color: Placed['color'], number: number): Placed => ({ id: `${color}-${number}-0`, color, number })
const sample: Rummikub = {
  gameCode: 'RUMMIKUB', status: 'PLAYING', turnTimeLimitMs: 120000, turnUserId: '101', turnId: 1, turnDeadline: null,
  poolCount: 37, initialMeldPoints: 30, jokerPenalty: 30, lastEvent: 'PLAY', winnerUserIds: [], endReason: null, endedAt: null,
  players: ['101', '202', '303', '404'].map(userId => ({ userId, tileCount: 14, registered: true, forfeited: false, score: null })),
  melds: [[p('RED', 4), p('RED', 5), p('RED', 6)], [p('BLUE', 9), p('BLUE', 10), p('BLUE', 11)],
    [p('RED', 12), p('BLUE', 12), p('BLACK', 12)], [p('YELLOW', 2), p('YELLOW', 3), { id: 'JOKER-0', color: 'YELLOW', number: 4 }, p('YELLOW', 5)]],
}
const ids = ['RED-1-0', 'RED-8-0', 'RED-13-0', 'BLUE-1-0', 'BLUE-6-0', 'BLUE-7-0', 'BLUE-13-0',
  'BLACK-3-0', 'BLACK-7-0', 'BLACK-9-0', 'BLACK-11-0', 'YELLOW-4-0', 'YELLOW-8-0', 'YELLOW-10-0']
function Preview() {
  const [state, setState] = useState(sample), [tiles, setTiles] = useState(ids.map(id => physical(id)!)), [notice, setNotice] = useState('독립 화면 검수 · 로컬 상태 · 실제 경기/재화 없음')
  const [version, setVersion] = useState(0)
  return <section className="rummikub-panel" aria-label="루미큐브 독립 화면">
    <header className="rummi-header"><h2>루미큐브</h2><strong>내 차례</strong><span>등록 완료</span><span>더미 {state.poolCount}개</span>
      <button onClick={() => { setState(sample); setTiles(ids.map(id => physical(id)!)); setVersion(v => v + 1); setNotice('처음 상태로 돌아왔습니다.') }}>처음부터</button></header>
    <div className="rummi-opponents">{['민수', '지현', '현우'].map(name => <div key={name}><strong>{name}</strong><span>14개</span></div>)}</div>
    <RummikubTable key={version} state={state} tiles={tiles} own="101" editable sending={false} error="" notice={notice}
      onPlay={melds => { const used = new Set(melds.flat().map(t => t.id)); setState({ ...state, melds }); setTiles(tiles.filter(t => !used.has(t.id))); setVersion(v => v + 1); setNotice('턴 확정을 로컬 상태에 반영했습니다. 실제 서버 판정은 공원에서 확인하세요.') }}
      onDraw={() => { if (!state.poolCount) return; const used = new Set([...state.melds.flat().map(t => t.id), ...tiles.map(t => t.id)]); const tile = Array.from({ length: 26 }, (_, i) => physical(`RED-${Math.floor(i / 2) + 1}-${i % 2}`)!).find(t => !used.has(t.id)); if (tile) setTiles([...tiles, tile]); setState({ ...state, poolCount: state.poolCount - 1 }); setVersion(v => v + 1); setNotice('타일 1개를 로컬에서 받았습니다.') }}/>
  </section>
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<Preview/>)
