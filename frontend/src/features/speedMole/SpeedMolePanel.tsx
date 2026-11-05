import { useEffect, useRef, useState, type CSSProperties } from 'react'
import cabinet from './assets/cabinet.png'
import holeArt from '../mole/assets/hole.webp'
import moleArt from '../mole/assets/mole.webp'
import malletArt from '../mole/assets/mallet.webp'
import { SevenSegment } from '../mole/SevenSegment'
import { inputState } from '../../world/inputOwnership'
import { speedMoleHole, speedMoleRandom, SpeedMoleRound, SPEED_MOLE_CODES, SPEED_MOLE_COUNTDOWN_MS, SPEED_MOLE_DURATION_MS, SPEED_MOLE_KEYS } from './game'
import { speedMoleService, SpeedMoleError, type SpeedMoleResult, type SpeedMoleSession, type SpeedMoleTap } from './service'
import { SpeedMoleRankings } from './SpeedMoleRankings'
import './speed-mole.css'

type Phase = 'ready' | 'starting' | 'countdown' | 'playing' | 'result'
interface Feedback { id: number; hole: number; kind: 'hit' | 'miss'; at: number }
const layout = SPEED_MOLE_KEYS.map((_, index) => ({ left: `${26 + (index % 4) * 16}%`, top: `${index < 4 ? 61 : 80}%` }))
const keySummary = `${SPEED_MOLE_KEYS.slice(0, 4).join('')} / ${SPEED_MOLE_KEYS.slice(4).join('')}`

