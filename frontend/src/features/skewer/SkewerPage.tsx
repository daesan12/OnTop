import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { GREETING_MS, INGREDIENTS, ORDER_MS, availableEnds, createDeck, currentCard, formatTime, gameReducer, initialGame, ingredientName, pieceLabel, transitionText } from './game'
import { SkewerScene } from './SkewerScene'
import type { SceneCommand } from './SkewerScene'
import { IngredientIcon, OrderDisplay } from './OrderDisplay'
import { RoundPanel, PauseDialog, ArrowIcon } from './GamePanels'
import { SkewerResult } from './SkewerResult'
import { EntryPanel } from './PreparationPanel'
import { assemblyGuide, nextInstruction } from './presentation'
import { SkewerFeedback } from './feedback'
import './skewer.css'
import './preparation.css'

export default function SkewerPage({ authorizeStart, entryFee, onExit, onResultExit, playMode, onChangeMode }: { authorizeStart?: () => Promise<boolean>; entryFee?: number; onExit?: () => void; onResultExit?: () => void; playMode?: 'pc' | 'vr'; onChangeMode?: () => void } = {}) {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => initialGame())
  const [xrSupported, setXRSupported] = useState<boolean | null>(null)
  const [xrActive, setXRActive] = useState(false)
  const xrActiveRef = useRef(false)
  const playModeRef = useRef(playMode)
  playModeRef.current = playMode
  const startVRRef = useRef<(type: 'start' | 'restart' | 'resume') => Promise<void>>(async () => {})
  const [xrPending, setXRPending] = useState(false)
  const [notice, setNotice] = useState('')
  const [sceneError, setSceneError] = useState('')
  const [muted, setMuted] = useState(false)
  const [starting, setStarting] = useState(false)
  const startingRef = useRef(false)
  const mounted = useRef(true)
  const exitRef = useRef(onExit)
  exitRef.current = onExit
  const authorizeRef = useRef(authorizeStart)
  authorizeRef.current = authorizeStart
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<SkewerScene | null>(null)
  const feedback = useRef<SkewerFeedback | null>(null)
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const latest = useRef(state)
  latest.current = state
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  const toggleSound = useCallback(() => {
    const next = !mutedRef.current
    mutedRef.current = next
    feedback.current?.setMuted(next)
    if (!next) feedback.current?.unlock()
    setMuted(next)
  }, [])
  const command = useCallback((action: SceneCommand) => {
    if (!mounted.current) return
    if (action.type === 'sound') { toggleSound(); return }
    if (startingRef.current) return
    if (transitionText(latest.current) && latest.current.phase !== 'paused' && action.type !== 'pause') return
    if ((action.type === 'start' || action.type === 'restart' || action.type === 'resume') && playModeRef.current === 'vr' && !xrActiveRef.current) {
      void startVRRef.current(action.type)
      return
    }
    feedback.current?.unlock()
    setNotice('')
    const now = performance.now()
    if (action.type === 'start' || action.type === 'restart') {
      const phase = latest.current.phase
      if ((action.type === 'start' && phase !== 'ready') || (action.type === 'restart' && phase !== 'finished')) return
      if (startingRef.current) return
      if (authorizeRef.current) {
        startingRef.current = true
        setStarting(true)
        setNotice('이번 판 이용권을 확인하고 있어요…')
        void authorizeRef.current().then(approved => {
          if (!approved) { setNotice('이용권을 확인하지 못했어요. 잔액과 연결 상태를 확인한 뒤 다시 시도해 주세요.'); return }
          setNotice('')
          const now = performance.now()
          if (action.type === 'restart') dispatch({ type: 'restart', now, deck: createDeck() })
          else dispatch({ type: 'start', now })
        }).catch(() => setNotice('이용권 확인 중 문제가 생겼어요. 같은 요청으로 다시 시도해 주세요.'))
          .finally(() => { startingRef.current = false; setStarting(false) })
        return
      }
    }
    if (action.type === 'restart' || action.type === 'home') dispatch({ type: action.type, now, deck: createDeck() })
    else if (action.type === 'select') dispatch({ type: 'select', ingredient: action.ingredient, now })
    else if (action.type === 'thread') {
      const ingredient = action.ingredient ?? latest.current.pending
      if (ingredient) dispatch({ type: 'thread', ingredient, now })
      else setNotice('먼저 재료를 선택해 주세요.')
    } else dispatch({ type: action.type, now })
  }, [toggleSound])

  useEffect(() => {
    const cues = new SkewerFeedback()
    feedback.current = cues
    return () => { cues.dispose(); feedback.current = null }
  }, [])
  useEffect(() => { feedback.current?.setMuted(muted); scene.current?.setMuted(muted) }, [muted])
  useEffect(() => { feedback.current?.update(state) }, [state])

  useEffect(() => {
    let active = true
    if (window.isSecureContext && navigator.xr) {
      navigator.xr.isSessionSupported('immersive-vr').then(supported => { if (active) setXRSupported(supported) }).catch(() => { if (active) setXRSupported(false) })
    } else setXRSupported(false)
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!host.current) return
    try {
      scene.current = new SkewerScene(host.current, latest.current, {
        command, xrChanged: active => { xrActiveRef.current = active; setXRActive(active) },
        pause: () => dispatch({ type: 'pause', now: performance.now() }), notice: setNotice,
      })
    } catch (error) {
      setSceneError(`3D 화면을 열 수 없어요. ${error instanceof Error ? error.message : 'WebGL 지원 브라우저를 사용해 주세요.'}`)
    }
    return () => { scene.current?.dispose(); scene.current = null }
  }, [command])
  useEffect(() => { scene.current?.update(state) }, [state])
  useEffect(() => { scene.current?.setEntryFee(entryFee) }, [entryFee])
  useEffect(() => { scene.current?.setNotice(notice) }, [notice])
  useEffect(() => {
    if (state.phase !== 'playing' && state.phase !== 'countdown' && state.phase !== 'ending') return
    const interval = window.setInterval(() => dispatch({ type: 'tick', now: performance.now() }), 100)
    return () => window.clearInterval(interval)
  }, [state.phase])

  useEffect(() => {
    const onHidden = () => { if (document.hidden) dispatch({ type: 'pause', now: performance.now() }) }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
      if (latest.current.phase === 'finished') return
      const target = event.target as HTMLElement
      if (target.matches('input, textarea, select, [contenteditable="true"]') || target.closest('dialog, [role="dialog"], [role="alertdialog"]')) return
      const item = INGREDIENTS.find(item => item.key === event.key)
      if (item) { event.preventDefault(); if (target.tagName === 'BUTTON') target.blur(); command({ type: 'select', ingredient: item.id }); return }
      if (event.key === 'Backspace') { event.preventDefault(); command({ type: 'unthread' }); return }
      if (event.key === 'Escape') {
        // Do not let the same Escape immediately cancel the newly opened dialog.
        event.preventDefault()
        if (latest.current.phase === 'ready') {
          if (!startingRef.current) { if (exitRef.current) exitRef.current(); else window.location.assign('/vr-zone.html') }
        } else command({ type: latest.current.phase === 'paused' ? 'resume' : 'pause' })
        return
      }
      if (target.tagName === 'BUTTON') return
      if (event.code === 'Space') { event.preventDefault(); command({ type: 'thread' }) }
      if (event.key === 'Enter') {
        event.preventDefault()
        const current = latest.current
        if (current.phase === 'ready') { (document.getElementById('sk-preparation-form') as HTMLFormElement | null)?.requestSubmit(); return }
        command({ type: current.phase === 'result' ? 'next' : current.phase === 'finished' ? 'restart' : currentCard(current).kind === 'greeting' ? 'greet' : 'submit' })
      }
    }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('visibilitychange', onHidden); window.removeEventListener('keydown', onKeyDown) }
  }, [command])

  const enterVR = async () => {
    if (xrPending || !scene.current) return false
    // Prepare audio during the browser gesture, before controller-only play.
    feedback.current?.unlock()
    setXRPending(true)
    setNotice('')
    try {
      if (xrSupported === false && window.isSecureContext) { setNotice('Quest의 VR 지원 브라우저에서 열어주세요. 일반 플레이는 플레이 방식 바꾸기에서 선택할 수 있어요.'); return false }
      await scene.current.enterVR()
      return true
    } catch (error) {
      const name = error instanceof Error ? error.name : ''
      setNotice(name === 'NotAllowedError' || name === 'SecurityError' ? 'VR 권한을 허용한 뒤 다시 시작해 주세요.' : name === 'NotSupportedError' ? 'VR 지원 퀘스트 브라우저에서 열어주세요.' : error instanceof Error ? error.message : 'VR 연결을 확인해 주세요.')
      return false
    } finally { setXRPending(false) }
  }

  useEffect(() => {
    const id = state.phase === 'result' ? 'sk-round-title' : ''
    if (id) document.getElementById(id)?.focus({ preventScroll: true })
  }, [state.phase])

  const card = currentCard(state)
  const playing = state.phase === 'playing'
  const assembling = playing && card.kind === 'order'
  const transition = transitionText(state)
  const lobby = state.phase === 'ready' || state.phase === 'finished' || state.phase === 'result' || !!transition
  const instruction = nextInstruction(state)
  const guide = card.kind === 'order' ? assemblyGuide(state.skewer, card.recipe) : null
  const orderNumber = state.deck.slice(0, state.cardIndex + 1).filter(card => card.kind === 'order').length
  const startVR = async (type: 'start' | 'restart' | 'resume' = 'start') => { if (await enterVR() && mounted.current && xrActiveRef.current) command({ type }) }
  startVRRef.current = startVR
  return <main className={`sk-app sk-phase-${state.phase}${transition ? ' sk-transition-layout' : ''}`} data-phase={state.phase}>
    <header className="sk-header">
      <div className="sk-brand"><h1>온탑 꼬치왕</h1></div>
      {!lobby ? <div className="sk-stats"><span>점수 <strong data-testid="score">{state.score}</strong></span><span className={state.remainingMs <= 10_000 ? 'sk-urgent' : ''}>남은 시간 <strong data-testid="timer">{formatTime(state.remainingMs)}</strong></span></div> : null}
      <div className="sk-header-actions">
        {(!lobby && playMode !== 'pc') || xrActive || (playMode === 'vr' && state.phase === 'finished') ? <button className="sk-vr-button" onClick={() => void enterVR()} disabled={xrPending || !!sceneError}>{xrPending ? '연결 중…' : xrActive ? 'VR 나가기' : 'VR 시작'}</button> : null}
        <button className="sk-icon-button sk-sound-button" type="button" onClick={toggleSound} aria-label={muted ? '소리 켜기' : '소리 끄기'} aria-pressed={muted}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4Z" />{muted ? <path d="m17 9 5 6m0-6-5 6" /> : <path d="M17 8a6 6 0 0 1 0 8M20 5a10 10 0 0 1 0 14" />}</svg>
        </button>
      </div>
    </header>
    <div className={`sk-content${lobby ? ' sk-lobby-layout' : ''}`} inert={state.phase === 'finished'}>
      <section className="sk-stage" aria-label="3D 꼬치 조리대">
        <div className="sk-canvas" ref={host} />
        <div className="sk-view-tools"><button className="sk-icon-button" type="button" onClick={() => scene.current?.resetView()} aria-label="시점 초기화" title="마우스 오른쪽 드래그로 둘러보기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1 7M4 4v6h6" /></svg></button></div>
        {sceneError ? <div className="sk-scene-error" role="alert"><strong>3D 화면을 열지 못했어요</strong><p>{sceneError}</p><p>재료 버튼으로 계속 플레이할 수 있어요.</p></div> : null}
        {!lobby ? <section className="sk-kitchen-controls" aria-label="조리 도구">
          <div className="sk-kitchen-heading"><h2>재료를 집어 꼬치 끝에 꽂아주세요</h2><span>숫자 선택 후 Space</span></div>
          <div className="sk-ingredients" aria-label="남은 재료">{INGREDIENTS.map(item => {
            const available = availableEnds(state.skewer, item.id)
            return <button key={item.id} disabled={!assembling || available <= 0} aria-label={`${item.name} 선택`} aria-pressed={state.pending === item.id} onClick={() => command({ type: 'select', ingredient: item.id })}>
              <IngredientIcon id={item.id} /><span>{item.name}</span><small>{item.fabric ? available === 2 ? '한 장' : available === 1 ? '뒤끝 남음' : '사용 중' : available ? '1개' : '사용 중'}</small><kbd>{item.key}</kbd>
            </button>
          })}</div>
          <div className="sk-thread-row"><p className="sk-status" role="status" aria-live="polite">{notice || (state.pending ? state.message : state.feedback === 'error' ? state.message : '음식을 드래그하거나 재료 버튼을 눌러 선택하세요.')}</p><button className="sk-thread-button" disabled={!assembling || !state.pending || xrActive} onClick={() => command({ type: 'thread' })}>{state.pending ? `${ingredientName(state.pending)} 꽂기` : '음식을 선택하세요'}<kbd>Space</kbd></button></div>
        </section> : null}
      </section>
      {!transition && state.phase !== 'finished' ? <aside className={`sk-sidebar${lobby ? ' sk-lifecycle-sidebar' : ''}`} aria-label={state.phase === 'ready' ? '게임 시작' : state.phase === 'result' ? '주문 결과' : '주문과 조작'}>
        {state.phase === 'ready' ? <EntryPanel start={() => command({ type: 'start' })} startVR={() => void startVR()} pending={xrPending || starting} notice={notice} supported={xrSupported} entryFee={entryFee} playMode={playMode} changeMode={onChangeMode} exit={() => { if (onExit) onExit(); else window.location.assign('/vr-zone.html') }} />
          : state.phase === 'result' ? <RoundPanel state={state} next={() => command({ type: 'next' })} />
          : <>
            <section className="sk-order">
              <div className="sk-section-heading"><h2>{card.kind === 'order' ? `주문 ${orderNumber}` : '손님이 왔어요'}</h2><span data-testid="card-index">{card.kind === 'order' ? `완성하면 +${card.value}점` : '인사하면 +1점'}</span></div>
              <div className={`sk-time-track${state.remainingMs <= 10_000 ? ' sk-time-urgent' : ''}`} aria-hidden="true"><span style={{ transform: `scaleX(${state.remainingMs / (card.kind === 'greeting' ? GREETING_MS : ORDER_MS)})` }} /></div>
              {card.kind === 'order' ? <><h3 className="sk-order-name">{card.name}</h3><OrderDisplay recipe={card.recipe} actual={state.skewer} /></>
                : <div className="sk-greeting"><h3>어서 오세요!</h3><p>3초 안에 인사해 주세요.<br />반갑게 맞이하면 보너스 1점!</p><button className="sk-primary" disabled={!playing} onClick={() => command({ type: 'greet' })}>어서 오세요!<ArrowIcon /></button></div>}
            </section>
            {card.kind === 'order' ? <>
              <div className={`sk-next-instruction${guide?.mismatch ? ' sk-guide-mismatch' : ''}`}><strong>{instruction.title}</strong><p>{instruction.detail}</p></div>
              <div className="sk-current"><strong>내 꼬치</strong><ol aria-label="내 꼬치 조립 순서">{state.skewer.map((id, index) => <li key={index} data-ingredient={id}>{pieceLabel(state.skewer, index)}{index < state.skewer.length - 1 ? <span aria-hidden="true"> · </span> : null}</li>)}{!state.skewer.length ? <li>아직 빈 꼬치예요</li> : null}</ol></div>
              <div className="sk-actions"><button className="sk-primary" disabled={!assembling || !state.skewer.length} onClick={() => command({ type: 'submit' })}>서빙하기<ArrowIcon /></button><div className="sk-secondary-actions"><button disabled={!assembling || !state.skewer.length} onClick={() => command({ type: 'unthread' })}>끝 재료 빼기</button><button disabled={!assembling || !state.pending} onClick={() => command({ type: 'cancel' })}>선택 취소</button></div></div>
            </> : null}
            <footer className="sk-sidebar-footer"><details className="sk-help"><summary>조작 방법</summary><p><strong>PC</strong><br />1–6 선택 → Space 꽂기 · Enter 서빙<br />Backspace 끝 재료 빼기 · Esc 일시정지<br />3D 음식 드래그 · 오른쪽 드래그 시점 회전</p><p><strong>VR</strong><br />트리거로 음식 집기 → 중심과 꼬치 방향 맞추기<br />그립으로 꼬치 잡기 → 접시 뒤쪽에 수평으로 놓아 서빙</p><p>치즈·베이컨은 앞끝 → 감쌀 음식 → 뒤끝 순서로 꽂아요. 꼬치 전체를 반대로 만들어도 정답이에요.</p></details><button className="sk-text-button" onClick={() => command({ type: 'pause' })}>일시정지</button></footer>
          </>}
      </aside> : null}
    </div>
    {state.phase === 'finished' ? <SkewerResult state={state} restart={() => command({ type: 'restart' })} exit={() => {
      if (startingRef.current) return
      if (onResultExit) onResultExit()
      else if (exitRef.current) exitRef.current()
      else window.location.assign('/vr-zone.html')
    }} entryFee={entryFee} pending={starting} notice={notice} playMode={playMode ?? (xrActive ? 'vr' : 'pc')} /> : null}
    {transition ? <div className="sk-transition-overlay" role="status" aria-live="assertive" aria-atomic="true"><strong key={transition}>{transition}</strong></div> : null}
    {state.phase === 'paused' ? <PauseDialog resume={() => command({ type: 'resume' })} /> : null}
  </main>
}
