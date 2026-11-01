import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGame, recoveryBlocked } from '../store'
import { estimatedServerTime, useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { openManual } from '../../features/manual/manualState'
import { SeatedLookButton } from '../../features/tableLobby/SeatedLookButton'
import { resultSettlement } from '../../features/tableLobby/gatheringModel'
import { OmokSurrender } from '../OmokSurrender'
import { canFlipHalli, canRingHalli, useHalliUI } from './actions'
import { installHalliControls, ringShownBell } from './controls'
import { HALLI_END_REASON, type HalliEvent } from './protocol'
import { HalliTable } from './HalliTable'
import './halligalli.css'

const NOTICE_MS = 2500
const eventText = (e: HalliEvent, name: string) => ({
  FLIP: `${name} 카드 공개`, AUTO_FLIP: `${name} 시간 초과 · 자동 공개`,
  RING_SUCCESS: `${name} 종 성공! 공개 카드 ${e.cardCount}장을 가져가요`,
  RING_PENALTY: `${name} 종 실수 · ${e.cardCount}명에게 한 장씩`,
  FINAL_PENALTY: `${name} 마지막 2인 종 실수 · 상대가 공개 카드 ${e.cardCount}장을 가져가요`,
})[e.type]

/** Full-screen HUD shared by players and spectators. Server state decides every action; animation never gates input. */
export function HalliGalliPanel() {
  const s = useGame(), runtime = useParkRuntime()
  const session = useSession(useShallow(s => ({ sessionId: s.sessionId, profiles: s.profiles, status: s.status, pending: s.pending })))
  const notice = useHalliUI(useShallow(s => ({ text: s.notice, at: s.noticeAt })))
  const [now, setNow] = useState(estimatedServerTime)
  const role = s.game?.halli ? s.game.role : null
  useEffect(() => role === 'PLAYER' ? installHalliControls() : undefined, [role])
  // Re-checks the result pause end and expires notices; the bar animates on its own.
  useEffect(() => { const timer = setInterval(() => setNow(estimatedServerTime()), 200); return () => clearInterval(timer) }, [])
  const g = s.game?.halli ? s.game : null
  if (!g) return recoveryBlocked() ? <section className="halligalli-panel hg-recovery" aria-label="할리갈리">
    <p>경기 복구 확인 중 · 입력을 잠시 멈췄습니다.</p>
    <button type="button" disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkRecovery()}>경기 복구 다시 확인</button>
  </section> : null
  const h = g.halli, own = session.sessionId, player = g.role === 'PLAYER', playing = h.status === 'PLAYING'
  const names = Object.fromEntries(h.players.map((p, i) => [p.userId,
    p.userId === own ? '나' : session.profiles[p.userId]?.nickname ?? `참가자 ${i + 1}`]))
  const me = h.players.find(p => p.userId === own)
  const paused = !!h.resultUntil && now < Date.parse(h.resultUntil)
  const canFlip = player && canFlipHalli(own, now), canRing = player && h.bellWindowId !== null && canRingHalli(own, h.bellWindowId)
  const status = !playing ? `${h.winnerUserIds.map(id => names[id]).join(' · ')} ${h.winnerUserIds.length > 1 ? '공동 승리' : '승리'}`
    : paused ? '종 결과 확인 중 · 잠시 뒤 다음 카드를 공개해요'
    : h.turnUserId === null ? '공개할 카드가 없어요 · 마지막으로 종을 칠 수 있어요'
    : h.turnUserId === own ? '내 차례 · 뒷면 카드를 눌러 공개하세요'
    : `${names[h.turnUserId]} 차례 · 같은 과일이 정확히 5개면 종!`
  const standing = !player ? '관전 중 · 종과 카드는 참가자만 다룰 수 있어요'
    : me?.forfeited ? '기권했어요 · 공개 카드는 판정에 계속 남아요' : me?.eliminated ? '탈락했어요 · 경기를 끝까지 볼 수 있어요' : ''
  return <section className="halligalli-panel" aria-label="할리갈리" data-role={g.role} data-status={h.status}>
    <header className="hg-head">
      <h2>할리갈리</h2>
      <p role="status">{status}</p>
      {h.lastEvent && playing && <small aria-live="polite">{eventText(h.lastEvent, names[h.lastEvent.userId] ?? '참가자')}</small>}
      {!playing && <small>{HALLI_END_REASON[h.endReason ?? ''] ?? h.endReason}</small>}
    </header>
    <HalliTable halli={h} gameId={g.gameId} viewerId={own} names={names} canFlip={canFlip} canRing={canRing}
      onFlip={() => void runtime.flipHalli()} onRing={ringShownBell} keyHint={player && !!me?.active} />
    <div className="hg-feedback">
      {standing && <p>{standing}</p>}
      {notice.text && now - notice.at < NOTICE_MS && <p role="status">{notice.text}</p>}
      {player && g.version < s.awaitingVersion && <p>처리 확인 수신 · 최신 카드를 기다리고 있습니다.</p>}
      {s.uncertain && <p>반영 여부를 확인해야 합니다. 공개·종을 자동 재전송하지 않습니다.</p>}
      {s.error && <p role="alert">{s.error}</p>}
      {player && !playing && <p>{s.result ? resultSettlement(s.result) : '결과·정산 확인 전입니다.'}</p>}
    </div>
    <nav className="hg-menu" aria-label="게임 메뉴">
      {player && <SeatedLookButton />}
      <button type="button" onClick={() => openManual('halligalli')}>게임 설명</button>
      <button type="button" disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkGame()}>최신 상태 확인</button>
      {player && recoveryBlocked() && <button type="button" disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkRecovery()}>경기 복구 다시 확인</button>}
      {player && !playing && <button type="button" disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkResult()}>정산 결과 확인</button>}
      {player && <OmokSurrender key={`${own}:${g.gameId}`} context={{ userId: own, gameId: g.gameId, version: g.version }} disabled={session.pending} />}
      {!player && <button type="button" disabled={session.pending} onClick={() => void runtime.unwatchGame()}>관전 종료</button>}
    </nav>
  </section>
}
