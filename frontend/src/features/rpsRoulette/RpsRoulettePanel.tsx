import { useEffect, useRef, useState } from 'react'
import { openManual } from '../manual/manualState'
import { RewardCoinSource } from '../wallet/RewardCoinFlight'
import { HANDS, HAND_LABEL, type Hand, type LedShape } from './ledHands'
import { DAILY_PLAYS, FEES, payoutRange, ROULETTE } from './protocol'
import { statusLine } from './presentation'
import { HandIcon, RouletteFace } from './RouletteFace'
import {
  challengeRpsRound, closeRpsRoulette, playRpsHand, refreshRpsRoulette, selectRpsFee, serverNowMs, startRpsRound,
  stopRpsRound, useRpsRoulette,
} from './store'
import './rpsRoulette.css'

const REVEAL_MS = 1100
const SHUFFLE_MS = 90
/** 최소 두 바퀴 돈 뒤 마지막 12칸에서 느려진다. */
function chaseTimeline(cell: number, cells: number) {
  const steps = cells * 2 + cell, times: number[] = []
  let at = 0
  for (let i = 0; i <= steps; i++) { times.push(at); at += 28 + Math.max(0, i - (steps - 12)) * 24 }
  return { steps, times, duration: at }
}
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
// 창을 다시 열거나 같은 응답을 다시 받아도 공개·룰렛 연출을 반복하지 않는다.
const shownDuels = new Map<string, number>()
const spunRounds = new Set<string>()

export function RpsRoulettePanel() {
  const open = useRpsRoulette(s => s.open)
  return open ? <RpsRouletteDialog /> : null
}

