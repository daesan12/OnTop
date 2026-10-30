import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useSession } from '../../network/worldClient'
import { useGame, tableBusy } from '../../game/store'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { openManual } from '../manual/manualState'
import { GAME_MANUAL } from './gatheringModel'
import { GAME_CONSTRUCTION_NOTICE, isTableGamePlayable, TABLE_GAMES, TARGET_SCORES, type TableGameCode } from './model'
import { manualStartAllowed, preparationContext, readyWouldAutoStart, usePreparationPort } from './tabletModel'
import { tabletProjection } from './tabletProjection'
import { HostStartButton, HostStartWaitStatus } from './HostStartWaitControls'
import { useTabletStartStatus } from './TabletLobbyClient'
import { inputState } from '../../world/inputOwnership'
import coinImage from '../../assets/entry/yeopjeon-icon.webp'
import './tablet.css'
const TabletPortrait = lazy(() => import('./TabletPortrait').then(module => ({ default: module.TabletPortrait })))

const descriptions: Record<TableGameCode, string> = {
  OMOK: '다섯 돌을 이어 만드는 한 수', DICE: '주사위를 굴려 목표 점수에 도전해요',
  ONE_CARD: '손에 든 카드를 모두 내려놓으면 승리!', LIAR_BRIDGE: '믿거나 의심하거나, 다리를 건너요',
  DICE_LEDGER: '세 번 굴려 장부 열두 칸을 채워요',
}
const choiceOrder: TableGameCode[] = ['OMOK', 'ONE_CARD', 'DICE_LEDGER', 'DICE', 'LIAR_BRIDGE']
export function GameArt({ code }: { code: TableGameCode }) {
  return <div className="tablet-game-art" data-game={code} role="img" aria-label={TABLE_GAMES.find(g => g.code === code)?.name} />
}
export function TabletLobby({ tableId }: { tableId: string }) {
  const own = useSession(s => s.sessionId)
  return <TabletSession key={`${own}/${tableId}`} tableId={tableId} />
}
function TabletSession({ tableId }: { tableId: string }) {
  const runtime = useParkRuntime(), port = usePreparationPort(s => s.port)
  const s = useSession(useShallow(s => ({ own: s.sessionId, connected: s.status === 'connected', pending: s.pending,
    table: s.tableStates[tableId], profiles: s.profiles, sessionError: s.error,
    anchor: s.bindings.find(b => b.channelId === s.roomId && b.tableId === tableId)?.anchorId })))
  const g = useGame(useShallow(g => ({ start: g.start, pending: g.pending, busy: tableBusy(g), game: g.game,
    error: g.error, recovery: g.recovery, uncertain: g.uncertain })))
  const table = s.table
  const startUncertain = useTabletStartStatus(state => state.uncertain && state.tableId === tableId)
  const [step, setStep] = useState<'select' | 'ready'>(table?.gameCode ? 'ready' : 'select')
  const [code, setCode] = useState<TableGameCode>(TABLE_GAMES.find(game => game.code === table?.gameCode)?.code ?? 'OMOK')
  const [count, setCount] = useState(2), [target, setTarget] = useState(table?.targetScore ?? 2000)
  const [bet, setBet] = useState(String(table?.betAmountPerPlayer ?? ''))
  const [confirmedBet, setConfirmedBet] = useState(''), [working, setWorking] = useState(false), [error, setError] = useState('')
  const alive = useRef(true), commandEpoch = useRef(0), element = useRef<HTMLElement>(null)
  const active = s.connected && !g.game && !['PLAYING', 'SETTLING'].includes(g.start?.phase ?? '')
  const host = table?.selectorUserId === s.own, mine = table?.seats.find(seat => seat.userId === s.own)
  const approvedCount = table && port?.selectedPlayers(table), max = TABLE_GAMES.find(game => game.code === code)!.capacity
  const occupied = table?.seats.filter(seat => seat.userId).length ?? 0
  const busy = s.pending || g.pending || g.busy || working || !s.connected || g.uncertain
  const canStand = active && !busy && !!mine
  const signature = table ? `${table.tableId}/${table.gameCode}/${table.targetScore}/${table.betAmountPerPlayer}/${approvedCount ?? ''}` : ''
  useEffect(() => { setConfirmedBet(''); setBet(String(table?.betAmountPerPlayer ?? '')) }, [signature])
  useEffect(() => {
    const selected = TABLE_GAMES.find(game => game.code === table?.gameCode)
    if (!selected) return
    setCode(selected.code)
    setCount(approvedCount ?? table.capacity)
    setTarget(table.targetScore ?? 2000)
    setStep('ready')
  }, [signature])
  useEffect(() => { commandEpoch.current++; setWorking(false); setError(''); setConfirmedBet('') }, [s.connected, host])
  useEffect(() => {
    alive.current = true
    const node = element.current
    tabletProjection.element = node
    return () => { alive.current = false; commandEpoch.current++; if (tabletProjection.element === node) tabletProjection.element = null }
  }, [])
  useEffect(() => {
    if (active && document.pointerLockElement) document.exitPointerLock()
    if (active) element.current?.focus({ preventScroll: true })
  }, [active])
  useEffect(() => {
    if (!active) return
    const tab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return
      if (Object.entries(inputState).some(([key, open]) => open && key !== 'chatOpen')) return
      const node = element.current, chat = document.querySelector<HTMLElement>('.park-chat'), focus = document.activeElement
      if (!node || !focus || !node.contains(focus) && !chat?.contains(focus)) return
      if ([...document.querySelectorAll<HTMLElement>('dialog[open],[role="dialog"],[role="alertdialog"]')]
        .some(dialog => dialog !== node && dialog.getClientRects().length)) return
      // Treat preparation and its chat as one keyboard region so both stay reachable.
      const selector = 'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)'
      const controls = [node, chat].flatMap(region => region ? [...region.querySelectorAll<HTMLElement>(selector)] : [])
        .filter(control => control.getClientRects().length && !control.closest('[inert],[hidden]'))
      if (!controls.length) return
      const index = controls.indexOf(focus as HTMLElement)
      const next = index < 0 ? event.shiftKey ? controls.length - 1 : 0 : (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length
      event.preventDefault(); controls[next]?.focus()
    }
    window.addEventListener('keydown', tab)
    return () => window.removeEventListener('keydown', tab)
  }, [active])
  useEffect(() => {
    if (!active) return
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.repeat || event.isComposing
        || event.ctrlKey || event.altKey || event.metaKey || document.hidden || Object.values(inputState).some(Boolean)) return
      const node = element.current, focus = document.activeElement
      // A pending button can lose focus to body; other panels keep their own Escape.
      if (!node || focus && focus !== document.body && !node.contains(focus) && focus.tagName !== 'CANVAS') return
      if ([...document.querySelectorAll<HTMLElement>('dialog[open],[role="dialog"],[role="alertdialog"]')]
        .some(dialog => dialog !== node && dialog.getClientRects().length)) return
      event.preventDefault()
      if (canStand) void runtime.leaveTable()
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [active, canStand, runtime])
  async function command(action: () => Promise<boolean>) {
    if (busy) return
    const epoch = ++commandEpoch.current
    setWorking(true); setError('')
    try { await action() }
    catch (cause) { if (alive.current && epoch === commandEpoch.current) setError(cause instanceof Error ? cause.message : '서버 응답을 확인해주세요.') }
    finally { if (alive.current && epoch === commandEpoch.current) setWorking(false) }
  }
  if (!table) return null
  const amount = Number(bet), validBet = /^\d+$/.test(bet) && Number.isSafeInteger(amount) && amount > 0 && Number.isSafeInteger(amount * max)
  const countSupported = !!port || count === max
  const canConfigure = host && isTableGamePlayable(code) && validBet && countSupported && count >= occupied
  const confirmation = signature
  const finalReadyBlocked = !port && !mine?.ready && readyWouldAutoStart(table, s.own)
  const startEnabled = !!port && manualStartAllowed(table, s.own, approvedCount ?? null) && !busy && !startUncertain
  const seats = table.seats.slice(0, Math.max(2, approvedCount ?? table.capacity))
  const game = TABLE_GAMES.find(game => game.code === table.gameCode)
  return <section ref={element} tabIndex={-1} className="table-tablet" role={active ? 'dialog' : undefined}
    aria-label="게임 태블릿" aria-modal={active ? false : undefined} aria-hidden={!active} inert={!active} data-active={active} data-stage={step}>
    <div className="tablet-paper">
      <header className="tablet-title"><b className="tablet-brand">온탑</b>
        {step === 'ready' && <p>{game?.name ?? '게임 선택 대기'} · {s.anchor?.replace('table-', '') ?? ''}번 탁자</p>}
        <h2>{step === 'select' ? '어떤 게임을 할까요?' : '함께 시작할까요?'}</h2>
        {step === 'select' && <p>{host ? '게임을 고르고 참가 인원을 선택해요' : '방장이 게임을 선택하고 있어요'}</p>}
        {step === 'ready' && game && !game.playable && <p role="status">{GAME_CONSTRUCTION_NOTICE}</p>}
      </header>
      {step === 'select' ? <div className="tablet-selection">
        <div className="tablet-game-list" role="group" aria-label="게임 선택">
          {choiceOrder.map(gameCode => { const item = TABLE_GAMES.find(g => g.code === gameCode)!; return <button key={gameCode}
            className="tablet-game-card" data-selected={code === gameCode} data-construction={!item.playable} aria-pressed={code === gameCode} disabled={!item.playable || !host || busy}
            onClick={() => { setCode(gameCode); setCount(2) }}>
            <GameArt code={gameCode} />{!item.playable && <b className="tablet-construction">공사 중</b>}<span><strong>{item.name}</strong><small>{item.capacity === 2 ? '2인' : '2~4인'}</small></span>
          </button> })}
          <div className="tablet-coming">장기 · 준비 중</div>
        </div>
        <div className="tablet-selection-detail">
          <small>선택한 게임</small><h3>{TABLE_GAMES.find(g => g.code === code)?.name}</h3><p>{descriptions[code]}</p>
          <GameArt code={code} />
          <fieldset disabled={!host || busy || !isTableGamePlayable(code)}><legend>참가 인원</legend><div className="tablet-counts">{[2, 3, 4].filter(n => n <= max).map(n => <button key={n}
            aria-pressed={count === n} onClick={() => setCount(n)}>{n}인</button>)}</div></fieldset>
          <div className="tablet-score-slot">{code === 'DICE' && <label className="tablet-score">목표 점수<select aria-label="주사위 목표 점수" disabled={!host || busy || !isTableGamePlayable(code)} value={target} onChange={e => setTarget(Number(e.target.value))}>
            {TARGET_SCORES.map(score => <option key={score} value={score}>{score.toLocaleString()}점</option>)}</select></label>}</div>
          <label className="tablet-bet-input"><span>1인 참가 판돈</span><span className="tablet-money-field">
            <img className="tablet-coin" src={coinImage} alt="" /><input aria-label="1인 참가비" inputMode="numeric" type="text" maxLength={15} value={bet} disabled={!host || busy}
              placeholder="금액" onChange={e => setBet(e.target.value)} /><span>냥</span></span></label>
          {!countSupported && <p className="tablet-contract-note" role="status">{count}인 정원 선택은 서버 연결 준비 중입니다.</p>}
          {count < occupied && <p role="status">현재 앉은 {occupied}명보다 적게 설정할 수 없어요.</p>}
          <button className="tablet-manual" onClick={() => openManual(GAME_MANUAL[code])}>설명서</button>
          <button className="tablet-primary" disabled={busy || !canConfigure} onClick={() => void command(async () => {
            const choice = { gameCode: code, playerCount: count, betAmountPerPlayer: amount, ...(code === 'DICE' ? { targetScore: target } : {}) }
            const ok = port ? await port.configure(preparationContext(table), choice) : await runtime.selectGame(code, amount, code === 'DICE' ? target : undefined)
            if (ok && alive.current) setStep('ready')
            return ok
          })}>{working ? '설정 확인 중…' : '선택하고 준비하기'}<span aria-hidden="true">›</span></button>
        </div>
      </div> : <div className="tablet-ready-content" data-players={seats.length}>
        <div className="tablet-roster" aria-label="좌석과 준비 상태">{seats.map(seat => <div key={seat.seatNumber} className="tablet-person" data-empty={!seat.userId}>
          <div className="tablet-portrait">{seat.userId ? <Suspense fallback={null}><TabletPortrait character={s.profiles[seat.userId]?.character} /></Suspense> : <span className="tablet-empty-seat">＋<small>함께할 사람을 기다려요</small></span>}</div>
          <b className="tablet-name">{seat.userId === s.own ? '나' : seat.userId ? s.profiles[seat.userId]?.nickname ?? '산책자' : `${seat.seatNumber}번 빈자리`}{seat.userId && seat.userId === table.selectorUserId ? ' · 방장' : ''}</b>
          <span className="tablet-ready-stamp" data-ready={seat.ready}>{seat.userId ? seat.ready ? '✓ 준비 완료' : '준비 대기' : '참가 대기'}</span>
        </div>)}</div>
        <div className="tablet-bet-confirm"><span>참가 판돈</span><strong><img className="tablet-coin" src={coinImage} alt="" /> {table.betAmountPerPlayer?.toLocaleString() ?? '—'}<small>냥</small></strong>
          <label className="tablet-amount-agreement"><input type="checkbox" checked={confirmedBet === confirmation || !!mine?.ready} disabled={busy || !!mine?.ready || !table.betAmountPerPlayer}
            onChange={e => setConfirmedBet(e.target.checked ? confirmation : '')} />
            <span className="tablet-agreement-mark" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none"><path d="m4 10 4 4 8-8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
            <span>참가 금액을 확인했어요</span></label>
          {host && <button className="tablet-edit" disabled={busy} onClick={() => { setConfirmedBet(''); setStep('select') }}>게임·판돈 변경</button>}
        </div>
        <HostStartWaitStatus table={table} selectedCount={approvedCount ?? null} fallback={g.start?.phase === 'STARTING' || g.start?.phase === 'CONFIRMED' ? '서버가 참가·시작을 확인하고 있습니다.'
          : table.allReady ? '모두 준비했어요. 방장의 시작을 기다려요.' : `${occupied}명 착석 · ${table.seats.filter(s => s.userId && s.ready).length}명 준비 완료`} />
        {!port && <p className="tablet-contract-note">방장 수동 시작 연결 준비 중{finalReadyBlocked ? ' · 자동 시작을 막기 위해 마지막 준비를 잠시 기다려주세요.' : ''}</p>}
        {port && approvedCount == null && <p className="tablet-contract-note">방장이 게임·인원·판돈을 확정한 뒤 준비할 수 있어요.</p>}
        <footer className="tablet-ready-actions"><button disabled={busy || !mine} aria-keyshortcuts="Escape" title="일어나기 (Esc)" onClick={() => void runtime.leaveTable()}>일어나기</button>
          {host ? <HostStartButton table={table} selectedCount={approvedCount ?? null} disabled={!startEnabled} onStart={() => port && void command(() => port.start(preparationContext(table)))} />
            : <span className="tablet-host-wait">방장이 게임을 시작해요</span>}
          <button disabled={busy || !mine || !table.gameCode || !table.betAmountPerPlayer || (!mine.ready && (!isTableGamePlayable(table.gameCode) || confirmedBet !== confirmation || !port || approvedCount == null))}
            onClick={() => void command(() => runtime.setReady(!mine?.ready))}>{mine?.ready ? '준비 취소' : '준비 완료'}</button>
        </footer>
      </div>}
      <div className="tablet-footer-status" aria-live="polite">{(error || g.error || s.sessionError) && <p role="alert">{error || g.error || s.sessionError}</p>}
        {startUncertain && port?.recoverStart && <p role="status">시작 요청 응답을 확인하고 있어요. 새 요청을 보내기 전에 상태를 확인해주세요.
          <button disabled={s.pending || working || !s.connected} onClick={() => void command(() => port.recoverStart!(preparationContext(table)))}>시작 요청 상태 확인</button></p>}
        {step === 'select' && <button disabled={busy} aria-keyshortcuts={table.gameCode ? undefined : 'Escape'} title={table.gameCode ? undefined : '일어나기 (Esc)'} onClick={() => table.gameCode ? setStep('ready') : void runtime.leaveTable()}>{table.gameCode ? '돌아가기' : '일어나기'}</button>}
        {['STARTING', 'CONFIRMED'].includes(g.start?.phase ?? '') && <button disabled={s.pending || working || !s.connected} onClick={() => void runtime.checkStart()}>시작 상태 다시 확인</button>}
        {['PENDING', 'EXPIRED', 'UNAVAILABLE'].includes(g.recovery) && <button disabled={s.pending || working || !s.connected} onClick={() => void runtime.checkRecovery()}>경기 복구 다시 확인</button>}
      </div>
    </div>
  </section>
}
