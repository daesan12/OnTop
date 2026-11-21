import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { useSession } from '../../network/worldClient'
import { PaperPopup } from '../tableLobby/PaperPopup'
import { refreshWalletAfterSettlement } from '../wallet/settlementRefresh'
import { cards, height, rounds, roundSeconds, spotDifference, targetsPerRound, width,
  type Budget, type Difficulty, type DuelRoom, type Position, type Round } from './api'
import { closeSpotDifference } from './store'
import './spotDifference.css'

const aim = { x: width / 2, y: height / 2 }
const koreanNumber = new Intl.NumberFormat('ko-KR')
const messages = { HIT: '명중! · 표적 하나 완료', MISS: '빗나갔어요. 1초 동안 선택할 수 없어요.',
  WAIT: '잠시 후 다시 조준하세요.', ALREADY_FOUND: '이미 찾은 곳이에요.' }
const initialBudget = 1000
const totalTargets = rounds * targetsPerRound
const targetSlots = Array.from({ length: targetsPerRound }, (_, index) => index)
const roundIntroMs = 700
const urgentMs = 10_000
const duelSyncMs = 500
type Mode = 'SOLO' | 'DUEL'
type BoardSide = 'original' | 'comparison'
type Shot = Position & { number: number; side: BoardSide; kind: 'hit' | 'miss' | 'pending' }

function positionStyle({ x, y }: Position): CSSProperties {
  return { left: `${x / width * 100}%`, top: `${y / height * 100}%` }
}

function Board({ view, variant, fire, shot, showImage, locked }: {
  view: Round; variant: 'original' | 'normal' | 'hard'; fire: (point: Position, side: BoardSide) => void
  shot: Shot | null
  showImage: boolean
  locked: boolean
}) {
  const [cursor, setCursor] = useState(aim)
  const [showCursor, setShowCursor] = useState(false)
  const side = variant === 'original' ? 'original' : 'comparison'
  const label = side === 'original' ? '원본' : '비교 그림'
  const playing = view.phase === 'PLAYING' && !view.duel?.end
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
      disabled={!playing} aria-disabled={locked || undefined} onKeyDown={move} onBlur={() => setShowCursor(false)}
      onClick={event => {
        if (locked) return
        if (!event.detail) { fire(cursor, side); return }
        const rect = event.currentTarget.getBoundingClientRect()
        fire({
          x: Math.max(0, Math.min(width - 1, Math.floor((event.clientX - rect.left) / rect.width * width))),
          y: Math.max(0, Math.min(height - 1, Math.floor((event.clientY - rect.top) / rect.height * height))),
        }, side)
      }}>
      {showImage && <img src={sceneImage(view.scene, variant)} alt="" draggable={false} />}
      {markers.map(({ box: [x, y, right, bottom] }, index) => {
        const hit = view.matched.some(match => match.box[0] === x && match.box[1] === y)
        const opponent = view.duel?.opponentMatches.some(match => match.box[0] === x && match.box[1] === y)
        return <span className="spot-marker" key={`${x}:${y}`} data-hit={hit} data-opponent={opponent}
          style={{ ...positionStyle({ x: (x + right) / 2, y: (y + bottom) / 2 }),
            width: `${(right - x) / width * 100}%`, height: `${(bottom - y) / height * 100}%` }} aria-hidden>
          {view.duel && hit
            ? <span className="spot-marker-number">{opponent ? '상대' : '나'}</span>
            : review && <span className="spot-marker-number">{index + 1}</span>}
        </span>
      })}
      {playing && showCursor && <span className="spot-reticle" style={positionStyle(cursor)} aria-hidden>+</span>}
      {impact?.kind === 'miss' && <span key={impact.number} className="spot-miss-frame" aria-hidden />}
      {impact && <span key={`${impact.number}:${impact.kind}`} className="spot-shot" data-result={impact.kind}
        style={positionStyle(impact)} aria-hidden />}
    </button>
  </div>
}

function sceneImage(scene: string, variant: 'original' | 'normal' | 'hard') {
  return `/art/spot-difference/${scene}-${variant}.webp`
}

