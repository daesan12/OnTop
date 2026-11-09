import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { playSfx } from '../../audio/sfx'
import cabinet from './assets/cabinet.png'
import holeArt from '../mole/assets/hole.webp'
import moleArt from '../mole/assets/mole.webp'
import malletArt from '../mole/assets/mallet.webp'
import { SevenSegment } from '../mole/SevenSegment'
import { inputState } from '../../world/inputOwnership'
import { speedMoleHole, speedMoleRandom, SpeedMoleRound, SPEED_MOLE_CODES, SPEED_MOLE_COUNTDOWN_MS, SPEED_MOLE_DURATION_MS, SPEED_MOLE_KEYS, SPEED_MOLE_POINTS_PER_COIN } from './game'
import { speedMoleService, SpeedMoleError, type SpeedMoleResult, type SpeedMoleSession, type SpeedMoleTap } from './service'
import { SpeedMoleRankings } from './SpeedMoleRankings'
import { SpeedMoleTrophy } from './SpeedMoleRankingBoard'
import './speed-mole.css'
import './speed-mole-menus.css'
import { MoleStartGuide } from '../arcade/MoleStartGuide'
import { useMole } from '../mole/store'
import { useSession } from '../../network/worldClient'
import { RewardCoinSource } from '../wallet/RewardCoinFlight'
import { settleSpeedMole } from './settlement'

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
  const commonRewards = useMole(s => s.state)
  const sessionOwner = useRef('')
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
      sessionOwner.current = useSession.getState().sessionId ?? ''
      const at = performance.now()
      const begins = server ? at + Date.parse(server.startedAt) - Date.parse(server.serverNow) : at + SPEED_MOLE_COUNTDOWN_MS
      round.current = new SpeedMoleRound(begins, server ? speedMoleRandom(server.seed) : Math.random)
      setFeedback([]); setSwing(null); setConfirmQuit(false); setNow(at); setPhase('countdown')
      root.current?.focus()
    } catch (e) {
      if (generation !== requestGeneration.current) return
      if (e instanceof SpeedMoleError && ['SPEED_MOLE_ROUND_FINISHED', 'SPEED_MOLE_ROUND_EXPIRED','SPEED_MOLE_ROUND_SUPERSEDED'].includes(e.code)) startKey.current = ''
      setError(e instanceof Error ? e.message : '시작 요청을 확인하지 못했어요.'); setPhase(previous)
    }
  }
  const save = async () => {
    const current = session.current
    if (localPreview || !current || saveBusy.current || saved?.id === current.id) return
    saveBusy.current = true; setSaving(true); setError('')
    const generation = requestGeneration.current
    try { const value = await settleSpeedMole(current.id, taps.current, sessionOwner.current); if (generation === requestGeneration.current) setSaved(value) }
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
    // 두더지 잡기와 같은 타격음. 빈 구멍(실수)은 소리 없이 −3 표시만 한다.
    if (event.kind === 'hit') playSfx('mole-hit')
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
    <header className="speed-mole__heading"><span>온탑 오락실</span><h1 id="speed-mole-title">스피드 두더지 잡기</h1><small>기존 두더지보다 더 스피드하게!</small></header>
    {phase !== 'ready' && <button type="button" className="speed-mole__close" onClick={() => handlers.current.escape()} aria-label="스피드 두더지 잡기 닫기">×</button>}
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
    {phase === 'ready' && <MoleStartGuide name="스피드 두더지 잡기" headline="더 빠르게, 톡! 톡!"
      description={<>기존 두더지 잡기보다 더 스피드하게 즐겨요.<br />60초 동안 나만의 최고 기록에 도전해요.</>}
      seconds={60} keyGroups={[SPEED_MOLE_KEYS.slice(0,4),SPEED_MOLE_KEYS.slice(4)]} twoRows
      details={<><p><span>성공 <b>+1점</b></span><span>실수 <b>−3점</b></span><span>최저 <b>0점</b></span></p>{!localPreview && <p>{SPEED_MOLE_POINTS_PER_COIN}점당 1냥 · 오늘 미니게임 {commonRewards ? `${commonRewards.todayEarned}/${commonRewards.dailyCap}냥` : '확인 중'}</p>}</>}
      error={error} onStart={() => void start()} onClose={onClose}
      extra={!localPreview && <button type="button" onClick={() => setRankingsOpen(true)}><SpeedMoleTrophy />내 최고 기록 · 전체 랭킹</button>} />}
    {phase === 'starting' && <div className="speed-mole__veil"><section className="speed-mole__card" role="status"><h2>두더지들이 준비 중이에요</h2><p>잠시만요. 곧 3초 카운트다운이 시작돼요.</p></section></div>}
    {phase === 'countdown' && <div className="speed-mole__countdown" role="status" aria-label="시작 카운트다운" aria-live="assertive">
      <span>준비하세요!</span><b key={game?.countdown(now)}>{game?.countdown(now)}</b><small>{keySummary} · 곧 시작해요</small>
    </div>}
    {confirmQuit && active && <div className="speed-mole__veil"><section className="speed-mole__card" role="alertdialog" aria-label="게임 종료 확인">
      <h2>여기서 그만할까요?</h2><p>남은 시간은 계속 흐르고 있어요.</p>
      <div className="speed-mole__actions"><button className="speed-mole__primary" onClick={() => setConfirmQuit(false)}>계속하기</button><button onClick={onClose}>게임 선택으로</button></div>
    </section></div>}
    {phase === 'result' && <div className="speed-mole__veil"><section className="speed-mole__card speed-mole__card--result" aria-label="스피드 두더지 잡기 결과">
      <div className="speed-mole__result-medal"><SpeedMoleTrophy /></div><span className="speed-mole__eyebrow">도전 완료</span><h2>60초의 손끝 기록</h2><strong className="speed-mole__result-score">{display?.score ?? 0}<small>점</small></strong>
      <dl><div><dt>성공</dt><dd>{display?.hits ?? 0}회</dd></div><div><dt>실수</dt><dd>{display?.misses ?? 0}회</dd></div><div><dt>정확도</dt><dd>{accuracy}%</dd></div></dl>
      {!localPreview && <p className="speed-mole__save-state" data-saved={!!saved} role="status">{saving ? '기록을 확인하고 있어요…' : saved ? '기록 저장 완료 · 내 최고 기록은 랭킹에서 확인해요.' : '기록 저장 결과를 아직 확인하지 못했어요.'}</p>}
      {saved && <div className="speed-mole__reward"><strong>{saved.reward > 0 ? <RewardCoinSource receipt={`mole:reward:speed:${saved.id}`} amount={saved.reward} soundOnReveal>+{saved.reward}냥</RewardCoinSource> : '+0냥'}</strong><small>오늘 미니게임 {saved.todayEarned}/{saved.dailyCap}냥{saved.reward < saved.calculatedReward && ' · 하루 상한에 도달했어요.'}</small></div>}
      {error && <p role="alert">{error}</p>}
      {!localPreview && !saved && !saving && <button onClick={() => void save()}>같은 기록 저장 다시 확인</button>}
      {!localPreview && <button className="speed-mole__rank-button" disabled={saving} onClick={() => setRankingsOpen(true)}><SpeedMoleTrophy />내 최고 기록 · 전체 랭킹</button>}
      <div className="speed-mole__actions"><button className="speed-mole__primary" disabled={saving} onClick={start}>한 판 더!</button><button onClick={onClose}>게임 선택</button></div>
      <small>Enter / Space로 다시 도전</small>
    </section></div>}
    {rankingsOpen && <SpeedMoleRankings onClose={() => { setRankingsOpen(false); root.current?.focus() }} />}
    <footer className="speed-mole__local">{localPreview ? '로컬 조작 시안 · 기록·랭킹 저장 없음' : `무료 도전 · ${SPEED_MOLE_POINTS_PER_COIN}점당 1냥`}</footer>
  </div>
}
