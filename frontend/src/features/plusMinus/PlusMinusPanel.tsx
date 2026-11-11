import { useEffect, useRef, useState } from 'react'
import { playSfx } from '../../audio/sfx'
import { openManual } from '../manual/manualState'
import { RewardCoinSource } from '../wallet/RewardCoinFlight'
import { DAILY_PLAYS, FEE, FIRST_REEL, JACKPOT, OPERATOR_REEL, operatorLabel, reelLabel, SECOND_REEL, type PlusMinusRound } from './protocol'
import { resultLine, statusLine } from './presentation'
import { ReelFace, type Celebration, type ReelView } from './ReelFace'
import { AUTO_STOP_MS, landingCell, landingTimeline, spinningCell } from './reels'
import { closePlusMinus, finishPlusMinusReveal, startPlusMinus, usePlusMinus } from './store'
import './plusMinus.css'

const STOP_LABELS = ['1번 정지', '2번 정지', '3번 정지'] as const
const COUNT_UP_MS = 1200
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const cellsOf = (round: PlusMinusRound) => [round.firstCell, round.operatorCell, round.secondCell] as const
const valuesOf = (round: PlusMinusRound) => [String(round.first), operatorLabel(round.operator), reelLabel(round.second)] as const

interface Spin {
  id: string; startedAt: number; activeSince: number; stopped: number
  landing: { reel: number; startedAt: number; timeline: ReturnType<typeof landingTimeline> } | null
}

export function PlusMinusPanel() {
  const open = usePlusMinus(s => s.open)
  return open ? <PlusMinusDialog /> : null
}

