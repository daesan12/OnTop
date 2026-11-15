import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { useSession } from '../../network/worldClient'
import { PaperPopup } from '../tableLobby/PaperPopup'
import { refreshWalletAfterSettlement } from '../wallet/settlementRefresh'
import { cards, height, rounds, spotDifference, width, type Budget, type Difficulty, type Position, type Round } from './api'
import { closeSpotDifference } from './store'
import './spotDifference.css'

const aim = { x: width / 2, y: height / 2 }
const koreanNumber = new Intl.NumberFormat('ko-KR')
const messages = { HIT: '명중!', MISS: '빗나갔어요.', WAIT: '잠시 후 다시 조준해 주세요.', ALREADY_FOUND: '이미 찾은 곳이에요.' }
const initialBudget = 1000

function positionStyle({ x, y }: Position): CSSProperties {
  return { left: `${x / width * 100}%`, top: `${y / height * 100}%` }
}

function Board({ view, variant, fire, shot }: {
  view: Round; variant: 'original' | 'normal' | 'hard'; fire: (point: Position) => void
  shot: (Position & { number: number; kind: 'hit' | 'miss' | 'pending' }) | null
}) {
  const [cursor, setCursor] = useState(aim)
  const [showCursor, setShowCursor] = useState(false)
  const label = variant === 'original' ? '기준 그림' : '비교 그림'
  const playing = view.phase === 'PLAYING'
  const review = view.phase === 'REVIEW'
  const markers = review ? view.answers : view.matched

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
    <span>{label}</span>
    <button className="spot-target" type="button" aria-label={`${label}. 방향키로 조준하고 Enter로 선택`}
      disabled={!playing} onKeyDown={move} onBlur={() => setShowCursor(false)}
      onClick={event => {
        if (!event.detail) { fire(cursor); return }
        const rect = event.currentTarget.getBoundingClientRect()
        fire({
          x: Math.max(0, Math.min(width - 1, Math.floor((event.clientX - rect.left) / rect.width * width))),
          y: Math.max(0, Math.min(height - 1, Math.floor((event.clientY - rect.top) / rect.height * height))),
        })
      }}>
      <img src={sceneImage(view.scene, variant)} alt="" draggable={false} />
      {markers.map(({ label: answer, box: [x, y, right, bottom] }) => <span className="spot-marker"
        key={answer} data-hit={view.matched.some(match => match.box[0] === x && match.box[1] === y)}
        style={{ ...positionStyle({ x: (x + right) / 2, y: (y + bottom) / 2 }),
          width: `${(right - x) / width * 100}%`, height: `${(bottom - y) / height * 100}%` }} aria-hidden />)}
      {playing && showCursor && <span className="spot-reticle" style={positionStyle(cursor)} aria-hidden>+</span>}
      {shot && <span key={shot.number} className="spot-shot" data-result={shot.kind} style={positionStyle(shot)} aria-hidden />}
    </button>
  </div>
}

function sceneImage(scene: string, variant: 'original' | 'normal' | 'hard') {
  return `/art/spot-difference/${scene}-${variant}.webp`
}

