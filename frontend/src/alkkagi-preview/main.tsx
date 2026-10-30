import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AlkkagiReplay, type Piece, type Snapshot } from '../game/alkkagi/replay'
import { AlkkagiBoard } from '../game/alkkagi/AlkkagiBoard'
import { itemPreview } from '../game/alkkagi/placement'
import { AlkkagiFeedback } from '../game/alkkagi/feedback'
import { AlkkagiInbox } from '../game/alkkagi/inbox'
import { SocialPanel } from './SocialPanel'
import './style.css'

const role = new URLSearchParams(location.search).get('role') ?? 'red'
const actor = role === 'red' ? 0 : role === 'green' ? 1 : -1
const names = ['홍팀', '청팀']
const errorNames: Record<string, string> = {
  GAME_FINISHED: '이미 종료된 경기입니다.', CHAT_RATE_LIMIT: '잠시 후 다시 보내주세요.',
  ADVICE_RATE_LIMIT: '훈수는 잠시 간격을 두고 보내주세요.', INVALID_CHAT: '채팅은 공백을 제외한 1~200자로 입력해주세요.',
  SPECTATOR_REQUIRED: '관전자만 훈수를 보낼 수 있습니다.', INVALID_ADVICE_TARGET: '현재 차례의 살아 있는 알을 골라주세요.',
  NOT_YOUR_TURN: '상대 차례입니다.', NOT_YOUR_PIECE: '내 알을 선택해주세요.',
  NOT_AIMING: '알이 멈춘 후 발사해주세요.', STALE_VERSION: '최신 상태를 확인하고 다시 조준해주세요.',
  STALE_GAME: '새 판으로 변경됐습니다.', PLAYER_REQUIRED: '관전자는 발사할 수 없습니다.',
  STALE_TUNING: '판이 바뀌었습니다. 최신 상태에서 다시 적용해주세요.',
  INVALID_TUNING: '조절 범위를 확인해주세요. 발사 힘 0.5~30 / 감속 0.1~60 / 반발 0~1',
  ITEM_OVERLAP: '다른 알이나 벽과 겹칩니다. 위치를 다시 골라주세요.',
  ITEM_OVERLAP_OR_OUTSIDE: '겹치거나 판 밖인 위치입니다.', RELOCATE_TOO_FAR: '이동 가능 거리를 넘었습니다.',
  WALL_ALREADY_EXISTS: '현재 벽이 사라진 뒤 설치할 수 있습니다.', WALL_LIMIT: '경기당 벽 3회를 모두 사용했습니다.',
  MODIFIER_ACTIVE: '이 알의 기존 크기·방어 효과가 끝난 뒤 사용해주세요.', BOOST_TARGET_REQUIRED: '힘 강화한 알로 발사해주세요.',
  INVALID_ITEM_RULES: '아이템 조절 범위를 확인해주세요.',
  RED_TUNING_ONLY: '홍팀 화면에서 물리값을 조절해주세요.',
}

type Card = { id: string; type: string }
type PrivateState = { gameId: string; version: number; cards: Card[]; awards?: { losses: number; result: string }[] }
const cardNames: Record<string, string> = { SWAP: '내 알 위치 교환', EXTRA_SHOT: '한 번 더 튕기기',
  WALL: '벽 설치', RELOCATE: '알 재배치', POWER_UP: '힘 강화', GROW: '크기 확대', SHRINK: '크기 축소', DEFEND: '방어 자세' }

