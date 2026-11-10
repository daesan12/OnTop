import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { playSfx } from '../../audio/sfx'
import { openManual } from '../manual/manualState'
import { RewardCoinSource } from '../wallet/RewardCoinFlight'
import { PREVIEW_RULES } from './preview'
import { KEY_CODES, KEYS, POINTS_PER_COIN, type Hit, type Mole } from './protocol'
import { comboTenths, MoleScorer, STUN_MS } from './scoring'
import { SevenSegment } from './SevenSegment'
import { ART, BASE, HOLES, LED_LABELS, LEDS, PHASES, SPRITES, STUN } from './stage'
import { beginMolePlay, closeMole, finishMole, startMole, useMole } from './store'
import './mole.css'
import { MoleStartGuide } from '../arcade/MoleStartGuide'
import { SpeedMoleTrophy } from '../speedMole/SpeedMoleRankingBoard'
import { MoleRankingDialog, MoleRankSummary } from './MoleRankings'

const COUNTDOWN_MS = 3000
const FX_MS = 520
const BONK_MS = 320
const MAX_HITS = 1200
const PHASE_LABELS = ['1구간', '2구간', '피버'] as const
const IMPACT_MS = 360
const FLINCH_MS = 120
const SHAKE_MS = 180
/** 망치 한 번 내리치는 시간. 친 구멍마다 따로 나타났다 사라진다. */
const SWING_MS = 170
/** 헬멧에 늘어나는 금. 한 번 칠 때마다 한 줄씩 더 보인다(헬멧 그림 위쪽 영역, 100×60 기준). */
const CRACKS = ['M50 1 46 12 53 19 47 30 52 40', 'M49 19 37 25 27 22M37 25 33 37', 'M51 30 64 27 74 33M64 27 69 15', 'M47 30 43 44 50 54M27 22 18 31M74 33 83 40'] as const
const SPARKS = [0, 45, 90, 135, 180, 225, 270, 315] as const

interface Fx { id: number; hole: number; text: string; tone: 'catch' | 'gold' | 'empty' | 'decoy'; at: number }
/** 부딪힘: hit 두더지 머리 · tap 헬멧 연타 · big 금색/고슴도치(판이 흔들림) · dust 빈 구멍 */
interface Impact { id: number; hole: number; kind: 'hit' | 'tap' | 'big' | 'dust'; at: number }
interface Swing { id: number; hole: number; at: number }

export function MolePanel() {
  const open = useMole(s => s.open)
  return open ? <MoleScreen /> : null
}

