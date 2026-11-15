import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { useSession } from '../../network/worldClient'
import { PaperPopup } from '../tableLobby/PaperPopup'
import { refreshWalletAfterSettlement } from '../wallet/settlementRefresh'
import { cards, height, rounds, roundSeconds, spotDifference, targetsPerRound, width,
  type Budget, type Difficulty, type Position, type Round } from './api'
import { closeSpotDifference } from './store'
import './spotDifference.css'

const aim = { x: width / 2, y: height / 2 }
const koreanNumber = new Intl.NumberFormat('ko-KR')
const messages = { HIT: '명중! · 표적 하나 완료', MISS: '빗나갔어요. 잠시 후 다시 조준하세요.',
  WAIT: '잠시 후 다시 조준하세요.', ALREADY_FOUND: '이미 찾은 곳이에요.' }
const initialBudget = 1000
const totalTargets = rounds * targetsPerRound
const targetSlots = Array.from({ length: targetsPerRound }, (_, index) => index)
const urgentMs = 10_000
type BoardSide = 'original' | 'comparison'
type Shot = Position & { number: number; side: BoardSide; kind: 'hit' | 'miss' | 'pending' }

function positionStyle({ x, y }: Position): CSSProperties {
  return { left: `${x / width * 100}%`, top: `${y / height * 100}%` }
}

function Board({ view, variant, fire, shot }: {
  view: Round; variant: 'original' | 'normal' | 'hard'; fire: (point: Position, side: BoardSide) => void
  shot: Shot | null
}) {
  const [cursor, setCursor] = useState(aim)
  const [showCursor, setShowCursor] = useState(false)
  const side = variant === 'original' ? 'original' : 'comparison'
  const label = side === 'original' ? '원본' : '비교 그림'
  const playing = view.phase === 'PLAYING'
  const review = view.phase === 'REVIEW'
  const markers = review ? view.answers : view.matched
  const impact = shot && (shot.kind === 'hit' || shot.side === side) ? shot : null

  function move(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? 48 : 16
    const deltas: Record<string, Position> = {
      ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step },
      ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 },
    }
    const delta = deltas[event.key]
    if (!delta || !playing) return
    event.preventDefault()
    event.stopPropagation()
    setShowCursor(true)
    setCursor(point => ({
      x: Math.max(0, Math.min(width - 1, point.x + delta.x)),
      y: Math.max(0, Math.min(height - 1, point.y + delta.y)),
    }))
  }

  return <div className="spot-board">
    <span className="spot-board-label">{label}</span>
    <button className="spot-target" type="button" aria-label={`${label}. 방향키로 조준하고 Enter로 선택`}
      disabled={!playing} onKeyDown={move} onBlur={() => setShowCursor(false)}
      onClick={event => {
        if (!event.detail) { fire(cursor, side); return }
        const rect = event.currentTarget.getBoundingClientRect()
        fire({
          x: Math.max(0, Math.min(width - 1, Math.floor((event.clientX - rect.left) / rect.width * width))),
          y: Math.max(0, Math.min(height - 1, Math.floor((event.clientY - rect.top) / rect.height * height))),
        }, side)
      }}>
      <img src={sceneImage(view.scene, variant)} alt="" draggable={false} />
      {markers.map(({ label: answer, box: [x, y, right, bottom] }, index) => <span className="spot-marker"
        key={answer} data-hit={view.matched.some(match => match.box[0] === x && match.box[1] === y)}
        style={{ ...positionStyle({ x: (x + right) / 2, y: (y + bottom) / 2 }),
          width: `${(right - x) / width * 100}%`, height: `${(bottom - y) / height * 100}%` }} aria-hidden>
        {review && <span className="spot-marker-number">{index + 1}</span>}
      </span>)}
      {playing && showCursor && <span className="spot-reticle" style={positionStyle(cursor)} aria-hidden>+</span>}
      {impact && <span key={`${impact.number}:${impact.kind}`} className="spot-shot" data-result={impact.kind}
        style={positionStyle(impact)} aria-hidden />}
    </button>
  </div>
}

function sceneImage(scene: string, variant: 'original' | 'normal' | 'hard') {
  return `/art/spot-difference/${scene}-${variant}.webp`
}