function PlusMinusDialog() {
  const { data, busy, error, revealing } = usePlusMinus()
  const dialog = useRef<HTMLDialogElement>(null)
  const round = data?.round ?? null
  const reelsOf = [data?.rules.firstReel ?? FIRST_REEL, data?.rules.operatorReel ?? OPERATOR_REEL, data?.rules.secondReel ?? SECOND_REEL] as const
  const [now, setNow] = useState(() => performance.now())
  const [spin, setSpin] = useState<Spin | null>(null)
  // 이 창에서 방금 공개한 판. 창을 다시 열어 보는 지난 판은 연출하지 않는다.
  const [celebrated, setCelebrated] = useState<string | null>(null)

  useEffect(() => {
    const el = dialog.current
    el?.showModal()
    return () => el?.close()
  }, [])

  // 방금 START한 판만 돌린다. 창을 연 시점에 이미 있던 판은 멈춘 결과만 보여 준다.
  const live = !!round && revealing === round.id
  useEffect(() => {
    if (!live) { setSpin(null); return }
    setSpin(current => current?.id === round!.id ? current : { id: round!.id, startedAt: performance.now(),
      activeSince: performance.now(), stopped: 0, landing: null })
  }, [live, round])

  useEffect(() => {
    if (!spin) return
    const timer = setInterval(() => setNow(performance.now()), 28)
    return () => clearInterval(timer)
  }, [spin])

  const stopReel = (reel: number) => setSpin(current => {
    if (!current || current.landing || current.stopped !== reel || !round || round.id !== current.id) return current
    const at = performance.now(), cells = reelsOf[reel]!.length
    if (reducedMotion()) return { ...current, stopped: reel + 1, activeSince: at }
    const from = spinningCell(reel, cells, at - current.startedAt)
    return { ...current, landing: { reel, startedAt: at, timeline: landingTimeline(from, cellsOf(round)[reel]!, cells) } }
  })

  // 미끄러짐이 끝나면 다음 버튼을 켜고, 켜진 버튼을 5초 동안 누르지 않으면 대신 멈춘다.
  useEffect(() => {
    if (!spin) return
    if (spin.landing && now - spin.landing.startedAt >= spin.landing.timeline.duration) {
      setSpin({ ...spin, stopped: spin.stopped + 1, activeSince: now, landing: null })
    } else if (!spin.landing && spin.stopped < 3 && now - spin.activeSince >= AUTO_STOP_MS) {
      stopReel(spin.stopped)
    }
  })
  const allStopped = !!spin && spin.stopped >= 3
  useEffect(() => { if (allStopped) { setCelebrated(spin!.id); finishPlusMinusReveal() } }, [allStopped])

  const reels = [0, 1, 2].map((i): ReelView => {
    const cells = reelsOf[i]!.length
    if (spin && round && spin.id === round.id && spin.stopped <= i) {
      const lit = spin.landing?.reel === i ? landingCell(spin.landing.timeline, cells, now - spin.landing.startedAt)
        : spinningCell(i, cells, now - spin.startedAt)
      return { lit, value: null }
    }
    return round ? { lit: cellsOf(round)[i]!, value: valuesOf(round)[i]! } : { lit: null, value: null }
  }) as [ReelView, ReelView, ReelView]

  const spinning = live ? 3 - (spin?.stopped ?? 0) : 0
  const shown = !!round && !live
  const playsLeft = (data?.rules.dailyPlays ?? DAILY_PLAYS) - (data?.playedToday ?? 0)
  const fee = data?.rules.fee ?? FEE
  const canStart = !live && !busy && playsLeft > 0 && !!data
  const activeStop = live && spin && !spin.landing ? spin.stopped : -1
  const balance = data ? data.availableBalance - (live ? round!.payout : 0) : null
  const celebrate: Celebration = shown && celebrated === round.id
    ? round.outcome === 'JACKPOT' ? 'jackpot' : round.second === JACKPOT ? 'miss' : null : null
  const ledPayout = useCountUp(shown ? round.payout : 0, celebrate === 'jackpot' && !reducedMotion())
  const message = statusLine({ round: shown ? round : null, busy, error, spinning, playsLeft })

  // 누른 버튼이 잠기면 포커스가 창 밖으로 빠지므로 창이 열린 동안의 키 입력을 문서에서 받는다.
  // 공원 단축키는 열린 dialog 때문에 panelOwnsKeys()로 이미 막혀 있다.
  const keys = useRef({ activeStop, canStart, stopReel })
  keys.current = { activeStop, canStart, stopReel }
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat || document.querySelectorAll('dialog[open]').length > 1) return
      const index = ['1', '2', '3'].indexOf(event.key)
      // 키로 누른 버튼도 클릭과 같은 오락기 버튼 소리를 낸다.
      if (index >= 0 && index === keys.current.activeStop) { event.preventDefault(); playSfx('arcade-button'); keys.current.stopReel(index) }
      else if (event.key === 'Enter' && keys.current.canStart
        && !(event.target instanceof HTMLElement && event.target.closest('button,input,select,textarea'))) {
        event.preventDefault(); playSfx('arcade-button'); startPlusMinus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return <dialog ref={dialog} className="plus-minus" aria-labelledby="plus-minus-title"
    onCancel={event => { event.preventDefault(); closePlusMinus() }}>
    <header className="plus-minus-top">
      <h2 id="plus-minus-title">더하기 빼기 아케이드</h2>
      <button type="button" className="plus-minus-ghost" onClick={() => openManual('plus-minus')}>설명서</button>
      <button type="button" className="plus-minus-close" aria-label="게임기 닫기" onClick={closePlusMinus}>×</button>
    </header>
    <div className="plus-minus-content" tabIndex={0} aria-label="더하기 빼기 게임기 내용">
      <div className="plus-minus-cabinet">
        <div className="plus-minus-board">
          {['tl', 'tr', 'bl', 'br'].map(corner => <span key={corner} className="plus-minus-screw" data-corner={corner} aria-hidden="true" />)}
          <ReelFace firstReel={reelsOf[0]} operatorReel={reelsOf[1]} secondReel={reelsOf[2]} reels={reels}
            plays={`${Math.max(0, playsLeft)}/${data?.rules.dailyPlays ?? DAILY_PLAYS}`}
            balance={balance === null ? '-' : `${balance.toLocaleString('ko-KR')}냥`}
            payout={String(Math.min(999, ledPayout)).padStart(3, '0')} active={activeStop} celebrate={celebrate} />
          <div className="plus-minus-stops">
            {STOP_LABELS.map((label, i) => <div key={label} className="plus-minus-control" data-reel={i}>
              <span className="plus-minus-bezel" data-lit={activeStop === i || undefined}>
                <button type="button" className="plus-minus-cap plus-minus-stop" disabled={activeStop !== i}
                  aria-label={`${label} · ${['숫자1', '더하기 빼기', '숫자2'][i]}`} onClick={() => stopReel(i)} />
              </span>
              <span className="plus-minus-label">{label}</span>
            </div>)}
          </div>
        </div>
        <div className="plus-minus-led" aria-label="계산식과 안내">
          <strong className="plus-minus-formula" data-outcome={shown ? round.outcome : undefined}>
            {shown ? resultLine(round) : live ? `${reels.map(r => r.value ?? '?').join(' ')} = ?` : '? + ? = ?'}
          </strong>
          <p className="plus-minus-lcd" role="status" aria-live="polite">{message}</p>
          {shown && round.payout > 0 &&
            <p className="plus-minus-payout">
              <RewardCoinSource receipt={`plus-minus:payout:${round.id}`} amount={round.payout} soundOnReveal={celebrated === round.id}>
                +{round.payout.toLocaleString('ko-KR')}냥
              </RewardCoinSource>
            </p>}
        </div>
        <div className="plus-minus-body">
          <div className="plus-minus-plate">
            <span className="plus-minus-bezel plus-minus-bezel-start" data-lit={canStart || undefined}>
              <button type="button" className="plus-minus-cap plus-minus-start" disabled={!canStart}
                onClick={startPlusMinus}>START</button>
            </span>
            <span className="plus-minus-slot" aria-hidden="true" />
            <span className="plus-minus-plate-label">{playsLeft > 0 ? `${fee}냥 넣고 시작` : '오늘 판 소진'}</span>
          </div>
        </div>
      </div>
      <p className="plus-minus-foot">결과는 START를 누를 때 정해져요. 정지 버튼은 멈추는 순간을 고르는 재미예요.</p>
    </div>
  </dialog>
}

/** 잭팟 연출 동안 가운데 위 LED를 0부터 목표 금액까지 올린다. */
function useCountUp(target: number, run: boolean) {
  const [value, setValue] = useState<number | null>(null)
  useEffect(() => {
    if (!run) { setValue(null); return }
    const started = performance.now()
    let frame = requestAnimationFrame(function tick(at) {
      const t = Math.min(1, Math.max(0, at - started) / COUNT_UP_MS)
      setValue(Math.round(target * t))
      if (t < 1) frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [target, run])
  return run ? value ?? 0 : target
}