function App() {
  const replay = useMemo(() => new AlkkagiReplay(), [])
  const feedback = useMemo(() => new AlkkagiFeedback(), [])
  const inbox = useMemo(() => new AlkkagiInbox(), [])
  const previousHand = useRef<PrivateState | null>(null)
  const cursorAt = useRef(0)
  const socket = useRef<WebSocket | null>(null)
  const [state, setState] = useState<Snapshot | null>(null)
  const [connected, setConnected] = useState(false), [notice, setNotice] = useState('서버 연결 중…')
  const [pending, setPending] = useState(false), [now, setNow] = useState(Date.now())
  const [seq, setSeq] = useState(0)
  const [hand, setHand] = useState<PrivateState | null>(null)
  const [item, setItem] = useState<Card | null>(null), [targets, setTargets] = useState<string[]>([])
  const [placement, setPlacement] = useState<{ x: number; y: number; angle: number } | null>(null)
  const [pinned, setPinned] = useState(false), [forfeitOpen, setForfeitOpen] = useState(false)
  const [practice, setPractice] = useState(['SWAP', 'EXTRA_SHOT'])
  const [rules, setRules] = useState({ wallLength: 1.6, wallThickness: .18, wallMargin: .12, relocateDistance: 2,
    powerMultiplier: 1.5, growScale: 1.25, shrinkScale: .8, defendMassMultiplier: 2, effectOpponentTurns: 1 })
  useEffect(() => { if (state?.itemRules) setRules(state.itemRules) }, [state?.gameId])
  const cancelItem = () => { setItem(null); setTargets([]); setPlacement(null); setPinned(false) }
  useEffect(cancelItem, [state?.gameId, state?.version, connected])
  useEffect(() => {
    if (!state) return
    for (const event of feedback.update(state)) window.dispatchEvent(new CustomEvent('alkkagi:feedback', { detail: event }))
    if (state.stage === 'FINISHED') setForfeitOpen(false)
  }, [state, feedback])
  useEffect(() => {
    const cancel = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelItem() }
    window.addEventListener('keydown', cancel)
    return () => window.removeEventListener('keydown', cancel)
  }, [])
  const [tuning, setTuning] = useState({ maximumImpulse: 30, deceleration: 60, restitution: 1 })
  useEffect(() => {
    if (state) setTuning({ maximumImpulse: state.settings.maximumImpulse,
      deceleration: state.settings.deceleration, restitution: state.settings.restitution })
  }, [state?.gameId, state?.settings.maximumImpulse, state?.settings.deceleration, state?.settings.restitution])
  const received = useRef({ wall: Date.now(), mono: performance.now() })
  useEffect(() => {
    let disposed = false, reconnect: ReturnType<typeof setTimeout> | undefined
    const connect = () => {
      const ws = new WebSocket(`ws://127.0.0.1:19183/dev/alkkagi-ws?role=${encodeURIComponent(role)}`)
      socket.current = ws
      ws.onopen = () => { replay.clear(); feedback.reset(); inbox.reset(); previousHand.current = null; setConnected(true); setNotice('알을 누른 채 당겼다가 놓으면 발사됩니다. 클릭만 하면 발사되지 않습니다.') }
      ws.onmessage = event => {
        const msg = JSON.parse(event.data)
        if (msg.type === 'STATE') {
          if (!inbox.publicState(msg.seq, msg.state)) return
          replay.push(msg.seq, msg.state, performance.now())
          setState(msg.state); setSeq(msg.seq)
          received.current = { wall: msg.state.serverNow, mono: performance.now() }
          setPending(false)
         } else if (msg.type === 'PRIVATE_STATE') {
          if (!inbox.privateState(msg.seq, msg.state.gameId, msg.state.version)) return
          const old = previousHand.current
          if (old && old.gameId === msg.state.gameId && msg.state.cards.some((c: Card) => !old.cards.some(p => p.id === c.id)))
            window.dispatchEvent(new CustomEvent('alkkagi:feedback', { detail: { id: `${msg.state.gameId}:card:${msg.state.version}`, type: 'CARD_ACQUIRED', at: Date.now() } }))
          previousHand.current = msg.state
          setHand(msg.state)
        } else if (msg.type === 'SOCIAL_ACCEPTED') {
          if (msg.kind === 'ADVICE') setNotice('훈수 전송 완료 · 실제 알과 차례는 바뀌지 않습니다.')
        } else if (msg.type === 'FORFEIT_ACCEPTED') {
          inbox.ack(msg.gameId, msg.version)
          setNotice('기권이 확정됐습니다.'); setForfeitOpen(false)
        } else if (msg.type === 'ITEM_ACCEPTED') {
          inbox.ack(msg.gameId, msg.version)
          setNotice('아이템 적용 완료 · 발사 제한시간은 그대로입니다.')
        } else if (msg.type === 'ERROR') {
          setNotice(errorNames[msg.code] ?? msg.code); setPending(false)
        } else if (msg.type === 'SHOT_ACCEPTED') {
          inbox.ack(msg.gameId, msg.version)
          setNotice('발사 승인 · 모든 화면이 같은 서버 결과를 재생합니다.')
        } else if (msg.type === 'TUNING_APPLIED') {
          setNotice('물리값 적용 완료 · 새 판에서 테스트 시작을 눌러주세요.')
        }
      }
      ws.onclose = event => {
        setConnected(false); setPending(false); setHand(null)
        setNotice(event.code === 1008 ? '테스트 연결 한도 또는 역할 오류 · 불필요한 테스트 창을 닫아주세요.' : '연결 끊김 · 자동 재연결 중')
        if (!disposed) reconnect = setTimeout(connect, event.code === 1008 ? 5000 : 1000)
      }
    }
    connect()
    const timer = setInterval(() => setNow(received.current.wall + performance.now() - received.current.mono), 100)
    return () => { disposed = true; clearTimeout(reconnect); clearInterval(timer); socket.current?.close() }
  }, [replay, feedback, inbox])
  const send = (body: object, blocking = true) => {
    if (socket.current?.readyState !== WebSocket.OPEN) return
    socket.current.send(JSON.stringify(body)); if (blocking) setPending(true)
  }
  const shoot = (piece: Piece, dx: number, dy: number, power: number) => {
    if (!state || pending) return
    send({ type: actor < 0 ? 'ADVICE' : 'SHOT', gameId: state.gameId, actionId: crypto.randomUUID(), expectedVersion: state.version,
      pieceId: piece.id, dx, dy, power }, actor >= 0)
  }
  const preview = itemPreview(state, item?.type ?? '', targets, placement)
  const cursor = (x: number, y: number) => {
    const at = performance.now()
    if (!state || at - cursorAt.current < 90 || Math.abs(x) > state.settings.halfWidth || Math.abs(y) > state.settings.halfHeight) return
    cursorAt.current = at; send({ type: 'CURSOR', gameId: state.gameId, x, y }, false)
  }
  const currentHand = hand?.gameId === state?.gameId ? hand : null
  const canItem = connected && !pending && state?.stage === 'AIMING' && state.turn === actor
    && !state.itemUsedThisTurn && currentHand?.version === state.version
  const pickTarget = (piece: Piece) => setTargets(old => old.includes(piece.id)
    ? old.filter(id => id !== piece.id) : item?.type === 'SWAP' ? old.length < 2 ? [...old, piece.id] : [old[1], piece.id] : [piece.id])
  const left = state?.stage === 'AIMING' ? Math.max(0, Math.ceil((state.turnDeadline - now) / 1000)) : null
  const matchLeft = state ? Math.max(0, Math.ceil((state.matchDeadline - now) / 1000)) : 720
  const result = state?.stage === 'FINISHED' ? state.winner === null ? '무승부 / 검증 종료' : `${names[state.winner]} 승리` : ''
  const instruction = !connected ? '서버에 연결되면 시작할 수 있어요.'
    : !state || state.stage === 'WAITING' ? actor === 0 ? '먼저 테스트 시작을 눌러주세요.' : '홍팀 화면에서 테스트 시작을 눌러주세요.'
    : state.stage === 'FINISHED' ? '경기가 끝났어요. 홍팀 화면의 새 판을 눌러 다시 시작하세요.'
    : state.stage === 'SIMULATING' ? '알이 움직이는 중입니다. 모두 멈추면 다음 차례가 됩니다.'
    : actor < 0 ? '관전 중 · 현재 차례의 알을 드래그하면 파란 훈수를 보냅니다. 실제 발사는 되지 않습니다.'
    : state.turn !== actor ? `${names[state.turn]} 차례입니다. 해당 팀 화면에서 조작해주세요.`
    : `내 차례! ${actor === 0 ? '빨간' : '초록'} 알을 누른 채 드래그 → 놓아서 발사`
  return <main>
    <header><div><span className="eyebrow">ONTOP · LOCAL PHYSICS LAB</span><h1>아이템 알까기 <small>로컬 플레이</small></h1></div>
      <div className={`connection ${connected ? 'on' : ''}`}>{connected ? '연결됨' : '연결 끊김'}</div></header>
    <div className="provisional">영상 기준 16개/인·세 크기 그룹 · 물리값은 검수용 근사 · 아이템8종 · 손실3개마다 열세 시 카드 획득 · 미정 세부 규칙은 로컬 임시값 · 실제 판돈 없음</div>
    <section className="stats"><div>내 역할<strong>{actor < 0 ? '관전자' : names[actor]}</strong></div>
      <div>현재 차례<strong>{result || (!state || state.stage === 'WAITING' ? '시작 대기' : `${names[state.turn]} · ${state.turnNumber}턴`)}</strong></div>
      <div>남은 시간<strong>{left === null ? state?.stage === 'SIMULATING' ? '충돌 계산 중' : '—' : `${left}초`}</strong></div>
      <div>생존 알<strong>{state?.pieces.filter(p => p.owner === 0 && p.alive).length ?? 16} : {state?.pieces.filter(p => p.owner === 1 && p.alive).length ?? 16}</strong></div></section>
    <div className="round-meta">
      <span>전체 남은 시간 {state && state.stage !== 'WAITING' ? `${Math.floor(matchLeft / 60)}:${String(matchLeft % 60).padStart(2, '0')}` : '12:00'}</span>
      {state?.connections && <span>홍팀 {state.connections.red ? '접속' : '연결 끊김'} · 청팀 {state.connections.green ? '접속' : '연결 끊김'}</span>}
      {state && !['WAITING', 'FINISHED'].includes(state.stage) && state.reconnectDeadlines?.map((deadline, who) => deadline !== null
        && <span key={who}>{names[who]} 재접속 대기 {Math.max(0, Math.ceil((deadline - now) / 1000))}초</span>)}
      {actor >= 0 && state && !['WAITING', 'FINISHED'].includes(state.stage) && <button className="secondary" onClick={() => setForfeitOpen(true)}>기권하기</button>}
    </div>
    {state?.stage === 'FINISHED' && <section className="result-panel" aria-label="경기 결과"><h2>{result}</h2>
      <p>{({ EXPLICIT_LEAVE: '기권', DISCONNECT_TIMEOUT: '재접속 유예 만료', AFK_FORFEIT: '연속 두 번 미발사', PIECES_OUT: '알 전멸로 종료', MATCH_TIME_LIMIT: '전체 시간 종료', SIMULATION_INVALID: '물리 검증 종료', SIMULATION_LIMIT: '물리 안전 종료' } as Record<string, string>)[state.endReason ?? ''] ?? state.endReason}</p>
      <p>남은 알 {state.pieces.filter(p => p.alive && p.owner === 0).length} : {state.pieces.filter(p => p.alive && p.owner === 1).length} · 실제 판돈/DB 정산 없음</p>
      {actor === 0 && <button onClick={() => send({ type: 'RESET' })}>다음 판 준비</button>}
    </section>}
    {forfeitOpen && <div className="modal-shade"><section role="alertdialog" aria-label="기권 확인" aria-modal="true"><h2>이번 판을 기권할까요?</h2>
      <p>상대의 승리로 경기가 종료됩니다.</p><button className="secondary" autoFocus onClick={() => setForfeitOpen(false)}>계속 플레이</button>
      <button onClick={() => state && send({ type: 'FORFEIT', gameId: state.gameId, actionId: crypto.randomUUID() })}>기권 확정</button>
    </section></div>}
    <div className="play-guide"><strong>{instruction}</strong>
      {actor === 0 && <button disabled={!connected || pending || state?.stage !== 'WAITING'} onClick={() => send({ type: 'START' })}>테스트 시작</button>}
    </div>
    <section className="item-panel" aria-label="비밀 카드">
      {actor >= 0 ? <>
        <strong>내 비밀 카드 ({currentHand?.cards.length ?? 0}/2)</strong>
        {actor === 0 && state?.stage === 'WAITING' && <div className="buttons">
          {practice.map((value, index) => <select key={index} aria-label={`연습 카드 ${index + 1}`} value={value}
            onChange={e => setPractice(old => old.map((v, i) => i === index ? e.target.value : v))}>
            {Object.entries(cardNames).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
          </select>)}
          <button disabled={!connected || pending || !currentHand || !!currentHand.cards.length}
          onClick={() => state && send({ type: 'TEST_CARDS', gameId: state.gameId, expectedVersion: state.version, cards: practice })}>연습 카드 받기 (로컬)</button></div>}
        <div className="buttons">{currentHand?.cards.map(card => <button key={card.id} disabled={!canItem}
          aria-pressed={item?.id === card.id} onClick={() => { setItem(card); setTargets([]); setPlacement(null); setPinned(false) }}>{cardNames[card.type] ?? card.type}</button>)}</div>
        {item && <div>
          <p>{item.type === 'SWAP' ? '교환할 내 알 두 개를 클릭하세요.' : item.type === 'EXTRA_SHOT'
            ? '원래 30초 안에서 발사 한 번을 추가합니다. 시간이 늘어나지 않습니다.' : item.type === 'WALL'
            ? '커서를 따라오는 벽을 클릭해 위치 고정 · Q/E·휠로 회전 · 확정 또는 취소' : item.type === 'RELOCATE'
            ? '내 알 하나를 클릭한 뒤 빈 판을 클릭해 이동 위치를 선택하세요.' : '효과를 적용할 내 알 하나를 클릭하세요.'}</p>
          {!['WALL', 'EXTRA_SHOT'].includes(item.type) && <p>선택: {targets.join(' ↔ ') || '없음'} ({targets.length}/{item.type === 'SWAP' ? 2 : 1})</p>}
          {['WALL', 'RELOCATE'].includes(item.type) && <p>위치: {placement ? `${placement.x.toFixed(2)}, ${placement.y.toFixed(2)}` : '판을 클릭하세요'}
            {item.type === 'WALL' && <label> 각도 <input aria-label="벽 각도" type="range" min={-180} max={180} step={15}
              value={(placement?.angle ?? 0) * 180 / Math.PI} onChange={e => setPlacement(old => old
                ? { ...old, angle: Number(e.target.value) * Math.PI / 180 } : null)} /></label>}</p>}
          <p className={preview.valid ? 'valid-preview' : 'invalid-preview'}>{preview.reason}{item.type === 'WALL' && placement && !pinned ? ' · 클릭해 위치를 고정하세요.' : ''}</p>
          {item.type === 'WALL' && pinned && <button className="secondary" onClick={() => setPinned(false)}>벽 위치 다시 고르기</button>}
          <button disabled={!preview.valid || (item.type === 'WALL' && !pinned) || !canItem || (item.type === 'SWAP' ? targets.length !== 2 : !['WALL', 'EXTRA_SHOT'].includes(item.type) && targets.length !== 1) || (['WALL', 'RELOCATE'].includes(item.type) && !placement)} onClick={() => {
            if (!state) return
            send({ type: 'ITEM_USE', gameId: state.gameId, expectedVersion: state.version, actionId: crypto.randomUUID(),
              cardId: item.id, targetPieceIds: ['WALL', 'EXTRA_SHOT'].includes(item.type) ? [] : targets,
              ...(['WALL', 'RELOCATE'].includes(item.type) && placement ? { placement } : {}) })
          }}>아이템 확정</button> <button className="secondary" onClick={cancelItem}>아이템 취소</button>
        </div>}
        <small>연습 카드 받기는 검수용입니다 · 일반 플레이는 손실 조건 충족 시 서버 지급 · 턴당 1개·첫 발사 전 사용</small>
      </> : <p>관전자는 미사용 카드 종류와 식별자를 받지 않습니다.</p>}
      {state?.boostedPieceId && <p>힘 강화 대상: {state.boostedPieceId} · 이 알로 발사하세요.</p>}
      {state?.pieces.filter(p => p.alive && p.modifier).map(p => <small key={p.id}>{p.id}: {cardNames[p.modifier!] ?? p.modifier}{p.restorePending ? ' · 원복 공간 대기' : ''}</small>)}
      {!!state?.extraShotsRemaining && <p>추가 발사 예약 1회 · 원래 제한시간 안에서만 사용</p>}
      {state?.lastItemEffect && <p>공개된 사용 효과: {names[state.lastItemEffect.actor]} · {cardNames[state.lastItemEffect.type] ?? state.lastItemEffect.type}</p>}
    </section>
    <details className="tuning-panel">
      <summary>아이템 수치 조절 · 로컬 임시값</summary>
      <p>운영 확정 규칙이 아닙니다. 크기 변경 시 질량은 크기 배율의 제곱에 비례하며, 원복 자리가 겹치면 안전해질 때까지 보류합니다.</p>
      {([
        ['wallLength', '벽 길이', .5, 3, .1], ['wallThickness', '벽 두께', .1, .5, .01], ['wallMargin', '벽 가장자리 여백', .02, .4, .01],
        ['relocateDistance', '재배치 거리', .5, 3, .1], ['powerMultiplier', '힘 강화 배율', 1.05, 2, .05],
        ['growScale', '확대 배율', 1.05, 1.5, .05], ['shrinkScale', '축소 배율', .5, .95, .05],
        ['defendMassMultiplier', '방어 질량 배율', 1.1, 4, .1], ['effectOpponentTurns', '효과 지속 상대 턴 수', 1, 3, 1],
      ] as const).map(([key, title, min, max, step]) => <label key={key} className="item-rule">{title}
        <input aria-label={title} type="number" min={min} max={max} step={step} disabled={actor !== 0} value={rules[key]}
          onChange={e => setRules(old => ({ ...old, [key]: Number(e.target.value) }))} /></label>)}
      {actor === 0 && <button disabled={!connected || pending || !state || Object.values(rules).some(v => !Number.isFinite(v))}
        onClick={() => state && send({ type: 'TUNE_ITEMS', gameId: state.gameId, expectedVersion: state.version, rules })}>아이템 설정 적용하고 새 판</button>}
      <small>벽은 전체1개·인당 경기3회, 상대의 다음 발사/스킵 턴 종료까지 유지합니다. 힘 강화는 지정 알의 이번 발사만 적용, 미발사 시 턴 종료에 해제합니다.</small>
    </details>
    <details className="tuning-panel">
      <summary>물리값 조절 · 로컬 전용 <span>현재 힘 {state?.settings.maximumImpulse ?? '—'} / 감속 {state?.settings.deceleration ?? '—'} / 반발 {state?.settings.restitution ?? '—'}</span></summary>
      <p>값을 바꾼 뒤 ‘적용하고 새 판’을 누르면 양쪽 화면에 반영됩니다. 진행 중인 판은 초기화됩니다.</p>
      {([
        ['maximumImpulse', '발사 힘', .5, 30, .5, '12 = 속도 배율1 · 사용자 선택 기본값30(2.5배)'],
        ['deceleration', '감속', .1, 60, .1, '높을수록 빨리 멈춤'],
        ['restitution', '반발', 0, 1, .01, '높을수록 충돌 후 더 잘 튕김'],
      ] as const).map(([key, title, min, max, step, description]) => <div className="tuning-row" key={key}>
        <label htmlFor={`tuning-${key}`}>{title}<small>{description}</small></label>
        <input aria-label={`${title} 슬라이더`} type="range" min={min} max={max} step={step} value={tuning[key]}
          disabled={actor !== 0} onChange={event => setTuning({ ...tuning, [key]: Number(event.target.value) })} />
        <input id={`tuning-${key}`} aria-label={`${title} 값`} type="number" min={min} max={max} step={step} value={tuning[key]}
          disabled={actor !== 0} onChange={event => setTuning({ ...tuning, [key]: Number(event.target.value) })} />
      </div>)}
      {actor === 0 ? <div className="buttons">
        <button disabled={!connected || pending || !state || !Number.isFinite(tuning.maximumImpulse)
          || tuning.maximumImpulse < .5 || tuning.maximumImpulse > 30 || !Number.isFinite(tuning.deceleration)
          || tuning.deceleration < .1 || tuning.deceleration > 60 || !Number.isFinite(tuning.restitution)
          || tuning.restitution < 0 || tuning.restitution > 1}
          onClick={() => state && send({ type: 'TUNE', gameId: state.gameId, expectedVersion: state.version, ...tuning })}>적용하고 새 판</button>
        <button className="secondary" disabled={!connected || pending || !state}
          onClick={() => state && send({ type: 'TUNE_RESET', gameId: state.gameId, expectedVersion: state.version })}>기본값으로 새 판</button>
      </div> : <p>홍팀 화면에서 조절할 수 있어요. 현재 서버 값은 모든 화면에서 확인할 수 있습니다.</p>}
      <small>일반 ‘새 판’은 조절한 값을 유지합니다. 서버를 다시 시작하면 선택한 기본값(30 / 60 / 1)으로 돌아갑니다.</small>
    </details>
    <div className="board">
      <AlkkagiBoard actor={actor} state={state} replay={replay} enabled={connected && !pending && state?.stage === 'AIMING' && (actor < 0 || state.turn === actor)}
        shoot={shoot} explain={setNotice} blockedReason={instruction}
        itemMode={item?.type ?? null} itemTargets={targets} pickTarget={pickTarget} cancelItem={cancelItem} placement={placement} pinned={pinned} previewValid={preview.valid} cursor={cursor}
        rotatePlacement={delta => setPlacement(old => old ? ({ ...old, angle: Math.atan2(Math.sin(old.angle + delta), Math.cos(old.angle + delta)) }) : null)}
        pickPlacement={(x, y, pin = false) => { setPlacement(old => ({ x, y, angle: old?.angle ?? 0 })); if (pin) setPinned(true) }} />
    </div>
    <SocialPanel state={state} connected={connected} sendChat={text => state && send({ type: 'CHAT', gameId: state.gameId, actionId: crypto.randomUUID(), text }, false)} />
    <footer><p role="status">{notice}</p><div className="buttons">
      {actor === 0 && <button className="secondary" disabled={!connected || pending} onClick={() => send({ type: 'RESET' })}>새 판</button>}
      <a href="?role=red">홍팀</a><a href="?role=green" target="_blank">청팀 화면 열기 ↗</a><a href="?role=viewer" target="_blank">관전 ↗</a>
    </div><small>큰 알일수록 밀어내는 힘과 버티는 무게가 큽니다 · 누른 채 드래그 → 놓아서 발사 · Esc / 우클릭 취소</small>
      <details><summary>동기화 정보</summary><code>snapshot {seq} · tick {state?.tick} · shot {state?.simulationId} · version {state?.version}<br />game {state?.gameId} · model {state?.modelId}<br />{state?.endReason}</code></details></footer>
  </main>
}

createRoot(document.getElementById('root')!).render(<App />)
