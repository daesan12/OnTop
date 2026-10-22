import { useEffect, useState } from 'react'
import { useGame, canPlace, tableBusy, recoveryBlocked } from './store'
import { useSession } from '../network/worldClient'
import { useParkRuntime } from '../park/runtime/ParkRuntime'
import './game.css'

export function GameControls({ tableId }: { tableId: string }) {
  const runtime = useParkRuntime(),
    own = useSession((s) => s.sessionId),
    seated = useSession((s) => s.tableId)
  const table = useSession((s) => s.tableStates[tableId]),
    pending = useSession((s) => s.pending)
  const start = useGame((s) => s.start),
    recovery = useGame((s) => s.recovery)
  if (seated !== tableId || !table) return null
  const busy = tableBusy(),
    mine = table.seats.find((s) => s.userId === own)
  return (
    <div className="omok-lobby">
      <strong>
        게임 ·{' '}
        {table.gameCode === 'OMOK' ? '오목' : (table.gameCode ?? '선택 전')}
      </strong>
      <button
        disabled={
          pending ||
          busy ||
          table.selectorUserId !== own ||
          table.gameCode === 'OMOK'
        }
        onClick={() => void runtime.selectOmok()}
      >
        오목 선택
      </button>
      <button
        disabled={pending || busy || table.gameCode !== 'OMOK'}
        onClick={() => void runtime.setReady(!mine?.ready)}
      >
        {mine?.ready ? '준비 취소' : '준비'}
      </button>
      <p>
        {start?.simulation
          ? '서버 연동 시연 상태입니다. 실제 경기는 시작하지 않습니다.'
          : start?.phase === 'STARTING'
            ? '서버가 참가·시작을 확인하고 있습니다.'
            : start?.phase === 'SETTLING'
              ? '경기가 끝나 정산 확인을 기다리고 있습니다.'
              : table.allReady
                ? '전원 준비 완료 · 서버 시작 상태 대기'
                : '참가자 모두 준비하면 서버가 시작을 확인합니다.'}
      </p>
      {start?.code && <p>{start.code}</p>}
      {start?.phase === 'STARTING' && (
        <button disabled={pending} onClick={() => void runtime.checkStart()}>
          시작 상태 다시 확인
        </button>
      )}
      {['PENDING', 'EXPIRED', 'UNAVAILABLE'].includes(recovery) && (
        <button disabled={pending} onClick={() => void runtime.checkRecovery()}>
          경기 복구 다시 확인
        </button>
      )}
    </div>
  )
}

/** Accessible controls share the same command path as the 3D board; never a local game engine. */
export function OmokPanel() {
  const runtime = useParkRuntime(),
    s = useGame(),
    own = useSession((s) => s.sessionId)
  const connected = useSession((s) => s.status === 'connected'),
    pending = useSession((s) => s.pending)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!s.game?.omok.turnDeadline) return
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [s.game?.omok.turnDeadline])
  const g = s.game
  if (!g && !recoveryBlocked() && !s.error) return null
  const deadline = g?.omok.turnDeadline,
    remaining = deadline
      ? Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000))
      : null
  const o = g?.omok,
    myTurn = o?.turnUserId === own
  return (
    <section className="park-runtime-panel omok-panel" aria-label="오목 경기">
      <strong>{g?.role === 'SPECTATOR' ? '오목 관전' : '오목'}</strong>
      {s.error && <p role="alert">{s.error}</p>}
      {recoveryBlocked() && <p>경기 복구 확인 중 · 입력을 잠시 멈췄습니다.</p>}
      {o && (
        <>
          <p aria-live="polite">
            {o.status === 'FINISHED'
              ? o.winnerUserId
                ? o.winnerUserId === own
                  ? '승리'
                  : '경기 종료 · 승자 ' + o.winnerUserId
                : '경기 종료 · 무승부'
              : myTurn
                ? '내 차례'
                : '상대 차례'}{' '}
            · {o.moveCount}수
          </p>
          {remaining !== null && (
            <p>남은 시간 약 {remaining}초 · 최종 마감은 서버가 판정합니다.</p>
          )}
          <p>
            {g.role === 'SPECTATOR'
              ? '관전자는 돌을 놓을 수 없습니다.'
              : own === o.blackUserId
                ? '내 돌: 흑'
                : '내 돌: 백'}
          </p>
          <div
            role="group"
            aria-label="오목판"
            className="omok-accessible-board"
          >
            {o.board.flatMap((row, y) =>
              row.map((stone, x) => (
                <button
                  key={y * 15 + x}
                  className={stone === 1 ? 'black' : stone === 2 ? 'white' : ''}
                  aria-label={`${y + 1}행 ${x + 1}열 ${stone === 1 ? '흑돌' : stone === 2 ? '백돌' : '빈칸'}`}
                  disabled={!connected || pending || !canPlace(own, x, y, now)}
                  onClick={() => void runtime.placeOmok(x, y)}
                >
                  {stone ? '●' : '·'}
                </button>
              )),
            )}
          </div>
          <small>
            15×15 렌주 · 흑 33/44/장목 금수 · 한 수 30초. 금수·승패는 서버
            판정입니다.
          </small>
          {o.status === 'FINISHED' && <p>종료 사유: {o.endReason}</p>}
          {s.result ? (
            <p>
              {s.result.settlementStatus === 'SETTLED'
                ? `정산 완료 · 내 엽전 증감 ${s.result.myCoinDelta}`
                : '정산 대기 중'}
            </p>
          ) : (
            o.status === 'FINISHED' && <p>결과·정산 확인 전입니다.</p>
          )}
          {s.uncertain && (
            <p>
              착수 반영 여부를 확인해야 합니다. 같은 수를 자동 재전송하지
              않습니다.
            </p>
          )}
          {g.version < s.awaitingVersion && (
            <p>착수 확인 수신 · 최신 판을 기다리고 있습니다.</p>
          )}
          <div className="omok-actions">
            <button
              disabled={pending || !connected}
              onClick={() => void runtime.checkGame()}
            >
              최신 판 확인
            </button>
            {g.role === 'PLAYER' && o.status === 'FINISHED' && (
              <button
                disabled={pending || !connected}
                onClick={() => void runtime.checkResult()}
              >
                정산 결과 확인
              </button>
            )}
            {g.role === 'SPECTATOR' && (
              <button
                disabled={pending}
                onClick={() => void runtime.unwatchGame()}
              >
                관전 종료
              </button>
            )}
          </div>
        </>
      )}
      {recoveryBlocked() && (
        <button
          disabled={pending || !connected}
          onClick={() => void runtime.checkRecovery()}
        >
          경기 복구 다시 확인
        </button>
      )}
    </section>
  )
}