export function SpotDifferencePanel() {
  const [budget, setBudget] = useState<Budget>()
  const [budgetError, setBudgetError] = useState(false)
  const [view, setView] = useState<Round>()
  const [busy, setBusy] = useState(false)
  const [remaining, setRemaining] = useState(0)
  const [shot, setShot] = useState<(Position & { number: number; kind: 'hit' | 'miss' | 'pending' }) | null>(null)
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
    if (!view || view.phase !== 'PLAYING' || busy || error) return
    const tick = () => {
      const timeLeft = Math.max(0, deadline.current - performance.now())
      setRemaining(timeLeft)
      if (timeLeft === 0) void submit(() => spotDifference.act(view, 'SYNC'))
    }
    const interval = window.setInterval(tick, 100)
    return () => window.clearInterval(interval)
  }, [view, busy, error])

  function begin(choice: Difficulty) {
    const requestId = crypto.randomUUID()
    void submit(() => spotDifference.start(choice, requestId))
  }

  function fire(point: Position) {
    if (!view || view.phase !== 'PLAYING' || pending.current || error) return
    setShot({ ...point, number: ++shotNumber.current, kind: 'pending' })
    void submit(() => spotDifference.act(view, 'TAP', point))
  }

  const loaded = loadedKey && loadedKey === assetsLoaded
  const receipt = view?.receipt
  const todayEarned = budget?.todayEarned
  const dailyCap = budget?.dailyCap ?? initialBudget

  return <PaperPopup title="사격정" label="스피드 틀린 그림 찾기" closeLabel="사격정 닫기"
    className={`spot-difference${view ? ' spot-playing' : ''}`} onClose={closeSpotDifference}>
    <h2>스피드 틀린 그림 찾기</h2>
    {!view && <>
      <p className="spot-description">난이도 카드를 골라 시작하세요. 그림마다 30초 안에 다른 곳 6개를 찾으세요.</p>
      <div className="spot-cards" aria-label="난이도 카드">
        {(Object.keys(cards) as Difficulty[]).map(choice => {
          const card = cards[choice]
          return <button type="button" key={choice} className="spot-card" data-difficulty={choice}
            disabled={busy} onClick={() => begin(choice)}>
            <img className="spot-card-art" src={sceneImage(card.art, 'original')} alt="" />
            <strong>{card.label}</strong>
            <span>{card.detail}</span>
            <span className="spot-card-coin">정답당 {card.reward}냥 · 최대 {card.reward * rounds * 6}냥</span>
          </button>
        })}
      </div>
      <p className="spot-budget">오늘 미니게임 보상 {todayEarned === undefined
        ? (budgetError ? '조회 실패' : '조회 중') : `${koreanNumber.format(todayEarned)}냥`}
        {' / '}{koreanNumber.format(dailyCap)}냥</p>
      <p className="spot-note">무작위 6장 완주 시 오늘 남은 한도까지 지급됩니다. 한도는 매일 한국 시간 자정에 갱신됩니다.</p>
    </>}
    {view && <>
      <div className="spot-hud">
        <strong>{cards[view.difficulty].label} · {view.round}/{rounds}장 · {view.name}</strong>
        <span>이번 장 {view.matched.length}/6 · 총 {view.total}/36</span>
        <span className="spot-clock">{view.phase === 'PLAYING' ? `${Math.ceil(remaining / 1000)}초` : ''}</span>
      </div>
      {view.phase === 'WAITING' ? <div className="spot-ready">
        <button type="button" className="paper-primary" disabled={!loaded || busy || !!error}
          onClick={() => void submit(() => spotDifference.act(view, 'READY'))}>
          {loaded ? '그림 열고 시작' : '그림 불러오는 중'}
        </button>
      </div> : <div className="spot-boards" key={view.scene}>
        <Board view={view} variant="original" shot={shot} fire={fire} />
        <Board view={view} variant={view.difficulty === 'NORMAL' ? 'normal' : 'hard'} shot={shot} fire={fire} />
      </div>}
      {view.phase === 'PLAYING' && <div className="spot-feedback" role="status">
        {view.tap ? messages[view.tap] : '두 그림에서 다른 부분을 눌러 명중시키세요.'}
      </div>}
      {view.phase === 'REVIEW' && <>
        <p className="spot-note">찾은 곳은 녹색, 놓친 곳은 금색으로 표시됩니다.</p>
        {receipt ? <>
          <section className="paper-settlement" aria-label="엽전 정산" role="status">
            <strong>지급 {receipt.granted}냥</strong>
            <small>정답 {view.total}/36 · 이번 판 보상 {receipt.calculated}냥</small>
            <small>오늘 미니게임 합계 {koreanNumber.format(receipt.todayEarned)} / {koreanNumber.format(dailyCap)}냥</small>
            {receipt.granted < receipt.calculated && <small>오늘 남은 한도만큼 지급했어요.</small>}
          </section>
          <div className="spot-actions">
            <button type="button" onClick={() => { setView(undefined); setShot(null) }}>다시 난이도 고르기</button>
            <button type="button" className="paper-primary" onClick={closeSpotDifference}>공원으로 돌아가기</button>
          </div>
        </> : <button type="button" className="paper-primary" disabled={busy || !!error}
          onClick={() => void submit(() => spotDifference.act(view, 'NEXT'))}>다음 그림</button>}
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
