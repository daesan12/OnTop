import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { PaperPopup } from '../../features/tableLobby/PaperPopup'
import { StoneRumbleScene } from './StoneRumbleScene'
import { STONE_FLOOR_HEIGHTS } from './layout'
import { nextSurvivor, survivorView } from './spectating'
import { stoneName, type StoneControl, type StoneState } from './protocol'
import type { StoneSceneStatus } from './StoneRumblePreparation'
import { StoneRumbleChat, type StoneChatPort } from './StoneRumbleChat'
import chatIcon from '../../features/parkMenus/icons/chat-bubble.svg'
import { StoneTowerIcon } from './StoneTowerIcon'
import { PigeonIcon } from './PigeonIcon'
import { StoneLoadingTips } from './StoneLoadingTips'
import { useStoneFeedback } from './useStoneFeedback'
import type { Result } from '../protocol'
import './stone-rumble.css'

export function StoneRumbleGame({ state, ownId, connected, send, leave, children, localOnly = false, inputReady = true, name = stoneName, topActions,
  preparing = false, onSceneStatus, preparationAttempt = 0, exit, chat, result, rewardStatus }: {
  state: StoneState; ownId: string; connected: boolean; send: (input: StoneControl, clearQueuedActions?: boolean) => void
  leave: () => void; children?: ReactNode; localOnly?: boolean; inputReady?: boolean; name?: (id: string) => string; topActions?: ReactNode
  preparing?: boolean; onSceneStatus?: StoneSceneStatus; preparationAttempt?: number
  exit?: () => void
  chat?: StoneChatPort
  result?: Result | null
  rewardStatus?: string
}) {
  const [help, setHelp] = useState(false), [confirmLeave, setConfirmLeave] = useState(false)
  const [resultOpen, setResultOpen] = useState(true)
  const [eliminationAcknowledged, setEliminationAcknowledged] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [sceneReady, setSceneReady] = useState(false), [sceneError, setSceneError] = useState(''), [retry, setRetry] = useState(0)
  const sceneStatus = useCallback<StoneSceneStatus>((ready, error) => {
    setSceneReady(ready); setSceneError(error ?? ''); onSceneStatus?.(ready, error)
  }, [onSceneStatus])
  const input = useRef({ x: 0, z: 0, aimX: 1, aimZ: 0, jump: false, fire: false, slide: false })
  const keys = useRef(new Set<string>()), mouse = useRef(false), sequence = useRef(Date.now() * 1000)
  const sender = useRef(send)
  sender.current = send
  const own = state.players.find(p => p.userId === ownId)
  const finished = state.status === 'FINISHED'
  const eliminated = !preparing && !!own && !own.alive
  const pendingElimination = eliminated && !finished && !eliminationAcknowledged
  const [selected, setSelected] = useState<string | null>(null)
  const spectating = !preparing && (!own || !own.alive)
  const viewingId = pendingElimination ? ownId : spectating ? survivorView(state.players, selected ?? ownId) : ownId
  const viewing = state.players.find(player => player.userId === viewingId)
  const spectatorKeys = useRef({ enabled: false, players: state.players, viewingId, exit })
  spectatorKeys.current = { enabled: sceneReady && spectating && !finished && !pendingElimination && !help && !confirmLeave && !chatOpen, players: state.players, viewingId, exit }
  const cycle = (direction: number) => setSelected(nextSurvivor(state.players, viewingId, direction))
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const current = spectatorKeys.current
      if (!current.enabled || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return
      if (event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"],[role="alertdialog"]')) return
      if (event.code === 'Tab') {
        event.preventDefault(); event.stopPropagation()
        if (!event.repeat) setSelected(nextSurvivor(current.players, current.viewingId, event.shiftKey ? -1 : 1))
      } else if (event.code === 'Escape' && current.exit) { event.preventDefault(); current.exit() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  const loading = !preparing && !finished && (state.phase === 'LOADING' || !sceneReady)
  const active = !preparing && !loading && sceneReady && connected && inputReady && !!own?.alive && state.status === 'PLAYING' && state.serverTime >= state.landsAt && !help && !confirmLeave && !chatOpen
  const feedback = useStoneFeedback(state, connected && sceneReady && !preparing && (inputReady || spectating), viewingId ?? '', ownId)
  const canAttack = active && state.phase === 'RUNNING'
  const attackRef = useRef(canAttack)
  attackRef.current = canAttack
  const activeRef = useRef(active)
  activeRef.current = active
  const stop = useCallback(() => {
    keys.current.clear()
    input.current.x = 0; input.current.z = 0; input.current.jump = false; input.current.fire = false; input.current.slide = false
    sender.current({ kind: 'control', seq: ++sequence.current, ...input.current }, true)
  }, [])
  const changeChat = useCallback((open: boolean) => {
    stop(); activeRef.current = false; setChatOpen(open)
  }, [stop])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (chatOpen && event.code === 'Escape' && !event.isComposing && !help && !confirmLeave) {
        event.preventDefault(); event.stopPropagation(); changeChat(false); return
      }
      if (!chat || preparing || !sceneReady || finished || pendingElimination || help || confirmLeave || chatOpen || event.defaultPrevented
        || event.code !== 'Enter' || event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return
      if (event.target instanceof HTMLElement && event.target.closest('input,textarea,select,button,a,[contenteditable="true"],[role="dialog"]')) return
      event.preventDefault(); changeChat(true)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [chat, preparing, sceneReady, finished, pendingElimination, help, confirmLeave, chatOpen, changeChat])
  useEffect(() => {
    stop(); setHelp(false); setConfirmLeave(false); setResultOpen(true); setSelected(null); setChatOpen(false); setEliminationAcknowledged(false)
  }, [state.gameId, stop])
  useEffect(() => {
    if (!active) stop()
  }, [active, stop])
  useEffect(() => {
    if (pendingElimination) { stop(); setHelp(false); setConfirmLeave(false); setChatOpen(false) }
  }, [pendingElimination, stop])
  useEffect(() => {
    const editable = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"],[role="alertdialog"]')
    const down = (event: KeyboardEvent) => {
      if (!activeRef.current || editable(event.target) || !['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyE', 'ShiftLeft', 'ShiftRight'].includes(event.code)) return
      event.preventDefault(); event.stopPropagation()
      const shiftHeld = keys.current.has('ShiftLeft') || keys.current.has('ShiftRight')
      keys.current.add(event.code)
      if (!event.repeat && event.code === 'Space') input.current.jump = true
      if (!event.repeat && event.code === 'KeyE' && attackRef.current) input.current.fire = true
      if (!event.repeat && !shiftHeld && ['ShiftLeft', 'ShiftRight'].includes(event.code)) input.current.slide = true
    }
    const up = (event: KeyboardEvent) => { keys.current.delete(event.code) }
    const moved = () => { mouse.current = true }
    const hidden = () => { if (document.hidden) stop() }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', stop)
    window.addEventListener('pointermove', moved); window.addEventListener('ontop-clear-input', stop); document.addEventListener('visibilitychange', hidden)
    const timer = window.setInterval(() => {
      if (!activeRef.current) return
      const has = (...codes: string[]) => codes.some(code => keys.current.has(code))
      const x = Number(has('KeyD', 'ArrowRight')) - Number(has('KeyA', 'ArrowLeft'))
      const z = Number(has('KeyS', 'ArrowDown')) - Number(has('KeyW', 'ArrowUp'))
      input.current.x = x; input.current.z = z
      if (!mouse.current && (x || z)) { const length = Math.hypot(x, z); input.current.aimX = x / length; input.current.aimZ = z / length }
      sender.current({ kind: 'control', seq: ++sequence.current, ...input.current })
      input.current.jump = false; input.current.fire = false; input.current.slide = false
    }, 80)
    return () => {
      clearInterval(timer); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up)
      window.removeEventListener('blur', stop); window.removeEventListener('pointermove', moved); window.removeEventListener('ontop-clear-input', stop)
      document.removeEventListener('visibilitychange', hidden); stop()
    }
  }, [stop])
  const fire = useCallback(() => { if (activeRef.current && attackRef.current) input.current.fire = true }, [])
  const cooldown = state.serverTime < state.startsAt ? 0 : Math.max(0, ((own?.pigeonReadyAt ?? 0) - state.serverTime) / 1000)
  const slideCooldown = Math.max(0, ((own?.slideReadyAt ?? 0) - state.serverTime) / 1000)
  const knocked = !!own && own.hitAt > 0 && state.serverTime - own.hitAt < 400
  const slide = () => { if (active && !knocked && slideCooldown === 0) input.current.slide = true }
  const elapsed = state.startsAt ? Math.max(0, Math.floor((state.serverTime - state.startsAt) / 1000)) : 0
  const countdown = Math.ceil((state.startsAt - state.serverTime) / 1000)
  const starting = state.phase === 'RUNNING' && state.serverTime - state.startsAt < 650
  const showCountdown = !preparing && sceneReady && connected && inputReady && !finished && !pendingElimination && !help && !confirmLeave
    && (state.phase === 'COUNTDOWN' || starting)
  const falling = !!own?.alive && !own.grounded && own.y < STONE_FLOOR_HEIGHTS[own.floor]! - .35
  const alive = state.players.filter(p => p.alive).length
  const nextRing = Math.min(...state.tiles.filter(t => !t.stepped && t.breakAt > state.serverTime).map(t => t.breakAt))
  const hold = (code: string) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); if (active) { mouse.current = false; keys.current.add(code) } },
    onPointerUp: () => keys.current.delete(code), onPointerCancel: () => keys.current.delete(code), onLostPointerCapture: () => keys.current.delete(code),
  })
  return <section className="stone-rumble" data-phase={state.phase} data-loading={loading} data-preparing={preparing} data-scene-ready={sceneReady} data-spectating={spectating && !pendingElimination} data-eliminated={eliminated} data-awaiting-spectate={pendingElimination} aria-label="돌탑 생존전">
    <StoneRumbleScene state={state} localOnly={localOnly} ownId={ownId} viewId={viewingId ?? ''} input={input} fire={fire}
      feedback={feedback}
      onStatus={sceneStatus} preparationAttempt={preparationAttempt + retry} paused={(preparing || state.phase === 'LOADING') && sceneReady} />
    {loading && <StoneLoadingTips ready={state.readyUserIds?.length ?? 0} total={state.players.length} ownReady={sceneReady}
      error={sceneError} retry={() => sceneError.startsWith('공원 파일') ? location.reload() : setRetry(v => v + 1)} />}
    <header className="stone-rumble-top">
      <div className="stone-rumble-heading"><p>STONE RUMBLE</p><h1><StoneTowerIcon />돌탑 생존전</h1><div className="stone-rumble-counter"><span>생존</span><strong>{alive} <small>/ {state.players.length}</small></strong></div></div>
      <div className="stone-rumble-clock" aria-label="경기 경과 시간">{String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</div>
      <nav aria-label="경기 메뉴">{topActions}<button onClick={() => { stop(); setHelp(true) }}>조작 안내</button>{own?.alive && !finished && <button onClick={() => { stop(); setConfirmLeave(true) }}>기권</button>}</nav>
    </header>
    {eliminated && !pendingElimination && <div className="stone-rumble-eliminated-status" role="status">탈락 · {finished ? '경기 종료' : '생존자 관전 중'}</div>}
    <div className="stone-rumble-notice" data-intro={state.phase === 'DROPPING'} role="status">{!connected ? '연결이 끊겼어요. 다시 연결하는 동안 입력을 멈춰요.' : !inputReady && !finished && !spectating ? '경기 상태를 확인하고 있어요.' : state.phase === 'DROPPING' ? <><b>구름에서 내려오는 중</b><small>3층에 착지하면 움직일 수 있어요</small></> : state.phase === 'COUNTDOWN' || starting || spectating ? '' : falling ? own?.floor === 0 ? '돌탑 아래로 떨어지고 있어요!' : '아래층으로 떨어지고 있어요!' : Number.isFinite(nextRing) && nextRing - state.serverTime < 1800 ? '바깥 발판이 곧 무너져요!' : ''}</div>
    {showCountdown && <div className="stone-rumble-countdown" role="status" aria-live="assertive" aria-atomic="true" aria-label="경기 시작 카운트다운">{state.phase === 'COUNTDOWN' ? countdown : '시작!'}</div>}
    {!finished && !pendingElimination && <footer className="stone-rumble-dock" aria-label="경기 하단바">
      {spectating ? <div className="stone-rumble-watch" aria-label="생존자 관전">
        <button disabled={!sceneReady || !viewing || chatOpen} onClick={() => cycle(-1)} aria-label="이전 생존자">‹</button>
        <span title={viewing ? name(viewing.userId) : undefined}><small>생존자 관전 · Tab</small><b>{viewing ? name(viewing.userId) : '생존자 대기'}</b></span>
        <button disabled={!sceneReady || !viewing || chatOpen} onClick={() => cycle(1)} aria-label="다음 생존자">›</button>
      </div> : <div className="stone-rumble-shortcuts"><span><kbd>WASD</kbd> 이동</span><span><kbd>Space</kbd> 점프</span><span><kbd>E</kbd> 발사</span></div>}
      {!spectating && <button className="stone-rumble-slide" disabled={!active || knocked || slideCooldown > 0} onClick={slide} aria-label="슬라이딩" aria-keyshortcuts="Shift" title="Shift · 지상/공중 한 칸 다이빙 · 1초 재사용"><kbd>Shift</kbd><span>{slideCooldown > 0 ? `${slideCooldown.toFixed(1)}초` : '슬라이딩'}</span></button>}
      {chat && <button className="stone-rumble-chat-toggle" aria-label={chatOpen ? '채팅 닫기' : '채팅 열기'} aria-expanded={chatOpen} aria-keyshortcuts="Enter" onClick={() => changeChat(!chatOpen)}><img src={chatIcon} alt="" /><span>채팅</span><kbd>Enter</kbd></button>}
      {spectating && exit && <button className="stone-rumble-dock-exit" onClick={exit} aria-label="게임에서 나가기">나가기</button>}
    </footer>}
    {!finished && !pendingElimination && !spectating &&
        <button className="stone-rumble-pigeon" data-cooling={cooldown > 0} disabled={!canAttack || cooldown > 0} onClick={fire} aria-label={cooldown > 0 ? `비둘기 재충전 ${cooldown.toFixed(1)}초` : '비둘기 발사'} title="비둘기 · 클릭 / E · 1.5초 충전">
          <svg className="stone-rumble-cooldown" viewBox="0 0 72 72" aria-hidden="true"><circle className="stone-rumble-cooldown-track" cx="36" cy="36" r="32" /><circle className="stone-rumble-cooldown-progress" cx="36" cy="36" r="32" pathLength="100" strokeDasharray="100" strokeDashoffset={Math.min(1, cooldown / 1.5) * 100} /></svg>
          <span className="stone-rumble-pigeon-icon"><PigeonIcon /></span>{cooldown > 0 ? <strong>{cooldown.toFixed(1)}</strong> : <kbd>E</kbd>}<span className="stone-pigeon-label">비둘기 공격</span>
        </button>}
    {!spectating && !chatOpen && <div className="stone-rumble-touch" aria-label="터치 조작"><div>{[['ArrowUp', '위'], ['ArrowLeft', '왼쪽'], ['ArrowDown', '아래'], ['ArrowRight', '오른쪽']].map(([code, name]) => <button key={code} disabled={!active} aria-label={`${name} 이동`} {...hold(code!)}>{name}</button>)}</div><button disabled={!active} onClick={() => { input.current.jump = true }}>점프</button></div>}
    {chat && !preparing && !pendingElimination && <StoneRumbleChat key={state.gameId} chat={chat} open={chatOpen && !help && !confirmLeave && !finished} onOpenChange={changeChat} name={name} />}
    {pendingElimination && <PaperPopup title="돌탑 생존전" label="돌탑 탈락 안내" onClose={() => setEliminationAcknowledged(true)} closeLabel="관전으로 전환" className="stone-rumble-elimination">
      <div className="stone-rumble-out-mark" aria-hidden="true">OUT</div><h2>탈락했어요</h2>
      <p>{own?.forfeited ? '기권으로 이번 경기에서 탈락했어요.' : '1층 아래로 떨어져 이번 경기에서 탈락했어요.'}</p>
      <p className="stone-rumble-out-copy">다시 움직이거나 공격할 수 없어요.<br /><span>생존자 {alive}명의 경기는 계속돼요.</span></p>
      <button className="paper-primary" onClick={() => setEliminationAcknowledged(true)}>생존자 관전하기</button>
      {exit && <button className="stone-rumble-out-exit" onClick={exit}>게임에서 나가기</button>}
    </PaperPopup>}
    {finished && !resultOpen && <button className="stone-rumble-result-reopen" onClick={() => setResultOpen(true)}>결과 다시 보기</button>}
    {finished && resultOpen && <PaperPopup title="돌탑 생존전" label="돌탑 경기 결과" onClose={() => setResultOpen(false)} className="stone-rumble-result" closeLabel="경기 결과 닫기">
      <h2>{eliminated ? '탈락했어요' : state.winnerUserIds.includes(ownId) ? '끝까지 살아남았어요!' : state.winnerUserIds.length ? `${state.winnerUserIds.map(name).join(' · ')} 승리` : '함께 떨어졌어요'}</h2>
      {eliminated && <p>{own?.forfeited ? '기권 처리됐어요.' : '1층 아래 추락으로 탈락 처리됐어요.'}{state.winnerUserIds.length > 0 && ` ${state.winnerUserIds.map(name).join(' · ')} 승리`}{state.endReason === 'ALL_FALLEN' && ' 모두 떨어져 무승부예요.'}</p>}
      <p>{state.endReason === 'SIMULATION_LIMIT' ? '서버 지연으로 경기를 중단했어요.' : `${elapsed}초 동안 돌탑에서 버텼어요.`}</p>
      <ul className="paper-players">{[...state.players].sort((a, b) => (a.rank ?? 9) - (b.rank ?? 9)).map(player => {
        const reward = localOnly ? player.rewardCoins : result?.settlementStatus === 'SETTLED'
          ? result.participants.find(p => p.userId === player.userId)?.rewardCoins : null
        return <li key={player.userId}><b>{player.rank && `${state.players.filter(p => p.rank === player.rank).length > 1 ? '공동 ' : ''}${player.rank}위 · `}{name(player.userId)}{player.userId === ownId ? ' (나)' : ''}</b>
          <span>{reward != null && player.rank ? `${reward}냥` : player.forfeited ? '기권' : state.winnerUserIds.includes(player.userId) ? '생존' : '탈락'}</span></li>
      })}</ul>
      {(localOnly || rewardStatus) && <p role="status">{localOnly ? '로컬 연습 경기 · 엽전 정산 없음' : rewardStatus}</p>}{children}{exit && <button onClick={exit}>게임에서 나가기</button>}
    </PaperPopup>}
    {help && <PaperPopup title="돌탑 생존전" label="돌탑 조작 안내" onClose={() => setHelp(false)} closeLabel="조작 안내 닫기" className="stone-rumble-help">
      <h2>핵심 조작</h2>
      <dl className="stone-rumble-help-controls" aria-label="핵심 조작 키">
        <div><dt>이동</dt><dd><kbd>WASD</kbd><span>/</span><kbd>방향키</kbd></dd></div>
        <div><dt>점프</dt><dd><kbd>Space</kbd></dd></div>
        <div><dt>슬라이딩</dt><dd><kbd>Shift</kbd><small>공중에서도 한 칸 이동</small></dd></div>
        <div><dt>비둘기 공격</dt><dd><kbd>클릭</kbd><span>/</span><kbd>E</kbd><small>마우스 조준 · 1.5초 충전</small></dd></div>
      </dl>
      <div className="stone-rumble-help-shortcuts"><span>채팅 <kbd>Enter</kbd></span><span>관전 전환 <kbd>Tab</kbd> / <kbd>Shift + Tab</kbd></span></div>
      <p className="stone-rumble-help-live">안내를 보는 동안에도 경기는 계속돼요.</p>
      <details className="stone-rumble-help-rules">
        <summary>자세한 게임 규칙</summary>
        <div className="stone-rumble-help-copy">
          <p><strong>마지막까지 살아남은 한 명이 승리해요!</strong></p>
          <h3>1. 구름에서 내려와 준비해요</h3>
          <p>2~8명이 3층에 내려와요. 착지 후 3·2·1 동안에는 자유롭게 움직여도 발판이 사라지지 않아요. <strong>‘시작!’이 뜨면 경기 시작!</strong></p>
          <h3>2. 발판이 사라지기 전에 이동해요</h3>
          <p>밟은 발판은 <strong>1.2초 뒤에 사라져요.</strong> 황토색으로 바뀐 발판이 붉어지면 곧 무너진다는 뜻이에요. 다른 발판으로 옮겨 가세요.</p>
          <p>시작 10초 뒤부터는 <strong>3층 바깥쪽부터 6초마다 한 겹씩</strong> 무너져요. 3층이 모두 사라지면 2층, 그다음 1층의 바깥쪽부터 무너져요.</p>
          <p>떨어져도 아래층에 착지하면 계속할 수 있어요. <strong>1층 아래로 더 떨어지면 탈락해요.</strong></p>
          <h3>3. 슬라이딩과 비둘기를 활용해요</h3>
          <p><strong>슬라이딩 — Shift</strong><br />몸을 앞으로 던져 한 칸 이동해요. 움직이던 방향으로, 멈춰 있다면 바라보는 방향으로 나아가요. 점프한 뒤에도 쓸 수 있고, 다시 쓰려면 1초 기다려요.</p>
          <p><strong>비둘기 공격 — 클릭 / E</strong><br />마우스로 상대를 조준하고 쏘세요. 1.5초마다 충전되며 버튼의 원이 가득 차면 다시 쏠 수 있어요. 맞은 사람은 발판 한 칸만큼 밀려나고 잠깐 움직일 수 없어요.</p>
          <h3>4. 탈락하면 관전하거나 나가요</h3>
          <p>탈락하면 더 이상 움직이거나 공격할 수 없어요. <strong>‘생존자 관전하기’</strong>를 누르면 살아 있는 플레이어의 시점으로 볼 수 있어요.</p>
          <p><strong>Tab</strong>은 다음 생존자, <strong>Shift + Tab</strong>은 이전 생존자로 바꿔요. 보고 있던 사람이 탈락하면 다른 생존자로 자동 전환돼요. 관전 중 ‘나가기’ 버튼이나 Esc로 나갈 수 있어요.</p>
          <h3>채팅할 때는 주의해요</h3>
          <p>순위 보상은 <strong>(참가 인원 − 순위 + 1) × 10냥</strong>이에요. 공동 탈락은 해당 순위들의 보상을 평균하고, 기권해도 순위 보상을 받아요.</p>
          <p><strong>Enter</strong>로 채팅을 열고 메시지를 보내요. <strong>Esc</strong>로 닫아요. 채팅 중에는 내 이동과 공격이 멈추지만, 발판과 다른 플레이어는 계속 움직여요.</p>
        </div>
      </details>
      <button className="paper-primary" onClick={() => setHelp(false)}>경기로 돌아가기</button>
    </PaperPopup>}
    {confirmLeave && <PaperPopup title="돌탑 생존전" label="돌탑 기권 확인" onClose={() => setConfirmLeave(false)} closeLabel="기권 취소" className="stone-rumble-forfeit"><h2>기권하시겠습니까?</h2><p>기권하면 이번 경기에서 탈락해요.<br />생존자를 관전하거나 게임에서 나갈 수 있어요.</p><button className="paper-primary" onClick={() => setConfirmLeave(false)}>계속 플레이</button><button className="stone-rumble-forfeit-confirm" onClick={() => { leave(); setConfirmLeave(false) }}>기권하기</button></PaperPopup>}
  </section>
}