function RoundHud({ view, remaining, urgent }: { view: Round; remaining: number; urgent: boolean }) {
  const waiting = view.phase === 'WAITING'
  const displayedMs = waiting ? roundSeconds * 1000 : remaining
  const seconds = Math.ceil(displayedMs / 1000)
  const timeRatio = Math.min(1, displayedMs / (roundSeconds * 1000))
  const left = targetsPerRound - view.matched.length

  return <div className="spot-hud">
    <div className="spot-hud-round">
      <strong>장면 {String(view.round).padStart(2, '0')} / {String(rounds).padStart(2, '0')}</strong>
      <span className="spot-difficulty" data-difficulty={view.difficulty}>{cards[view.difficulty].label}</span>
    </div>
    <div className="spot-hud-time">
      <span><span aria-live="polite">{urgent ? '시간 임박' : '남은 시간'}</span> <strong className="spot-clock">{seconds}초</strong></span>
      <div className="spot-timer" role="progressbar" aria-label="남은 시간" aria-valuemax={roundSeconds}
        aria-valuenow={seconds} aria-valuetext={waiting ? `시작 대기 · ${seconds}초` : `${seconds}초`}>
        <span style={{ width: `${timeRatio * 100}%` }} />
      </div>
    </div>
    <div className="spot-hud-targets">
      <span aria-live="polite">남은 차이 <strong>{left}개</strong></span>
      <div className="spot-targets" aria-hidden>
        {targetSlots.map(index => <span key={index} data-used={index >= left} />)}
      </div>
      {view.duel && <span className="spot-duel-score" aria-live="polite">
        나 <strong>{view.total}점</strong> · 상대 <strong>{view.duel.opponentTotal}점</strong>
      </span>}
    </div>
  </div>
}