function RoundHud({ view, remaining, urgent }: { view: Round; remaining: number; urgent: boolean }) {
  const seconds = view.phase === 'WAITING' ? roundSeconds : Math.ceil(remaining / 1000)
  const timeRatio = view.phase === 'WAITING' ? 1 : Math.min(1, remaining / (roundSeconds * 1000))
  const left = targetsPerRound - view.matched.length

  return <div className="spot-hud">
    <div className="spot-hud-round">
      <strong>장면 {String(view.round).padStart(2, '0')} / {String(rounds).padStart(2, '0')}</strong>
      <span className="spot-difficulty" data-difficulty={view.difficulty}>{cards[view.difficulty].label}</span>
    </div>
    <div className="spot-hud-time">
      <span><span aria-live="polite">{urgent ? '시간 임박' : '남은 시간'}</span> <strong className="spot-clock">{seconds}초</strong></span>
      <div className="spot-timer" role="progressbar" aria-label="남은 시간" aria-valuemax={roundSeconds}
        aria-valuenow={seconds} aria-valuetext={`${seconds}초`}>
        <span style={{ width: `${timeRatio * 100}%` }} />
      </div>
    </div>
    <div className="spot-hud-targets">
      <span aria-live="polite">남은 차이 <strong>{left}개</strong></span>
      <div className="spot-targets" aria-hidden>
        {targetSlots.map(index => <span key={index} data-used={index >= left} />)}
      </div>
    </div>
  </div>
}