const clockLabel = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** 실제 오락실 두더지 게임기 앞에 선 화면. Gemini로 만든 게임기 그림 위에 구멍·두더지·LED를 얹는다. 점수는 진행 중 표시이며 최종 값은 서버가 정한다. */
function MoleScreen() {
  const { phase, state, round, settlement, error } = useMole()
  const rules = round?.rules ?? state?.rules ?? PREVIEW_RULES
  const [now, setNow] = useState(() => performance.now())
  const [fx, setFx] = useState<Fx[]>([])
  const [swings, setSwings] = useState<Swing[]>([])
  /** 기절시킨 구멍. 기절하는 동안 그 자리에서 망치가 비틀거린다. */
  const [dizzyHole, setDizzyHole] = useState<number | null>(null)
  const [impacts, setImpacts] = useState<Impact[]>([])
  const shakeAt = useRef(-Infinity)
  const tapAt = useRef(new Map<number, number>())
  const [confirmQuit, setConfirmQuit] = useState(false)
  const [rankingsOpen, setRankingsOpen] = useState(false)
  const clock = useRef({ countdownAt: 0, playAt: 0 })
  const scorer = useRef<MoleScorer | null>(null)
  const hits = useRef<Hit[]>([])
  const bonks = useRef(new Map<number, number>())
  const fxSeq = useRef(0)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => { root.current?.focus() }, [])

  const byHole = useMemo(() => KEYS.map((_, hole) => (round?.moles ?? []).filter(m => m.hole === hole)), [round])

  useEffect(() => {
    if (phase !== 'countdown' || !round) return
    clock.current.countdownAt = performance.now()
    scorer.current = new MoleScorer(round.moles, round.rules)
    hits.current = []
    bonks.current = new Map()
    tapAt.current = new Map()
    setFx([]); setImpacts([]); setSwings([]); setDizzyHole(null); setConfirmQuit(false)
  }, [phase, round])

  useEffect(() => {
    if (phase !== 'countdown' && phase !== 'playing') return
    let frame = requestAnimationFrame(function tick(at) { setNow(at); frame = requestAnimationFrame(tick) })
    return () => cancelAnimationFrame(frame)
  }, [phase])

  useEffect(() => {
    if (phase === 'countdown' && now - clock.current.countdownAt >= COUNTDOWN_MS) {
      clock.current.playAt = clock.current.countdownAt + COUNTDOWN_MS
      beginMolePlay()
    } else if (phase === 'playing' && now - clock.current.playAt >= rules.durationMs) {
      setConfirmQuit(false)
      void finishMole(hits.current)
    }
  }, [phase, now, rules.durationMs])

  const strike = (hole: number) => {
    if (useMole.getState().phase !== 'playing' || !scorer.current || hits.current.length >= MAX_HITS) return
    const wall = performance.now(), at = Math.round(wall - clock.current.playAt)
    if (at < 0 || at > rules.durationMs) return
    hits.current.push({ hole, at })
    const event = scorer.current.hit(hole, at)
    // 기절했거나 같은 구멍을 너무 빨리 다시 누르면 망치가 나오지 않는다.
    if (event.type === 'ignored' && (event.reason === 'stunned' || event.reason === 'repeat')) return
    setSwings(list => [...list.filter(s => wall - s.at < SWING_MS), { id: ++fxSeq.current, hole, at: wall }])
    const cue = event.type === 'catch' || event.type === 'tap' ? 'mole-hit' : event.type === 'decoy' ? 'mole-hedgehog-hit'
      // 막 들어간 두더지를 늦게 친 헛손질은 콤보만 끊고 기절하지 않으므로 기절음을 내지 않는다.
      : event.type === 'empty' && event.stunned ? 'mole-empty-stun' : null
    if (cue) playSfx(cue)
    if (event.type === 'empty' && event.stunned) setDizzyHole(hole)
    if (event.type === 'catch' || event.type === 'decoy') bonks.current.set(event.mole.id, at)
    const shown: Pick<Fx, 'text' | 'tone'> | null = event.type === 'catch'
      ? { text: `+${event.points}`, tone: event.mole.kind === 'GOLD' ? 'gold' : 'catch' }
      : event.type === 'decoy' ? { text: `아야! −${rules.decoyPenalty}`, tone: 'decoy' }
      : event.type === 'empty' ? { text: event.stunned ? `헛손질! ${STUN_MS / 1000}초` : '헛!', tone: 'empty' } : null
    if (shown) setFx(list => [...list.filter(f => wall - f.at < FX_MS), { id: ++fxSeq.current, hole, at: wall, ...shown }])
    if (event.type === 'tap') tapAt.current.set(event.mole.id, wall)
    const kind: Impact['kind'] | null = event.type === 'decoy' || (event.type === 'catch' && event.mole.kind === 'GOLD') ? 'big'
      : event.type === 'catch' ? 'hit' : event.type === 'tap' ? 'tap' : event.type === 'empty' ? 'dust' : null
    if (kind === 'big') shakeAt.current = wall
    if (kind) setImpacts(list => [...list.filter(i => wall - i.at < IMPACT_MS), { id: ++fxSeq.current, hole, kind, at: wall }])
  }

  const keys = useRef({ strike, phase, confirmQuit })
  keys.current = { strike, phase, confirmQuit }
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // 게임기 위에 설명서 같은 창이 열려 있으면 그 창이 키를 가진다.
      if (document.querySelector('dialog[open]')) return
      const { phase, confirmQuit } = keys.current
      const hole = (KEY_CODES as readonly string[]).indexOf(event.code)
      if (hole >= 0) {
        event.preventDefault()
        if (!event.repeat) keys.current.strike(hole)
      } else if (event.code === 'Escape') {
        event.preventDefault()
        if (phase === 'playing') setConfirmQuit(!confirmQuit)
        else if (phase !== 'submitting') closeMole()
      } else if ((event.code === 'Enter' || event.code === 'Space') && (phase === 'idle' || phase === 'result')
        && !(event.target instanceof HTMLElement && event.target.closest('button'))) {
        event.preventDefault()
        void startMole()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const playing = phase === 'playing'
  const elapsed = playing ? now - clock.current.playAt : -1
  const live = scorer.current && (playing || phase === 'submitting') ? scorer.current : null
  const phaseIndex = playing ? Math.min(2, Math.floor(elapsed / rules.phaseMs)) : -1
  // 2구간·피버로 넘어갈 때 알림음을 내고, 피버 구간 동안만 배경음악을 피버 곡으로 바꾼다.
  const shownPhase = useRef(-1)
  useEffect(() => {
    if (phaseIndex > shownPhase.current && phaseIndex > 0) playSfx('mole-phase-change')
    shownPhase.current = phaseIndex
    useMole.setState({ fever: phaseIndex === 2 })
  }, [phaseIndex])
  const score = live ? live.total() : phase === 'result' && settlement ? settlement.result.score : 0
  const combo = live?.combo ?? 0
  const tenths = comboTenths(rules, combo)
  const remaining = playing ? rules.durationMs - elapsed : phase === 'submitting' || phase === 'result' ? 0 : rules.durationMs
  const countdown = phase === 'countdown' ? Math.max(1, Math.ceil((COUNTDOWN_MS - (now - clock.current.countdownAt)) / 1000)) : 0
  const todayEarned = state?.todayEarned ?? 0, dailyCap = state?.dailyCap ?? 500
  const stunLeft = live && playing ? Math.max(0, live.stunUntil - elapsed) : 0

  const taps = (mole: Mole) => live?.tapsOf(mole.id) ?? 0
  const holeView = (hole: number) => {
    let mole: Mole | undefined
    for (const candidate of byHole[hole]!) if (candidate.appearAt <= elapsed) mole = candidate; else break
    if (!mole || !live) return { mole: undefined, pose: 'down' as const, caught: false }
    const bonkAt = bonks.current.get(mole.id)
    if (bonkAt !== undefined) return { mole, pose: elapsed - bonkAt < BONK_MS ? 'bonk' as const : 'down' as const, caught: true }
    return { mole, pose: elapsed < mole.leaveAt ? 'up' as const : 'down' as const, caught: false }
  }

  return <div ref={root} className="mole-root" role="dialog" aria-modal="true" aria-labelledby="mole-title" tabIndex={-1}
    data-phase={phase} data-fever={phaseIndex === 2 || undefined} style={{ '--mole-cabinet': `url(${ART.cabinet})` } as CSSProperties}>
    <div className="mole-backdrop" aria-hidden="true" />
    <div className="mole-stage" inert={phase === 'idle'} data-shake={now - shakeAt.current < SHAKE_MS || undefined} data-stunned={stunLeft > 0 || undefined}>
      <img className="mole-cabinet-art" src={ART.cabinet} alt="" draggable={false} />
      <h2 id="mole-title" className="mole-sr">두더지 잡기</h2>
      <div className="mole-scoreboard" role="group" aria-label={`점수 ${score} · 남은 시간 ${clockLabel(remaining)} · 콤보 ${combo}`}>
        {['SCORE', 'TIME', `COMBO ${combo}`].map((label, i) => <span key={i} className="mole-led-label" style={LED_LABELS[i]}>{label}</span>)}
        <SevenSegment className="mole-led" text={String(score).padStart(4, '0')} style={LEDS[0]} />
        <SevenSegment className="mole-led" text={clockLabel(remaining).padStart(5, ' ')} style={LEDS[1]} />
        <span className="mole-led mole-led-combo" style={LEDS[2]} data-hot={tenths > 10 || undefined}>
          <i>×</i><SevenSegment text={(tenths / 10).toFixed(1)} />
        </span>
      </div>
      <div className="mole-phases" style={PHASES} aria-label="구간">
        {PHASE_LABELS.map((label, i) => <div key={label} className="mole-phase" data-current={phaseIndex === i || undefined}
          data-passed={phaseIndex > i || undefined}>
          <i style={{ width: `${phaseIndex === i ? Math.min(100, (elapsed - i * rules.phaseMs) / rules.phaseMs * 100) : phaseIndex > i ? 100 : 0}%` }} />
          <span>{label}</span>
        </div>)}
      </div>
      <div className="mole-fever-strip" aria-hidden="true" />
      {HOLES.map((place, hole) => {
        const view = holeView(hole), mole = view.mole
        return <button key={hole} type="button" className="mole-hole" style={place} aria-label={`${KEYS[hole]} 구멍`} data-hole={hole}
          onPointerDown={event => { event.preventDefault(); strike(hole) }} tabIndex={-1}>
          <img className="mole-hole-back" src={ART.hole} alt="" draggable={false} />
          <span className="mole-slot">
            {mole && <span className="mole-sprite" data-pose={view.pose} data-kind={mole.kind}>
              <span className="mole-body" key={`${mole.id}-${taps(mole)}`}
                data-flinch={now - (tapAt.current.get(mole.id) ?? -Infinity) < FLINCH_MS || undefined}>
                {/* 헬멧이 날아간 뒤에는 헬멧 없는 두더지로 눌린다. */}
                <img src={SPRITES[mole.kind === 'RAPID' && view.caught ? 'NORMAL' : mole.kind]} alt="" draggable={false} />
                <img className="mole-shade" src={SPRITES[mole.kind]} alt="" draggable={false} />
                {mole.kind === 'RAPID' && !view.caught && taps(mole) > 0
                  && <img className="mole-scuff" src={SPRITES.RAPID} alt="" draggable={false} style={{ opacity: Math.min(0.78, taps(mole) * 0.2) }} />}
                {mole.kind === 'RAPID' && !view.caught && taps(mole) > 0 && <svg className="mole-cracks" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
                  {CRACKS.slice(0, taps(mole)).map(d => <g key={d}><path className="glint" d={d} /><path d={d} /></g>)}
                  {taps(mole) >= 1 && <ellipse cx="55" cy="14" rx="10" ry="6" />}
                  {taps(mole) >= 2 && <ellipse cx="30" cy="30" rx="11" ry="7" />}
                  {taps(mole) >= 3 && <ellipse cx="70" cy="24" rx="11" ry="7" />}
                  {taps(mole) >= 4 && <ellipse cx="50" cy="44" rx="12" ry="7.5" />}
                </svg>}
              </span>
              {mole.kind === 'RAPID' && !view.caught && <b className="mole-helmet-count" key={taps(mole)}>{mole.hits - taps(mole)}</b>}
            </span>}
          </span>
          <img className="mole-hole-front" src={ART.hole} alt="" draggable={false} />
          {view.pose === 'bonk' && <span className="mole-stars" aria-hidden="true"><i /><i /><i /></span>}
          {view.pose === 'bonk' && mole?.kind === 'RAPID' && <span className="mole-helmet-fly" aria-hidden="true"><img src={SPRITES.RAPID} alt="" /></span>}
          {impacts.filter(i => i.hole === hole && now - i.at < IMPACT_MS).map(i => <span key={i.id} className="mole-impact" data-kind={i.kind} aria-hidden="true">
            {i.kind !== 'dust' && SPARKS.map(a => <i key={a} style={{ '--a': `${a}deg` } as CSSProperties} />)}
          </span>)}
          <kbd className="mole-keycap">{KEYS[hole]}</kbd>
          {fx.filter(f => f.hole === hole && now - f.at < FX_MS).map(f =>
            <span key={f.id} className="mole-fx" data-tone={f.tone} aria-hidden="true">{f.text}</span>)}
        </button>
      })}
      {/* 친 구멍 위에 망치가 나타나 내리치고 사라진다. 구멍 사이를 날아다니지 않는다. */}
      {swings.filter(s => now - s.at < SWING_MS && !(stunLeft > 0 && s.hole === dizzyHole)).map(s =>
        <div key={s.id} className="mole-mallet-anchor" style={HOLES[s.hole]} aria-hidden="true">
          <img className="mole-mallet" src={ART.mallet} alt="" draggable={false} data-swing />
        </div>)}
      {/* 기절하면 기절시킨 구멍 위에서 망치가 비틀거린다. */}
      {stunLeft > 0 && dizzyHole !== null && <div className="mole-mallet-anchor" style={HOLES[dizzyHole]} aria-hidden="true">
        <img className="mole-mallet" src={ART.mallet} alt="" draggable={false} data-dizzy />
        <span className="mole-dizzy"><i /><i /><i /></span>
      </div>}
      {stunLeft > 0 && <div className="mole-stun" style={STUN} role="status">
        <b>기절! {(stunLeft / 1000).toFixed(1)}초</b><i style={{ width: `${stunLeft / STUN_MS * 100}%` }} />
      </div>}
      <footer className="mole-base" style={BASE}>
        {playing || phase === 'countdown'
          ? <p className="mole-base-status">콤보 {combo} · 최고 {live?.maxCombo ?? 0} · 잡은 두더지 {live?.caught ?? 0}</p>
          : <div className="mole-base-status" role="status">
            <p>왼손 <kbd>S</kbd><kbd>D</kbd><kbd>F</kbd> · 오른손 <kbd>J</kbd><kbd>K</kbd><kbd>L</kbd> · 클릭도 돼요 · 헬멧은 숫자만큼 연타 · 고슴도치는 피하기 · 빈 구멍은 2초 기절</p>
            {error ? <p className="mole-error" role="alert">{error}</p>
              : <p>참가비 없음 · {state?.rules.pointsPerCoin ?? POINTS_PER_COIN}점당 1냥 · 오늘 미니게임 {todayEarned}/{dailyCap}냥 · 최고 {state?.bestScore ?? 0}점</p>}
          </div>}
        <button type="button" className="mole-start" disabled={phase !== 'idle' && phase !== 'result'} onClick={() => void startMole()}>
          {phase === 'starting' ? '준비 중…' : phase === 'result' ? '다시 하기' : 'START'}</button>
      </footer>
      {phase === 'countdown' && <div className="mole-countdown" aria-live="assertive"><b key={countdown}>{countdown}</b></div>}
    </div>

    {phase === 'idle' && <MoleStartGuide name="두더지 잡기" headline="튀어나오면, 망치로 쾅!"
      description={<>다양한 두더지를 잡고 콤보를 이어가요.<br />헬멧 두더지는 연타, 고슴도치는 피해 주세요.</>}
      seconds={rules.durationMs / 1000} keyGroups={[KEYS.slice(0,3),KEYS.slice(3)]}
      details={<><p>{rules.pointsPerCoin}점당 1냥 · 오늘 미니게임 {todayEarned}/{dailyCap}냥</p><p>빈 구멍을 치면 2초 기절해요.</p></>}
      error={error} onStart={() => void startMole()} onClose={closeMole} onManual={() => openManual('whack-a-mole')}
      extra={<button type="button" onClick={() => setRankingsOpen(true)}><SpeedMoleTrophy />내 최고 기록 · 전체 랭킹</button>} />}
    {phase !== 'idle' && <div className="mole-corner">
      <button type="button" className="mole-ghost" onClick={() => openManual('whack-a-mole')}>설명서</button>
      <button type="button" className="mole-close" aria-label="게임기 닫기" onClick={() => playing ? setConfirmQuit(true) : closeMole()}
        disabled={phase === 'submitting'}>×</button>
    </div>}
    {phase === 'submitting' && <div className="mole-overlay" role="status"><p>점수를 확인하고 있어요…</p></div>}
    {confirmQuit && playing && <div className="mole-overlay" role="alertdialog" aria-label="그만하기 확인">
      <div className="mole-card"><h3>그만할까요?</h3><p>이번 판은 보상 없이 끝나요.</p>
        <div className="mole-actions"><button type="button" onClick={() => setConfirmQuit(false)}>계속하기</button>
          <button type="button" className="mole-danger" onClick={closeMole}>그만하기</button></div></div>
    </div>}
    {phase === 'result' && <div className="mole-overlay" role="status" aria-live="polite">
      <div className="mole-card">
        {settlement ? <>
          <h3>{settlement.result.score.toLocaleString('ko-KR')}점</h3>
          <dl className="mole-stats">
            <div><dt>최고 콤보</dt><dd>{settlement.result.maxCombo}</dd></div>
            <div><dt>잡은 두더지</dt><dd>{settlement.result.caught}</dd></div>
            <div><dt>최고 점수</dt><dd>{settlement.bestScore.toLocaleString('ko-KR')}</dd></div>
          </dl>
          <MoleRankSummary refreshKey={settlement.result.id} onOpen={() => setRankingsOpen(true)} />
          <p className="mole-reward">
            {settlement.result.reward > 0
              ? <RewardCoinSource receipt={`mole:reward:${settlement.result.id}`} amount={settlement.result.reward} soundOnReveal>
                +{settlement.result.reward}냥</RewardCoinSource>
              : '+0냥'}
          </p>
          {settlement.result.reward < settlement.result.calculatedReward && <p className="mole-note">
            오늘 미니게임 상한 {settlement.dailyCap}냥에 닿아 {settlement.result.calculatedReward}냥 중 {settlement.result.reward}냥만 받았어요.</p>}
          <p className="mole-note">오늘 미니게임 {settlement.todayEarned}/{settlement.dailyCap}냥</p>
        </> : <><h3>결과를 확인하지 못했어요</h3><p className="mole-error" role="alert">{error}</p></>}
        <div className="mole-actions">
          <button type="button" className="mole-primary" onClick={() => void startMole()}>다시 하기</button>
          <button type="button" onClick={closeMole}>닫기</button>
        </div>
      </div>
    </div>}
    {rankingsOpen && <MoleRankingDialog onClose={() => setRankingsOpen(false)} />}
  </div>
}