export function SpotDifferencePanel() {
  const [mode, setMode] = useState<Mode>()
  const [roomTitle, setRoomTitle] = useState('')
  const [rooms, setRooms] = useState<DuelRoom[]>([])
  const [roomsLoading, setRoomsLoading] = useState(false)
  const [roomsError, setRoomsError] = useState(false)
  const [roomsRevision, setRoomsRevision] = useState(0)
  const [syncWarning, setSyncWarning] = useState(false)
  const [budget, setBudget] = useState<Budget>()
  const [budgetError, setBudgetError] = useState(false)
  const [view, setView] = useState<Round>()
  const [busy, setBusy] = useState(false)
  const [remaining, setRemaining] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(0)
  const [shot, setShot] = useState<Shot | null>(null)
  const [error, setError] = useState('')
  const [assetsLoaded, setAssetsLoaded] = useState('')
  const [assetRetry, setAssetRetry] = useState(0)
  const pending = useRef(false)
  const requestVersion = useRef(0)
  const currentView = useRef<Round | undefined>(undefined)
  const retry = useRef<(() => Promise<Round | null>) | null>(null)
  const shotNumber = useRef(0)
  const deadline = useRef(0)
  const entryHeading = useRef<HTMLHeadingElement>(null)
  const scene = view?.scene
  const difficulty = view?.difficulty
  const roundId = view?.id
  const roundNumber = view?.round
  const inDuel = !!view?.duel
  const joined = view?.duel?.joined ?? false
  const ready = view?.duel?.ready ?? false
  const ended = !!view?.duel?.end
  const waiting = view?.phase === 'WAITING'
  const playing = view?.phase === 'PLAYING' && !ended
  const loadedKey = scene && difficulty ? `${scene}:${difficulty}:${assetRetry}` : ''
  const loaded = loadedKey !== '' && loadedKey === assetsLoaded

  useEffect(() => {
    if (!view) entryHeading.current?.focus()
  }, [mode, view])

  useEffect(() => {
    if (mode !== 'DUEL' || view) return
    const abort = new AbortController()
    const owner = useSession.getState().sessionId
    let timeout: number
    setRoomsLoading(true)
    async function load() {
      try {
        const next = await spotDifference.rooms(abort.signal)
        if (!abort.signal.aborted && owner === useSession.getState().sessionId) {
          setRooms(next)
          setRoomsError(false)
        }
      } catch {
        if (!abort.signal.aborted) setRoomsError(true)
      } finally {
        if (!abort.signal.aborted) {
          setRoomsLoading(false)
          timeout = window.setTimeout(load, 3000)
        }
      }
    }
    void load()
    return () => { abort.abort(); window.clearTimeout(timeout) }
  }, [mode, view, roomsRevision])

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

  const apply = useCallback((next: Round, background = false) => {
    const previous = currentView.current
    const now = performance.now()
    if (background && previous?.id === next.id && previous.round === next.round && next.phase === 'PLAYING') {
      next = { ...next, tap: previous.tap }
    }
    currentView.current = next
    deadline.current = now + next.remainingMs
    setRemaining(next.remainingMs)
    setLockedUntil(next.cooldownMs > 0 ? now + next.cooldownMs : 0)
    setView(next)
    if (previous?.round !== next.round) setShot(null)
  }, [])

  const submit = useCallback(async (request: () => Promise<Round | null>) => {
    if (pending.current) return
    const owner = useSession.getState().sessionId
    requestVersion.current++
    pending.current = true
    retry.current = request
    setBusy(true)
    setError('')
    try {
      const next = await request()
      if (useSession.getState().sessionId !== owner) return
      retry.current = null
      if (!next) return
      if (next.duel) setMode('DUEL')
      if (next.receipt?.granted) refreshWalletAfterSettlement(owner, `spot-difference:reward:${next.id}`)
      apply(next)
      if (next.receipt) setBudget({ todayEarned: next.receipt.todayEarned, dailyCap: initialBudget })
      setShot(previous => previous && (next.tap === 'HIT' || next.tap === 'MISS')
        ? { ...previous, kind: next.tap === 'HIT' ? 'hit' : 'miss' } : null)
      return true
    } catch (failure) {
      setShot(null)
      const status = failure && typeof failure === 'object' && 'status' in failure ? failure.status : undefined
      if (status === 410 && currentView.current) {
        currentView.current = undefined
        setView(undefined)
        retry.current = null
        setError('판이 끝났어요. 난이도를 골라 다시 시작해 주세요.')
      } else if (status === 410 || status === 409) {
        retry.current = null
        setError(status === 410 ? '대결 방이 닫혔어요. 목록에서 다른 방을 선택해 주세요.' : '이미 찬 방이거나 참가 중인 방이 있어요.')
        setRoomsRevision(value => value + 1)
      } else {
        setError('서버 응답을 확인하지 못했어요. 다시 시도해 주세요.')
      }
    } finally {
      pending.current = false
      setBusy(false)
    }
  }, [apply])

  useEffect(() => {
    const abort = new AbortController()
    const owner = useSession.getState().sessionId
    const version = requestVersion.current
    void spotDifference.currentDuel(abort.signal).then(next => {
      if (next && !abort.signal.aborted && version === requestVersion.current &&
        useSession.getState().sessionId === owner) {
        setMode('DUEL')
        apply(next)
      }
    }, () => {
      // Choosing a mode remains available when there is no current match to restore.
    })
    return () => abort.abort()
  }, [apply])

  useEffect(() => {
    if (!roundId || !roundNumber || !waiting || !loaded || busy || error || ended || (inDuel && (!joined || ready))) return
    const round = { id: roundId, round: roundNumber }
    const timeout = window.setTimeout(() => void submit(() => inDuel
      ? spotDifference.actDuel(round, 'READY')
      : spotDifference.act(round, 'READY')), inDuel ? 0 : roundIntroMs)
    return () => window.clearTimeout(timeout)
  }, [roundId, roundNumber, waiting, loaded, busy, error, ended, inDuel, joined, ready, submit])

  useEffect(() => {
    if (!roundId || !inDuel || ended) return
    let disposed = false
    const owner = useSession.getState().sessionId
    let timeout: number
    async function sync() {
      const version = requestVersion.current
      const current = currentView.current
      if (!pending.current && current && current.id === roundId) {
        try {
          const next = await spotDifference.actDuel(current, 'SYNC')
          if (!disposed && version === requestVersion.current && useSession.getState().sessionId === owner) {
            setSyncWarning(false)
            apply(next, true)
          }
        } catch (failure) {
          if (!disposed && version === requestVersion.current && useSession.getState().sessionId === owner) {
            if (failure && typeof failure === 'object' && 'status' in failure && failure.status === 410) {
              currentView.current = undefined
              setView(undefined)
              setError('대결 방이 만료됐어요.')
              return
            }
            setSyncWarning(true)
          }
        }
      }
      const startIn = currentView.current?.duel?.startInMs
      const delay = startIn == null ? duelSyncMs : Math.min(duelSyncMs, Math.max(20, startIn))
      if (!disposed) timeout = window.setTimeout(sync, delay)
    }
    timeout = window.setTimeout(sync, duelSyncMs)
    return () => { disposed = true; window.clearTimeout(timeout) }
  }, [roundId, inDuel, ended, apply])

  useEffect(() => {
    if (!roundId || !roundNumber || !playing) return
    const round = { id: roundId, round: roundNumber }
    const tick = () => {
      const timeLeft = Math.max(0, deadline.current - performance.now())
      setRemaining(timeLeft)
      if (!inDuel && timeLeft === 0 && !pending.current && !error) void submit(() => spotDifference.act(round, 'SYNC'))
    }
    const interval = window.setInterval(tick, 100)
    return () => window.clearInterval(interval)
  }, [roundId, roundNumber, playing, inDuel, error, submit])

  useEffect(() => {
    if (!lockedUntil) return
    const timeout = window.setTimeout(() => setLockedUntil(0), Math.ceil(lockedUntil - performance.now()))
    return () => window.clearTimeout(timeout)
  }, [lockedUntil])

  useEffect(() => {
    if (!shot || shot.kind === 'pending') return
    const timeout = window.setTimeout(() => setShot(null), shot.kind === 'miss' ? 1000 : 650)
    return () => window.clearTimeout(timeout)
  }, [shot])

  function begin(choice: Difficulty) {
    if (mode === 'DUEL') {
      void submit(() => spotDifference.createDuel(choice, roomTitle.trim()))
    } else {
      const requestId = crypto.randomUUID()
      void submit(() => spotDifference.start(choice, requestId))
    }
  }

  function fire(point: Position, side: BoardSide) {
    if (!view || !loaded || view.phase !== 'PLAYING' || ended || pending.current || lockedUntil > performance.now() ||
      remaining <= 0 || error) return
    setShot({ ...point, side, number: ++shotNumber.current, kind: 'pending' })
    const actionId = inDuel ? crypto.randomUUID() : undefined
    void submit(() => inDuel ? spotDifference.actDuel(view, 'TAP', point, actionId) : spotDifference.act(view, 'TAP', point))
  }

  function reset() {
    requestVersion.current++
    currentView.current = undefined
    setView(undefined)
    setShot(null)
    setLockedUntil(0)
    setSyncWarning(false)
  }

  function close() {
    if (view?.duel) {
      void submit(async () => {
        const left = await spotDifference.actDuel(view, 'LEAVE')
        closeSpotDifference()
        return left
      })
      return
    }
    closeSpotDifference()
  }

  const receipt = view?.receipt
  const todayEarned = budget?.todayEarned
  const dailyCap = budget?.dailyCap ?? initialBudget

  const reviewing = view?.phase === 'REVIEW'
  const urgent = playing && remaining <= urgentMs
  const score = view?.duel
  const showBoards = view && (!score || score.joined)
  const result = score?.outcome === 'WIN' ? '승리' : score?.outcome === 'LOSS' ? '패배' : '무승부'
  const feedback = reviewing ? inDuel ? '금색 번호는 두 사람이 놓친 곳이에요.' : '녹색은 찾은 곳, 금색은 놓친 곳이에요.'
    : view?.tap ? messages[view.tap] : `다른 곳을 눌러 ${targetsPerRound}개를 찾으세요.`

  return <PaperPopup title="사격장" label="스피드 틀린 그림 찾기" closeLabel={view ? '나가기' : '사격장 닫기'}
    className={`spot-difference${view ? ' spot-playing' : ''}${urgent ? ' spot-urgent' : ''}`}
    initialFocusRef={entryHeading} onClose={close} closeDisabled={busy && inDuel}>
    <header className="spot-heading">
      <h2><span className="spot-emblem" aria-hidden />스피드 틀린 그림 찾기</h2>
      {view && <span className="spot-venue">사격장</span>}
    </header>
    {!view && !mode && <div className="spot-entry">
        <div className="spot-entry-art"><img src={sceneImage('range-counter', 'original')} alt="" /></div>
        <div className="spot-entry-info">
          <h3 ref={entryHeading} tabIndex={-1}>게임 방법</h3>
          <ol className="spot-guide-steps">
            <li>매 판 무작위로 나오는 <strong>{rounds}장</strong>에서 각각 다른 곳 <strong>{targetsPerRound}개</strong>를 찾으세요. 장면당 <strong>{roundSeconds}초</strong>예요.</li>
            <li>원본이나 비교 그림에서 다른 부분을 누르세요. 빗나가면 1초 동안 선택할 수 없어요.</li>
            <li>2인 대결에서는 같은 장면을 보고 다른 곳을 먼저 찾은 사람이 점수를 얻어요. 동점이면 같은 점수에 먼저 도달한 사람이 이겨요.</li>
          </ol>
          <p className="spot-guide-keys">키보드는 <kbd>방향키</kbd>로 조준하고 <kbd>Enter</kbd>로 선택해요.</p>
          <div className="spot-actions">
            <button type="button" className="spot-primary" onClick={() => { requestVersion.current++; setMode('SOLO') }}>
              혼자 플레이
            </button>
            <button type="button" className="spot-primary" onClick={() => setMode('DUEL')}>멀티플레이</button>
          </div>
        </div>
      </div>
    }
    {!view && mode && <div className="spot-picker">
      <h3 ref={entryHeading} tabIndex={-1}>{mode === 'DUEL' ? '멀티플레이 · 방 목록' : '혼자 플레이 · 난이도 선택'}</h3>
      {mode === 'DUEL' && <section className="spot-rooms" aria-label="참가 가능한 방">
        <div className="spot-room-heading">
          <h4>참가 가능한 방</h4>
          <button type="button" className="spot-guide-back" disabled={busy || roomsLoading}
            onClick={() => setRoomsRevision(value => value + 1)}>새로고침</button>
        </div>
        {roomsLoading && <p role="status">방 목록을 불러오는 중이에요.</p>}
        {roomsError && <p role="status">방 목록을 불러오지 못했어요. 새로고침해 주세요.</p>}
        {!roomsLoading && !roomsError && rooms.length === 0 && <p>대기 중인 방이 없어요. 아래에서 새 방을 만들어 보세요.</p>}
        {!roomsError && rooms.map(room => <div className="spot-room" key={room.id}>
          <div><strong>{room.title}</strong><span>{cards[room.difficulty].label} · {room.players}/{room.capacity}명</span></div>
          <button type="button" className="spot-primary" disabled={busy}
            onClick={() => void submit(() => spotDifference.joinDuel(room.id))}>참가하기</button>
        </div>)}
        <label className="spot-room-title">새 방 이름
          <input value={roomTitle} maxLength={40} placeholder="함께 틀린 그림 찾아요"
            onChange={event => setRoomTitle(event.target.value)} disabled={busy} />
        </label>
        <p>난이도를 선택하면 공개 방을 만들어요.</p>
      </section>}
      <div className="spot-cards" role="group" aria-label="난이도 카드">
        {(Object.keys(cards) as Difficulty[]).map(choice => {
          const card = cards[choice]
          return <button type="button" key={choice} className="spot-card" data-difficulty={choice}
            disabled={busy} onClick={() => begin(choice)}>
            <img className="spot-card-preview" src={sceneImage(card.previewScene, 'original')} alt="" />
            <span className="spot-card-info">
              <span className="spot-card-title">{card.label}</span>
              <span className="spot-card-detail">{card.detail}</span>
              {mode === 'SOLO' && <span className="spot-card-rewards">
                <span>정답당 <strong>{card.reward}냥</strong></span>
                <span>최대 {card.reward * totalTargets}냥</span>
              </span>}
            </span>
          </button>
        })}
      </div>
      {mode === 'SOLO' && <div className="spot-entry-budget">
        <strong>오늘 미니게임 보상 {todayEarned === undefined
          ? (budgetError ? '조회 실패' : '조회 중') : `${koreanNumber.format(todayEarned)}냥`}
          {' / '}{koreanNumber.format(dailyCap)}냥</strong>
      </div>}
      <button type="button" className="spot-guide-back" disabled={busy} onClick={() => {
        retry.current = null
        setError('')
        setMode(undefined)
      }}><span aria-hidden>←</span> 게임 방법 다시 보기</button>
    </div>}
    {view && score && !score.joined && !ended && <div className="spot-picker">
      <h3>상대를 기다리는 중</h3>
      <p>공원에 있는 다른 사람이 사격장 → 멀티플레이의 방 목록에서 참가할 수 있어요.</p>
      <p>두 사람이 입장하고 그림 준비가 끝나면 자동으로 시작해요.</p>
    </div>}
    {showBoards && <>
      <RoundHud view={view} remaining={remaining} urgent={urgent} />
      <div className="spot-boards" key={view.scene} aria-label={view.name}>
        <Board view={view} variant="original" shot={shot} fire={fire} locked={!!lockedUntil}
          showImage={loaded && (!waiting || !inDuel)} />
        <Board view={view} variant={view.difficulty === 'NORMAL' ? 'normal' : 'hard'} shot={shot} fire={fire}
          locked={!!lockedUntil} showImage={loaded && (!waiting || !inDuel)} />
        {!loaded && !error && <div className="spot-loading" role="status">
          <span>그림을 불러오는 중이에요.</span>
        </div>}
      </div>
      <div className="spot-footer" data-duel={inDuel}>
        <span className="spot-feedback" data-tap={reviewing ? undefined : view.tap ?? undefined} role="status">
          {waiting ? loaded ? (inDuel ? '두 사람이 준비되면 시작해요.' : '잠시 후 시작해요.') : '\u00a0' : feedback}
        </span>
        {!inDuel && <>
          <span className="spot-total">누적 <strong>{view.total} / {totalTargets}</strong></span>
          <div className="spot-footer-action">
            {!receipt && <button type="button" className="spot-primary" disabled={!reviewing || busy || !!error}
              onClick={() => void submit(() => spotDifference.act(view, 'NEXT'))}>
              {view.round === rounds ? '마지막 장면' : '다음 장면'}
            </button>}
          </div>
        </>}
      </div>
      {receipt && <>
        <section className="paper-settlement" aria-label="엽전 정산" role="status">
          <strong>지급 {receipt.granted}냥</strong>
          <small>정답 {view.total}/{totalTargets} · 이번 판 보상 {receipt.calculated}냥</small>
          <small>오늘 미니게임 합계 {koreanNumber.format(receipt.todayEarned)} / {koreanNumber.format(dailyCap)}냥</small>
          {receipt.granted < receipt.calculated && <small>오늘 남은 한도만큼 지급했어요.</small>}
        </section>
        <div className="spot-actions">
          <button type="button" onClick={reset}>다시 난이도 고르기</button>
          <button type="button" className="spot-primary" onClick={closeSpotDifference}>공원으로 돌아가기</button>
        </div>
      </>}
    </>}
    {view && score?.end && <div className="spot-picker">
      <section className="paper-settlement" aria-label="대결 결과" role="status">
        <strong>{score.joined ? result : '대결이 종료됐어요.'}</strong>
        {score.joined && <small>나 {view.total}점 · 상대 {score.opponentTotal}점</small>}
        {score.end === 'LEFT' && score.joined && <small>한 참가자가 대결에서 나갔어요.</small>}
        {score.end === 'DISCONNECTED' && <small>접속이 끊겨 대결이 종료됐어요.</small>}
      </section>
      <div className="spot-actions">
        <button type="button" onClick={() => void submit(async () => {
          await spotDifference.actDuel(view, 'LEAVE')
          reset()
          return null
        })}>다시 플레이</button>
        <button type="button" className="spot-primary" onClick={close}>공원으로 돌아가기</button>
      </div>
    </div>}
    {syncWarning && <p className="paper-error" role="status">서버와 다시 연결하는 중이에요.</p>}
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