export function SpotDifferencePanel() {
  const [budget, setBudget] = useState<Budget>()
  const [budgetError, setBudgetError] = useState(false)
  const [view, setView] = useState<Round>()
  const [busy, setBusy] = useState(false)
  const [remaining, setRemaining] = useState(0)
  const [shot, setShot] = useState<Shot | null>(null)
  const [error, setError] = useState('')
  const [assetsLoaded, setAssetsLoaded] = useState('')
  const [assetRetry, setAssetRetry] = useState(0)
  const pending = useRef(false)
  const retry = useRef<(() => Promise<Round>) | null>(null)
  const shotNumber = useRef(0)
  const deadline = useRef(0)
  const scene = view?.scene
  const difficulty = view?.difficulty
  const loadedKey = scene && difficulty ? `${scene}:${difficulty}:${assetRetry}` : ''

  useEffect(() => {
    const abort = new AbortController()
    void spotDifference.status(abort.signal).then(setBudget, () => {
      if (!abort.signal.aborted) setBudgetError(true)
    })
    return () => abort.abort()
  }, [])

  useEffect(() => {
    if (!scene || !difficulty) return
    let current = true
    const images = [sceneImage(scene, 'original'), sceneImage(scene, difficulty === 'NORMAL' ? 'normal' : 'hard')]
    void Promise.all(images.map(src => {
      const image = new Image()
      image.src = src
      return image.decode()
    })).then(() => { if (current) setAssetsLoaded(loadedKey) }, () => {
      if (current) setError('그림을 불러오지 못했어요.')
    })
    return () => { current = false }
  }, [scene, difficulty, loadedKey])

  async function submit(request: () => Promise<Round>) {
    if (pending.current) return
    const owner = useSession.getState().sessionId
    pending.current = true
    retry.current = request
    setBusy(true)
    setError('')
    try {
      const next = await request()
      if (useSession.getState().sessionId !== owner) return
      if (next.receipt?.granted) refreshWalletAfterSettlement(owner, `spot-difference:reward:${next.id}`)
      retry.current = null
      deadline.current = performance.now() + next.remainingMs
      setRemaining(next.remainingMs)
      setView(next)
      if (next.receipt) setBudget({ todayEarned: next.receipt.todayEarned, dailyCap: initialBudget })
      setShot(previous => previous && (next.tap === 'HIT' || next.tap === 'MISS')
        ? { ...previous, kind: next.tap === 'HIT' ? 'hit' : 'miss' } : null)
    } catch (failure) {
      setShot(null)
      if (failure && typeof failure === 'object' && 'status' in failure && failure.status === 410) {
        setView(undefined)
        retry.current = null
        setError('판이 끝났어요. 난이도를 골라 다시 시작해 주세요.')
      } else {
        setError('서버 응답을 확인하지 못했어요. 다시 시도해 주세요.')
      }
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!view || view.phase !== 'PLAYING') return
    const tick = () => {
      const timeLeft = Math.max(0, deadline.current - performance.now())
      setRemaining(timeLeft)
      if (timeLeft === 0 && !pending.current && !error) void submit(() => spotDifference.act(view, 'SYNC'))
    }
    const interval = window.setInterval(tick, 100)
    return () => window.clearInterval(interval)
  }, [view, error])

  useEffect(() => {
    if (!shot || shot.kind === 'pending') return
    const timeout = window.setTimeout(() => setShot(null), 650)
    return () => window.clearTimeout(timeout)
  }, [shot])

  function begin(choice: Difficulty) {
    const requestId = crypto.randomUUID()
    void submit(() => spotDifference.start(choice, requestId))
  }

  function fire(point: Position, side: BoardSide) {
    if (!view || view.phase !== 'PLAYING' || pending.current || error) return
    setShot({ ...point, side, number: ++shotNumber.current, kind: 'pending' })
    void submit(() => spotDifference.act(view, 'TAP', point))
  }

  const loaded = loadedKey && loadedKey === assetsLoaded
  const receipt = view?.receipt
  const todayEarned = budget?.todayEarned
  const dailyCap = budget?.dailyCap ?? initialBudget

  const waiting = view?.phase === 'WAITING'
  const reviewing = view?.phase === 'REVIEW'
  const urgent = view?.phase === 'PLAYING' && remaining <= urgentMs
  const feedback = reviewing ? '녹색은 찾은 곳, 금색은 놓친 곳이에요.'
    : view?.tap ? messages[view.tap] : `다른 곳을 눌러 ${targetsPerRound}개를 찾으세요.`

  return <PaperPopup title="사격정" label="스피드 틀린 그림 찾기" closeLabel={view ? '나가기' : '사격정 닫기'}
    className={`spot-difference${view ? ' spot-playing' : ''}${urgent ? ' spot-urgent' : ''}`} onClose={closeSpotDifference}>
    <header className="spot-heading">
      <h2><span className="spot-emblem" aria-hidden />스피드 틀린 그림 찾기</h2>
      {view && <span className="spot-venue">사격정</span>}
    </header>
    {!view && <>
      <div className="spot-entry">
        <div className="spot-entry-art"><img src={sceneImage('range-counter', 'original')} alt="" /></div>
        <div className="spot-entry-info">
          <h3>난이도 선택</h3>
          <p className="spot-description">무작위 {rounds}장 · 장면당 {roundSeconds}초<br />각 그림에서 다른 곳 {targetsPerRound}개를 찾으세요.</p>
          <div className="spot-cards" aria-label="난이도 카드">
            {(Object.keys(cards) as Difficulty[]).map(choice => {
              const card = cards[choice]
              return <button type="button" key={choice} className="spot-card" data-difficulty={choice}
                disabled={busy} onClick={() => begin(choice)}>
                <span><strong>{card.label}</strong><small>{card.detail}</small></span>
                <span className="spot-card-coin">최대 <b>{card.reward * totalTargets}냥</b></span>
              </button>
            })}
          </div>
        </div>
      </div>
      <div className="spot-entry-budget">
        <strong>오늘 미니게임 보상 {todayEarned === undefined
          ? (budgetError ? '조회 실패' : '조회 중') : `${koreanNumber.format(todayEarned)}냥`}
          {' / '}{koreanNumber.format(dailyCap)}냥</strong>
        <small>완주하면 남은 한도까지 지급됩니다.</small>
      </div>
    </>}
    {view && <>
      <RoundHud view={view} remaining={remaining} urgent={urgent} />
      {waiting ? <div className="spot-ready"><span className="spot-emblem" aria-hidden />
        <strong>{view.name}</strong>
      </div> : <div className="spot-boards" key={view.scene} aria-label={view.name}>
        <Board view={view} variant="original" shot={shot} fire={fire} />
        <Board view={view} variant={view.difficulty === 'NORMAL' ? 'normal' : 'hard'} shot={shot} fire={fire} />
      </div>}
      <div className="spot-footer">
        <span className="spot-feedback" data-tap={reviewing ? undefined : view.tap ?? undefined} role="status">
          {waiting ? '' : feedback}
        </span>
        <span className="spot-total">누적 <strong>{view.total} / {totalTargets}</strong></span>
        <div className="spot-footer-action">
          {!receipt && (waiting
            ? <button type="button" className="spot-primary" disabled={!loaded || busy || !!error}
              onClick={() => void submit(() => spotDifference.act(view, 'READY'))}>
              {loaded ? '그림 열고 시작' : '그림 불러오는 중'}
            </button>
            : <button type="button" className="spot-primary" disabled={!reviewing || busy || !!error}
              onClick={() => void submit(() => spotDifference.act(view, 'NEXT'))}>
              {view.round === rounds ? '마지막 장면' : '다음 장면'}
            </button>)}
        </div>
      </div>
      {receipt && <>
        <section className="paper-settlement" aria-label="엽전 정산" role="status">
          <strong>지급 {receipt.granted}냥</strong>
          <small>정답 {view.total}/{totalTargets} · 이번 판 보상 {receipt.calculated}냥</small>
          <small>오늘 미니게임 합계 {koreanNumber.format(receipt.todayEarned)} / {koreanNumber.format(dailyCap)}냥</small>
          {receipt.granted < receipt.calculated && <small>오늘 남은 한도만큼 지급했어요.</small>}
        </section>
        <div className="spot-actions">
          <button type="button" onClick={() => { setView(undefined); setShot(null) }}>다시 난이도 고르기</button>
          <button type="button" className="spot-primary" onClick={closeSpotDifference}>공원으로 돌아가기</button>
        </div>
      </>}
    </>}
    {error && <div className="paper-error" role="alert">
      <p>{error}</p>
      {(retry.current || (view?.phase === 'WAITING' && !loaded)) &&
        <button type="button" disabled={busy} onClick={() => {
          if (retry.current) void submit(retry.current)
          else { setError(''); setAssetRetry(count => count + 1) }
        }}>다시 시도</button>}
    </div>}
  </PaperPopup>
}