/** Sends tap evidence for server replay; localPreview remains an explicit, unranked local tool. */
export function SpeedMolePanel({ onClose, localPreview = false }: { onClose: () => void; localPreview?: boolean }) {
  const [phase, setPhaseState] = useState<Phase>('ready')
  const phaseRef = useRef<Phase>('ready')
  const setPhase = (next: Phase) => { phaseRef.current = next; setPhaseState(next) }
  const [now, setNow] = useState(() => performance.now())
  const [confirmQuit, setConfirmQuit] = useState(false)
  const [rankingsOpen, setRankingsOpen] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<SpeedMoleResult | null>(null)
  const session = useRef<SpeedMoleSession | null>(null)
  const taps = useRef<SpeedMoleTap[]>([])
  const startKey = useRef('')
  const requestGeneration = useRef(0)
  const saveBusy = useRef(false)
  const [feedback, setFeedback] = useState<Feedback[]>([])
  const [swing, setSwing] = useState<Feedback | null>(null)
  const round = useRef<SpeedMoleRound | null>(null)
  const seq = useRef(0)
  const root = useRef<HTMLDivElement>(null)
  const handlers = useRef({ strike: (_hole: number) => {}, start: () => {}, escape: () => {} })
  const active = phase === 'playing'
  const ticking = active || phase === 'countdown'
  const game = round.current
  const remaining = active && game ? game.remaining(now) : phase === 'result' ? 0 : SPEED_MOLE_DURATION_MS
  const display = phase === 'result' && saved ? saved : game
  const attempts = (display?.hits ?? 0) + (display?.misses ?? 0)
  const accuracy = attempts ? Math.round((display?.hits ?? 0) / attempts * 100) : 100
  const start = async () => {
    if (!['ready', 'result'].includes(phaseRef.current) || saveBusy.current || rankingsOpen) return
    const previous = phaseRef.current, generation = ++requestGeneration.current
    setError(''); setPhase('starting')
    try {
      let server: SpeedMoleSession | null = null
      if (!localPreview) {
        startKey.current ||= crypto.randomUUID().replaceAll('-', '')
        server = await speedMoleService.start(startKey.current)
      }
      if (generation !== requestGeneration.current) return
      startKey.current = ''
      session.current = server; taps.current = []; setSaved(null)
      const at = performance.now()
      const begins = server ? at + Date.parse(server.startedAt) - Date.parse(server.serverNow) : at + SPEED_MOLE_COUNTDOWN_MS
      round.current = new SpeedMoleRound(begins, server ? speedMoleRandom(server.seed) : Math.random)
      setFeedback([]); setSwing(null); setConfirmQuit(false); setNow(at); setPhase('countdown')
      root.current?.focus()
    } catch (e) {
      if (generation !== requestGeneration.current) return
      if (e instanceof SpeedMoleError && ['SPEED_MOLE_ROUND_FINISHED', 'SPEED_MOLE_ROUND_EXPIRED'].includes(e.code)) startKey.current = ''
      setError(e instanceof Error ? e.message : '시작 요청을 확인하지 못했어요.'); setPhase(previous)
    }
  }
  const save = async () => {
    const current = session.current
    if (localPreview || !current || saveBusy.current || saved?.id === current.id) return
    saveBusy.current = true; setSaving(true); setError('')
    const generation = requestGeneration.current
    try { const value = await speedMoleService.complete(current.id, taps.current); if (generation === requestGeneration.current) setSaved(value) }
    catch (e) { if (generation === requestGeneration.current) setError(e instanceof Error ? e.message : '기록 저장을 확인하지 못했어요.') }
    finally { if (generation === requestGeneration.current) { saveBusy.current = false; setSaving(false) } }
  }
  useEffect(() => { if (phase === 'result') void save() }, [phase])
  useEffect(() => () => { ++requestGeneration.current }, [])
  const strike = (index: number) => {
    if (!['countdown', 'playing'].includes(phaseRef.current) || confirmQuit || rankingsOpen || !round.current || document.hidden || taps.current.length >= 6000) return
    const at = performance.now(), currentPhase = round.current.phaseAt(at)
    setNow(at)
    if (currentPhase !== phaseRef.current) setPhase(currentPhase)
    if (currentPhase !== 'playing') return
    const event = round.current.strike(index, at)
    if (event.kind === 'ignored') { if (round.current.remaining(at) === 0) setPhase('result'); return }
    taps.current.push({ hole: index, at: Math.floor(at - round.current.startedAt) })
    const fx: Feedback = { id: ++seq.current, hole: index, kind: event.kind, at }
    setFeedback(previous => [...previous.filter(item => at - item.at < 320).slice(-15), fx]); setSwing(fx)
  }
  handlers.current = { strike, start: () => { void start() }, escape: () => rankingsOpen ? setRankingsOpen(false) : phaseRef.current === 'playing' ? setConfirmQuit(value => !value) : onClose() }

  useEffect(() => { root.current?.focus() }, [])
  useEffect(() => {
    if (!ticking) return
    let frame = 0, lastPaint = 0
    const tick = (at: number) => {
      if (at - lastPaint >= 50) { setNow(at); lastPaint = at }
      const currentPhase = round.current?.phaseAt(at)
      if (currentPhase && currentPhase !== phaseRef.current) setPhase(currentPhase)
      if (currentPhase === 'result') { setNow(at); setConfirmQuit(false); return }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [ticking])
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (inputState.manualOpen) return
      if (rankingsOpen) { if (event.code === 'Escape') { event.preventDefault(); handlers.current.escape() } return }
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return
      if (SPEED_MOLE_CODES.includes(event.code)) {
        event.preventDefault()
        const index = speedMoleHole(event.code, event.repeat)
        if (index !== null) handlers.current.strike(index)
      } else if (event.code === 'Escape' && !event.repeat) { event.preventDefault(); handlers.current.escape() }
      else if ((event.code === 'Enter' || event.code === 'Space') && !event.repeat
        && (phaseRef.current === 'ready' || phaseRef.current === 'result')
        && !(event.target instanceof HTMLElement && event.target.closest('button'))) {
        event.preventDefault(); handlers.current.start()
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [rankingsOpen])

  return <div ref={root} className="speed-mole" role="dialog" aria-modal="true" aria-labelledby="speed-mole-title" tabIndex={-1}
    style={{ '--speed-cabinet': `url(${cabinet})` } as CSSProperties}>
    <div className="speed-mole__backdrop" />
    <header className="speed-mole__heading"><span>온탑 오락실 · 새 게임</span><h1 id="speed-mole-title">스피드 두더지</h1><small>4마리를 멈추지 말고 톡, 톡!</small></header>
    <button type="button" className="speed-mole__close" onClick={() => handlers.current.escape()} aria-label="스피드 두더지 닫기">×</button>
    <div className="speed-mole__stage">
      <img className="speed-mole__cabinet" src={cabinet} alt="" draggable={false} />
      <div className="speed-mole__led speed-mole__led--score" aria-label={`점수 ${display?.score ?? 0}점`}><span>점수</span><SevenSegment text={String(display?.score ?? 0).padStart(3, '0')} /></div>
      <div className="speed-mole__led speed-mole__led--time" data-urgent={active && remaining <= 10000} role="timer" aria-label={`남은 시간 ${(remaining / 1000).toFixed(1)}초`}><span>남은 시간</span><SevenSegment text={(remaining / 1000).toFixed(1)} /></div>
      <div className="speed-mole__led speed-mole__led--accuracy" aria-label={`정확도 ${accuracy}%`}><span>정확도 %</span><SevenSegment text={String(accuracy).padStart(3, '0')} /></div>
      <div className="speed-mole__progress" aria-hidden="true"><i style={{ width: `${remaining / SPEED_MOLE_DURATION_MS * 100}%` }} /></div>
      <div className="speed-mole__board" role="group" aria-label={`${keySummary} 두 줄 게임판`}>
        {SPEED_MOLE_KEYS.map((key, index) => {
          const target = active ? game?.targets.find(item => item.hole === index) : null
          const fx = feedback.filter(item => item.hole === index && now - item.at < 320).at(-1)
          return <button key={key} type="button" className="speed-mole__hole" style={layout[index]}
            aria-label={`${key} ${target ? '두더지' : '빈 구멍'}`} aria-keyshortcuts={key}
            data-active={!!target} data-feedback={fx?.kind} disabled={!active || confirmQuit}
            onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); strike(index) }}
            onClick={event => { if (event.detail === 0) strike(index) }}>
            <img className="speed-mole__rim speed-mole__rim--back" src={holeArt} alt="" draggable={false} />
            {target && <span key={target.id} className="speed-mole__target"><img src={moleArt} alt="" draggable={false} /></span>}
            <img className="speed-mole__rim speed-mole__rim--front" src={holeArt} alt="" draggable={false} />
            <kbd>{key}</kbd>
            {fx && <span key={fx.id} className="speed-mole__feedback" aria-hidden="true">{fx.kind === 'hit' ? '+1' : '−3'}</span>}
          </button>
        })}
      </div>
      {swing && now - swing.at < 120 && <img key={swing.id} className="speed-mole__mallet" src={malletArt} alt="" style={layout[swing.hole]} />}
      <div className="speed-mole__rules">성공 <b>+1</b><span>·</span>실수 <b>−3</b><span>·</span>최저 0점<span>·</span>입력 잠금 없음</div>
    </div>
    {phase === 'ready' && <div className="speed-mole__veil"><section className="speed-mole__card" aria-label="게임 시작 안내">
      <span className="speed-mole__eyebrow">60 SECONDS · 8 HOLES · 4 MOLES</span><h2>보고, 바로 톡!</h2>
      <p>두더지 4마리가 계속 기다리고 있어요.<br />잡으면 다른 빈 구멍에 바로 나타나요.</p>
      <div className="speed-mole__keys">{[0, 4].map(from => <div key={from}>{SPEED_MOLE_KEYS.slice(from, from + 4).map(key => <kbd key={key}>{key}</kbd>)}</div>)}</div>
      <button className="speed-mole__primary" type="button" onClick={start}>60초 도전 시작 <span>→</span></button>
      {!localPreview && <button className="speed-mole__rank-button" onClick={() => setRankingsOpen(true)}>내 최고 기록 · 전체 랭킹</button>}
      {error && <p role="alert">{error}</p>}
      <small>Enter / Space로도 시작 · 3초 준비 후 60초 도전</small>
      <small>키보드 또는 구멍 클릭 · 키를 누르고 있어도 1회만 판정해요.</small>
    </section></div>}
    {phase === 'starting' && <div className="speed-mole__veil"><section className="speed-mole__card" role="status"><h2>경기를 준비하고 있어요…</h2><p>서버가 시작 시각과 구멍 순서를 정하고 있어요.</p></section></div>}
    {phase === 'countdown' && <div className="speed-mole__countdown" role="status" aria-label="시작 카운트다운" aria-live="assertive">
      <span>준비하세요!</span><b key={game?.countdown(now)}>{game?.countdown(now)}</b><small>{keySummary} · 곧 시작해요</small>
    </div>}
    {confirmQuit && active && <div className="speed-mole__veil"><section className="speed-mole__card" role="alertdialog" aria-label="게임 종료 확인">
      <h2>여기서 그만할까요?</h2><p>남은 시간은 계속 흐르고 있어요.</p>
      <div className="speed-mole__actions"><button className="speed-mole__primary" onClick={() => setConfirmQuit(false)}>계속하기</button><button onClick={onClose}>게임 선택으로</button></div>
    </section></div>}
    {phase === 'result' && <div className="speed-mole__veil"><section className="speed-mole__card" role="status" aria-label="스피드 두더지 결과">
      <span className="speed-mole__eyebrow">TIME UP!</span><h2>60초, 수고했어요!</h2><strong className="speed-mole__result-score">{display?.score ?? 0}<small>점</small></strong>
      <dl><div><dt>성공</dt><dd>{display?.hits ?? 0}회</dd></div><div><dt>실수</dt><dd>{display?.misses ?? 0}회</dd></div><div><dt>정확도</dt><dd>{accuracy}%</dd></div></dl>
      {!localPreview && <p role="status">{saving ? '서버가 점수를 확인하고 있어요…' : saved ? '서버 검증 완료 · 최고 기록과 랭킹에 반영했어요.' : '기록 저장 결과를 아직 확인하지 못했어요.'}</p>}
      {error && <p role="alert">{error}</p>}
      {!localPreview && !saved && !saving && <button onClick={() => void save()}>같은 기록 저장 다시 확인</button>}
      {!localPreview && <button className="speed-mole__rank-button" disabled={saving} onClick={() => setRankingsOpen(true)}>내 최고 기록 · 전체 랭킹</button>}
      <div className="speed-mole__actions"><button className="speed-mole__primary" disabled={saving} onClick={start}>한 판 더!</button><button onClick={onClose}>게임 선택으로</button></div>
      <small>Enter / Space로 다시 도전</small>
    </section></div>}
    {rankingsOpen && <SpeedMoleRankings onClose={() => { setRankingsOpen(false); root.current?.focus() }} />}
    <footer className="speed-mole__local">{localPreview ? '로컬 조작 시안 · 기록·랭킹 저장 없음' : '서버 검증 기록 · 엽전 지급 없음'}</footer>
  </div>
}