function RpsRouletteDialog() {
  const { data, busy, pressed, error, fee } = useRpsRoulette()
  const dialog = useRef<HTMLDialogElement>(null)
  const round = data?.round ?? null
  const roulette = data?.rules.roulette ?? ROULETTE
  const [now, setNow] = useState(() => performance.now())
  const [reveal, setReveal] = useState<{ key: string; until: number } | null>(null)
  const [spin, setSpin] = useState<{ id: string; cell: number; startedAt: number } | null>(null)
  const firstData = useRef(true)

  useEffect(() => {
    const el = dialog.current
    el?.showModal()
    return () => el?.close()
  }, [])

  // 새로 공개된 손과 새로 정산된 판만 연출한다. 창을 연 시점에 이미 있던 판은 결과만 보여준다.
  useEffect(() => {
    if (!round) return
    const duelNo = round.lastDuel?.duelNo ?? 0
    const initial = firstData.current
    firstData.current = false
    if (initial || reducedMotion()) {
      shownDuels.set(round.id, Math.max(shownDuels.get(round.id) ?? 0, duelNo))
      if (round.outcome === 'PAID') spunRounds.add(round.id)
      if (initial) return
    }
    if (duelNo > (shownDuels.get(round.id) ?? 0)) {
      shownDuels.set(round.id, duelNo)
      setReveal({ key: `${round.id}:${duelNo}`, until: performance.now() + REVEAL_MS })
    }
    if (round.outcome === 'PAID' && round.rouletteCell !== null && !spunRounds.has(round.id)) {
      spunRounds.add(round.id)
      setSpin({ id: round.id, cell: round.rouletteCell, startedAt: performance.now() + (duelNo ? REVEAL_MS : 0) })
    }
  }, [round])

  // 매 프레임이 아니라 손 섞기·룰렛 한 칸 단위로만 다시 그린다.
  const ticking = !!round && round.phase !== 'SETTLED' || !!reveal || !!spin
  const fast = !!spin
  useEffect(() => {
    if (!ticking) return
    const timer = setInterval(() => setNow(performance.now()), fast ? 28 : SHUFFLE_MS)
    return () => clearInterval(timer)
  }, [ticking, fast])

  const revealing = !!reveal && now < reveal.until
  const timeline = spin ? chaseTimeline(spin.cell, roulette.length) : null
  const spinElapsed = spin ? now - spin.startedAt : 0
  const spinning = !!spin && !!timeline && spinElapsed < timeline.duration
  useEffect(() => { if (reveal && !revealing) setReveal(null) }, [reveal, revealing])
  useEffect(() => { if (spin && timeline && !spinning && spinElapsed >= timeline.duration) setSpin(null) },
    [spin, timeline, spinning, spinElapsed])

  const serverNow = serverNowMs(useRpsRoulette.getState(), now)
  const inputEnds = round?.inputEndsAt ? Date.parse(round.inputEndsAt) : 0
  const deadline = round?.deadlineAt ? Date.parse(round.deadlineAt) : 0
  const live = !!round && round.phase !== 'SETTLED'
  const limitMs = round?.phase === 'DECIDE' ? data!.rules.decideLimitMs : data?.rules.duelLimitMs ?? 5000
  const left = live ? Math.max(0, inputEnds - serverNow) : 0
  const timeUp = live && !revealing && left <= 0
  // 표시 마감 뒤 서버 유예 시간이 지나면 서버가 대신 처리한 결과를 다시 읽는다.
  const refreshFor = live && timeUp && serverNow > deadline + 300 ? `${round!.id}:${round!.seq}` : ''
  const refreshed = useRef('')
  useEffect(() => {
    if (!refreshFor || refreshed.current === refreshFor) return
    refreshed.current = refreshFor
    void refreshRpsRoulette()
  }, [refreshFor])

  const playsLeft = (data?.rules.dailyPlays ?? DAILY_PLAYS) - (data?.playedToday ?? 0)
  const idle = !live && !spinning && !revealing
  const inputOpen = live && !revealing && !busy && serverNow < deadline
  const canHand = inputOpen && round!.phase === 'DUEL'
  const canDecide = inputOpen && round!.phase === 'DECIDE'
  const canStart = idle && !busy && playsLeft > 0 && !!data

  const duel = round?.lastDuel ?? null
  const shuffled: Hand = HANDS[Math.floor(now / SHUFFLE_MS) % 3]
  const led: LedShape = round?.phase === 'DUEL' && !revealing ? shuffled : duel?.machineHand ?? 'COIN'
  const showDuel = !!duel && (revealing || round?.phase !== 'DUEL')
  const settledVisible = round?.phase === 'SETTLED' && !revealing && !spinning
  const chaseStep = spin && timeline && spinElapsed >= 0
    ? timeline.times.reduce((found, t, i) => t <= spinElapsed ? i : found, -1) : -1
  const litCell = spinning ? (chaseStep < 0 ? null : chaseStep % roulette.length)
    : round?.outcome === 'PAID' && settledVisible ? round.rouletteCell : null
  const lamps = {
    win: showDuel && duel!.result === 'WIN' && !(round?.phase === 'SETTLED' && round.outcome === 'LOST'),
    draw: showDuel && revealing && duel!.result === 'DRAW',
    lose: showDuel && duel!.result === 'LOSE',
    jackpot: settledVisible && (round?.rouletteValue ?? 0) >= 7,
  }
  const multiplierText = round?.phase === 'SETTLED' && round.outcome === 'LOST' && settledVisible && round.challenging
    ? '꽝' : `×${(round && round.phase !== 'SETTLED' || settledVisible ? round?.multiplier ?? 1 : 1).toFixed(1)}`
  const level = round && (live || settledVisible) ? round.stakeLevel : -1
  const range = round ? payoutRange(round.fee, round.multiplier) : null
  const message = statusLine({ round, busy, error, revealing, spinning, timeUp, playsLeft })

  // 누른 버튼이 잠기면 포커스가 창 밖으로 빠지므로 창이 열린 동안의 키 입력을 문서에서 받는다.
  // 공원 단축키는 열린 dialog 때문에 panelOwnsKeys()로 이미 막혀 있다.
  const keys = useRef({ canHand, canStart })
  keys.current = { canHand, canStart }
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat || document.querySelectorAll('dialog[open]').length > 1) return
      const index = ['1', '2', '3'].indexOf(event.key)
      if (index >= 0 && keys.current.canHand) { event.preventDefault(); playRpsHand(HANDS[index]) }
      else if (event.key === 'Enter' && keys.current.canStart
        && !(event.target instanceof HTMLElement && event.target.closest('button,input,select,textarea'))) {
        event.preventDefault(); void startRpsRound()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return <dialog ref={dialog} className="rps-roulette" aria-labelledby="rps-roulette-title"
    onCancel={event => { event.preventDefault(); closeRpsRoulette() }}>
    <header className="rps-roulette-top">
      <h2 id="rps-roulette-title">가위바위보 룰렛</h2>
      <button type="button" className="rps-roulette-ghost" onClick={() => openManual('rps-roulette')}>설명서</button>
      <button type="button" className="rps-roulette-close" aria-label="게임기 닫기" onClick={closeRpsRoulette}>×</button>
    </header>
    <div className="rps-roulette-content" tabIndex={0} aria-label="가위바위보 게임기 내용">
    <div className="rps-roulette-cabinet">
      <RouletteFace roulette={roulette} litCell={litCell} led={led} lamps={lamps}
        machineHand={showDuel ? duel!.machineHand : null} />
      <div className="rps-roulette-led" aria-label="배수와 남은 시간">
        <div className="rps-roulette-led-row">
          <span className="rps-roulette-led-label">배수</span>
          <strong className="rps-roulette-mult">{multiplierText}</strong>
          <ol className="rps-roulette-steps" aria-label="도전 단계">
            {['기본 1.0', '1차 1.5', '2차 2.0'].map((label, i) =>
              <li key={label} data-on={level >= i || undefined} data-next={round?.challenging && live && i === level + 1 || undefined}>
                <i aria-hidden="true" />{label}
              </li>)}
          </ol>
          <span className="rps-roulette-plays">판 {Math.max(0, playsLeft)}/{data?.rules.dailyPlays ?? DAILY_PLAYS}</span>
        </div>
        <div className="rps-roulette-led-row">
          <span className="rps-roulette-led-label">시간</span>
          <span className="rps-roulette-ticks" aria-hidden="true">
            {Array.from({ length: 10 }, (_, i) =>
              <i key={i} data-on={live && !revealing && i < Math.ceil(left / limitMs * 10) || undefined}
                data-warn={left <= 2000 || undefined} />)}
          </span>
          <span className="rps-roulette-sec">{live && !revealing ? Math.ceil(left / 1000) : '-'}</span>
        </div>
        <p className="rps-roulette-lcd" role="status" aria-live="polite">{message}</p>
        {settledVisible && round.outcome === 'PAID' && round.payout > 0 &&
          <p className="rps-roulette-payout">
            <RewardCoinSource receipt={`rps-roulette:payout:${round.id}`} amount={round.payout} soundOnReveal>
              +{round.payout.toLocaleString('ko-KR')}냥
            </RewardCoinSource>
            <small>보유 {data!.availableBalance.toLocaleString('ko-KR')}냥</small>
          </p>}
      </div>
      <div className="rps-roulette-deck">
        <div className="rps-roulette-hands">
          {HANDS.map((hand, i) => <div key={hand} className="rps-roulette-control">
            <span className="rps-roulette-bezel" data-lit={canHand || undefined}>
              <button type="button" className="rps-roulette-cap rps-roulette-hand" disabled={!canHand}
                data-pressed={pressed === hand || undefined} aria-label={`${HAND_LABEL[hand]} 내기`}
                onClick={() => playRpsHand(hand)}>
                <HandIcon hand={hand} color={canHand ? '#d6332a' : '#8a5a5a'} />
              </button>
            </span>
            <span className="rps-roulette-label">{HAND_LABEL[hand]} · {i + 1}</span>
          </div>)}
        </div>
        <div className="rps-roulette-lower">
          <div className="rps-roulette-control">
            <div className="rps-roulette-fees" role="group" aria-label="참가비">
              {FEES.map(value => <button key={value} type="button" className="rps-roulette-fee" aria-pressed={fee === value}
                disabled={!idle || !!busy} onClick={() => selectRpsFee(value)}>{value}</button>)}
            </div>
            <span className="rps-roulette-label">참가비 (냥)</span>
          </div>
          <div className="rps-roulette-control">
            <span className="rps-roulette-bezel rps-roulette-bezel-start" data-lit={canStart || undefined}>
              <button type="button" className="rps-roulette-cap rps-roulette-start" disabled={!canStart}
                onClick={() => void startRpsRound()}>START</button>
            </span>
            <span className="rps-roulette-label">{playsLeft > 0 ? `${fee}냥 넣고 시작` : '오늘 판 소진'}</span>
          </div>
          <div className="rps-roulette-control">
            <span className="rps-roulette-bezel" data-lit={canDecide && (round?.stakeLevel ?? 2) < 2 || undefined}>
              <button type="button" className="rps-roulette-cap rps-roulette-challenge"
                disabled={!canDecide || (round?.stakeLevel ?? 2) >= 2} onClick={challengeRpsRound}>도전</button>
            </span>
            <span className="rps-roulette-label">
              {[1, 2].map(step => <span key={step} data-done={(round?.stakeLevel ?? 0) >= step && live || undefined}
                data-next={canDecide && round!.stakeLevel + 1 === step || undefined}>{step}차 ×{step === 1 ? '1.5' : '2.0'}</span>)}
            </span>
          </div>
          <div className="rps-roulette-control">
            <span className="rps-roulette-bezel" data-lit={canDecide || undefined}>
              <button type="button" className="rps-roulette-cap rps-roulette-stop" disabled={!canDecide} onClick={stopRpsRound}>멈춤</button>
            </span>
            <span className="rps-roulette-label">{canDecide && range ? `${range[0]}~${range[1]}냥` : '룰렛'}</span>
          </div>
        </div>
      </div>
    </div>
    <p className="rps-roulette-foot">손이 공개된 판은 창을 닫아도 서버가 마감에 맞춰 결과를 적용해요.</p>
    </div>
  </dialog>
}
