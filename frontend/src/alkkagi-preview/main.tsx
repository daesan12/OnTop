import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ArrowHelper, CanvasTexture, Group, Mesh, Plane, Vector2, Vector3 } from 'three'
import { AlkkagiReplay, type Piece, type Snapshot } from '../game/alkkagi/replay'
import { draggedShot, launchResponse } from '../game/alkkagi/aimInput'
import './style.css'

const role = new URLSearchParams(location.search).get('role') ?? 'red'
const actor = role === 'red' ? 0 : role === 'green' ? 1 : -1
const names = ['홍팀', '청팀']
const errorNames: Record<string, string> = {
  NOT_YOUR_TURN: '상대 차례입니다.', NOT_YOUR_PIECE: '내 알을 선택해주세요.',
  NOT_AIMING: '알이 멈춘 후 발사해주세요.', STALE_VERSION: '최신 상태를 확인하고 다시 조준해주세요.',
  STALE_GAME: '새 판으로 변경됐습니다.', PLAYER_REQUIRED: '관전자는 발사할 수 없습니다.',
  STALE_TUNING: '판이 바뀌었습니다. 최신 상태에서 다시 적용해주세요.',
  INVALID_TUNING: '조절 범위를 확인해주세요. 발사 힘 0.5~30 / 감속 0.1~60 / 반발 0~1',
  RED_TUNING_ONLY: '홍팀 화면에서 물리값을 조절해주세요.',
}

type Card = { id: string; type: string }
type PrivateState = { gameId: string; version: number; cards: Card[] }
const cardNames: Record<string, string> = { SWAP: '내 알 위치 교환', EXTRA_SHOT: '한 번 더 튕기기' }

function App() {
  const replay = useMemo(() => new AlkkagiReplay(), [])
  const socket = useRef<WebSocket | null>(null)
  const [state, setState] = useState<Snapshot | null>(null)
  const [connected, setConnected] = useState(false), [notice, setNotice] = useState('서버 연결 중…')
  const [pending, setPending] = useState(false), [now, setNow] = useState(Date.now())
  const [seq, setSeq] = useState(0)
  const [hand, setHand] = useState<PrivateState | null>(null)
  const [item, setItem] = useState<Card | null>(null), [targets, setTargets] = useState<string[]>([])
  const cancelItem = () => { setItem(null); setTargets([]) }
  useEffect(cancelItem, [state?.gameId, state?.version, connected])
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
      ws.onopen = () => { replay.clear(); setConnected(true); setNotice('알을 먼저 클릭해 선택한 뒤, 다시 누르고 당겨 발사하세요.') }
      ws.onmessage = event => {
        const msg = JSON.parse(event.data)
        if (msg.type === 'STATE') {
          replay.push(msg.seq, msg.state, performance.now())
          setState(msg.state); setSeq(msg.seq)
          received.current = { wall: msg.state.serverNow, mono: performance.now() }
          setPending(false)
         } else if (msg.type === 'PRIVATE_STATE') {
          setHand(msg.state)
        } else if (msg.type === 'ITEM_ACCEPTED') {
          setNotice('아이템 적용 완료 · 발사 제한시간은 그대로입니다.')
        } else if (msg.type === 'ERROR') {
          setNotice(errorNames[msg.code] ?? msg.code); setPending(false)
        } else if (msg.type === 'SHOT_ACCEPTED') {
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
  }, [replay])
  const send = (body: object) => {
    if (socket.current?.readyState !== WebSocket.OPEN) return
    socket.current.send(JSON.stringify(body)); setPending(true)
  }
  const shoot = (piece: Piece, dx: number, dy: number, power: number) => {
    if (!state || pending) return
    send({ type: 'SHOT', gameId: state.gameId, actionId: crypto.randomUUID(), expectedVersion: state.version,
      pieceId: piece.id, dx, dy, power })
  }
  const currentHand = hand?.gameId === state?.gameId ? hand : null
  const canItem = connected && !pending && state?.stage === 'AIMING' && state.turn === actor
    && !state.itemUsedThisTurn && currentHand?.version === state.version
  const pickTarget = (piece: Piece) => setTargets(old => old.includes(piece.id)
    ? old.filter(id => id !== piece.id) : old.length < 2 ? [...old, piece.id] : [old[1], piece.id])
  const left = state?.stage === 'AIMING' ? Math.max(0, Math.ceil((state.turnDeadline - now) / 1000)) : null
  const result = state?.stage === 'FINISHED' ? state.winner === null ? '무승부 / 검증 종료' : `${names[state.winner]} 승리` : ''
  const instruction = !connected ? '서버에 연결되면 시작할 수 있어요.'
    : !state || state.stage === 'WAITING' ? actor === 0 ? '먼저 테스트 시작을 눌러주세요.' : '홍팀 화면에서 테스트 시작을 눌러주세요.'
    : state.stage === 'FINISHED' ? '경기가 끝났어요. 홍팀 화면의 새 판을 눌러 다시 시작하세요.'
    : state.stage === 'SIMULATING' ? '알이 움직이는 중입니다. 모두 멈추면 다음 차례가 됩니다.'
    : actor < 0 ? '관전 화면입니다. 홍팀·청팀 화면에서 발사할 수 있어요.'
    : state.turn !== actor ? `${names[state.turn]} 차례입니다. 해당 팀 화면에서 조작해주세요.`
    : `내 차례! ${actor === 0 ? '빨간' : '초록'} 알 클릭으로 선택 → 다시 누르고 당겨서 발사`
  return <main>
    <header><div><span className="eyebrow">ONTOP · LOCAL PHYSICS LAB</span><h1>아이템 알까기 <small>기본 물리</small></h1></div>
      <div className={`connection ${connected ? 'on' : ''}`}>{connected ? '연결됨' : '연결 끊김'}</div></header>
    <div className="provisional">영상 기준 16개/인·세 크기 그룹 · 물리값은 검수용 근사 · 위치 교환·추가 발사 연습 카드 제공 · 판돈 없음</div>
    <section className="stats"><div>내 역할<strong>{actor < 0 ? '관전자' : names[actor]}</strong></div>
      <div>현재 차례<strong>{result || (!state || state.stage === 'WAITING' ? '시작 대기' : `${names[state.turn]} · ${state.turnNumber}턴`)}</strong></div>
      <div>남은 시간<strong>{left === null ? state?.stage === 'SIMULATING' ? '충돌 계산 중' : '—' : `${left}초`}</strong></div>
      <div>생존 알<strong>{state?.pieces.filter(p => p.owner === 0 && p.alive).length ?? 16} : {state?.pieces.filter(p => p.owner === 1 && p.alive).length ?? 16}</strong></div></section>
    <div className="play-guide"><strong>{instruction}</strong>
      {actor === 0 && <button disabled={!connected || pending || state?.stage !== 'WAITING'} onClick={() => send({ type: 'START' })}>테스트 시작</button>}
    </div>
    <section className="item-panel" aria-label="비밀 카드">
      {actor >= 0 ? <>
        <strong>내 비밀 카드 ({currentHand?.cards.length ?? 0}/2)</strong>
        {actor === 0 && state?.stage === 'WAITING' && <button disabled={!connected || pending || !currentHand || !!currentHand.cards.length}
          onClick={() => state && send({ type: 'TEST_CARDS', gameId: state.gameId, expectedVersion: state.version })}>연습 카드 받기 (로컬)</button>}
        <div className="buttons">{currentHand?.cards.map(card => <button key={card.id} disabled={!canItem}
          aria-pressed={item?.id === card.id} onClick={() => { setItem(card); setTargets([]) }}>{cardNames[card.type] ?? card.type}</button>)}</div>
        {item && <div>
          <p>{item.type === 'SWAP' ? '교환할 내 알 두 개를 클릭하세요.' : '원래 30초 안에서 발사 한 번을 추가합니다. 시간이 늘어나지 않습니다.'}</p>
          {item.type === 'SWAP' && <p>선택: {targets.join(' ↔ ') || '없음'} ({targets.length}/2)</p>}
          <button disabled={!canItem || (item.type === 'SWAP' && targets.length !== 2)} onClick={() => {
            if (!state) return
            send({ type: 'ITEM_USE', gameId: state.gameId, expectedVersion: state.version, actionId: crypto.randomUUID(),
              cardId: item.id, targetPieceIds: item.type === 'SWAP' ? targets : [] })
          }}>아이템 확정</button> <button className="secondary" onClick={cancelItem}>아이템 취소</button>
        </div>}
        <small>테스트 지급은 실제 지급 규칙이 아닙니다 · 턴당 아이템 1개 · 첫 발사 전 사용 · 취소하면 소모되지 않습니다.</small>
      </> : <p>관전자는 미사용 카드 종류와 식별자를 받지 않습니다.</p>}
      {!!state?.extraShotsRemaining && <p>추가 발사 예약 1회 · 원래 제한시간 안에서만 사용</p>}
      {state?.lastItemEffect && <p>공개된 사용 효과: {names[state.lastItemEffect.actor]} · {cardNames[state.lastItemEffect.type] ?? state.lastItemEffect.type}</p>}
    </section>
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
    <div className="board"><Canvas shadows camera={{ position: [0, 14, 0.01], fov: 46 }}>
      <color attach="background" args={['#253d37']} /><ambientLight intensity={1.8} />
      <directionalLight position={[3, 10, 6]} intensity={2.5} castShadow shadow-mapSize={[1024, 1024]} />
      <Scene state={state} replay={replay} enabled={connected && !pending && state?.stage === 'AIMING' && state.turn === actor}
        shoot={shoot} explain={setNotice} blockedReason={instruction}
        itemMode={item?.type ?? null} itemTargets={targets} pickTarget={pickTarget} cancelItem={cancelItem} />
    </Canvas></div>
    <footer><p role="status">{notice}</p><div className="buttons">
      {actor === 0 && <button className="secondary" disabled={!connected || pending} onClick={() => send({ type: 'RESET' })}>새 판</button>}
      <a href="?role=red">홍팀</a><a href="?role=green" target="_blank">청팀 화면 열기 ↗</a><a href="?role=viewer" target="_blank">관전 ↗</a>
    </div><small>큰 알일수록 밀어내는 힘과 버티는 무게가 큽니다 · 클릭 선택 → 다시 눌러 드래그 · Esc / 우클릭 취소</small>
      <details><summary>동기화 정보</summary><code>snapshot {seq} · tick {state?.tick} · shot {state?.simulationId} · version {state?.version}<br />game {state?.gameId} · model {state?.modelId}<br />{state?.endReason}</code></details></footer>
  </main>
}

type Aim = { piece: Piece; origin: Vector3; end: Vector3; start: { x: number; y: number }
  moved: number; pointerId: number; gameId: string; version: number }
function Scene({ state, replay, enabled, shoot, explain, blockedReason, itemMode, itemTargets, pickTarget, cancelItem }: { state: Snapshot | null; replay: AlkkagiReplay; enabled: boolean
  shoot(p: Piece, dx: number, dy: number, power: number): void; explain(message: string): void; blockedReason: string; itemMode: string | null; itemTargets: string[]; pickTarget(piece: Piece): void; cancelItem(): void }) {
  const groups = useRef(new Map<string, Group>())
  const displayed = useRef({ gameId: '', generation: -1, alive: new Map<string, boolean>() })
  const { gl, camera, raycaster } = useThree()
  const aim = useRef<Aim | null>(null), arrow = useMemo(() => new ArrowHelper(new Vector3(0, 0, -1), new Vector3(), 1, '#f3c16d'), [])
  const selected = useRef<Piece | null>(null), selectionRing = useRef<Mesh>(null)
  const floor = useMemo(() => new Plane(new Vector3(0, 1, 0), -.36), [])
  const pieces = state?.pieces ?? []
  const clearAim = () => { aim.current = null; arrow.visible = false }
  const clear = () => { clearAim(); selected.current = null; if (selectionRing.current) selectionRing.current.visible = false }
  useEffect(() => {
    const canvas = gl.domElement
    const point = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      raycaster.setFromCamera(new Vector2((event.clientX - rect.left) / rect.width * 2 - 1,
        -(event.clientY - rect.top) / rect.height * 2 + 1), camera)
      return raycaster.ray.intersectPlane(floor, new Vector3())
    }
    const move = (event: PointerEvent) => {
      const a = aim.current, p = point(event)
      if (a && p && event.pointerId === a.pointerId) {
        a.end.copy(p); a.moved = Math.hypot(event.clientX - a.start.x, event.clientY - a.start.y)
        const shot = draggedShot(a.start, { x: event.clientX, y: event.clientY }, a.origin, p)
        const response = launchResponse(shot?.power ?? 0, state?.inputCurveBoost ?? 0)
        explain(`조준 입력 ${Math.round((shot?.power ?? 0) * 100)}% · 예상 출발 속도 ${((a.piece.launchSpeed ?? 0) * response).toFixed(2)}칸/초 · 놓으면 발사`)
      }
    }
    const up = (event: PointerEvent) => {
      const a = aim.current
      if (!a || event.pointerId !== a.pointerId) return
      clearAim()
      if (event.button !== 0 || !a || !enabled || a.gameId !== state?.gameId || a.version !== state.version) return
      const shot = draggedShot(a.start, { x: event.clientX, y: event.clientY }, a.origin, point(event) ?? a.end)
      if (shot) {
        clear(); shoot(a.piece, shot.dx, shot.dy, shot.power)
      } else explain(`${a.piece.type} 선택됨 · 클릭/작은 흔들림으로는 발사되지 않습니다. 다시 누르고 당겨주세요.`)
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') clear() }
    const cancel = (e: Event) => { e.preventDefault(); clear(); cancelItem() }
    canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', clear); canvas.addEventListener('contextmenu', cancel)
    window.addEventListener('keydown', key); window.addEventListener('blur', clear)
    return () => { canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', clear); canvas.removeEventListener('contextmenu', cancel)
      window.removeEventListener('keydown', key); window.removeEventListener('blur', clear) }
  }, [camera, gl, raycaster, floor, enabled, state?.gameId, state?.version, shoot])
  useEffect(clear, [enabled, state?.gameId, state?.version, itemMode])
  useFrame((_, delta) => {
    const frame = replay.sample(performance.now())
    if (!frame) return
    if (displayed.current.gameId !== frame.gameId || displayed.current.generation !== replay.generation) {
      displayed.current = { gameId: frame.gameId, generation: replay.generation, alive: new Map() }
    }
    for (const p of frame.pieces) {
      const group = groups.current.get(p.id)
      if (!group) continue
      const wasAlive = displayed.current.alive.get(p.id)
      if (p.alive) { group.position.set(p.x, 0, p.y); group.rotation.set(0, 0, 0); group.visible = true }
      else {
        // 최신 상태에 이미 탈락한 알은 과거 낙하를 재생하지 않는다.
        if (wasAlive === undefined) group.position.y = -5
        else if (wasAlive) group.position.set(p.x, 0, p.y)
        group.position.y = Math.max(-5, group.position.y - delta * 5)
        group.rotation.x += delta * 1.4; group.visible = group.position.y > -4
      }
      displayed.current.alive.set(p.id, p.alive)
    }
    if (selectionRing.current) {
      selectionRing.current.visible = !!selected.current && enabled
      if (selected.current) {
        selectionRing.current.position.set(selected.current.x, .31, selected.current.y)
        selectionRing.current.scale.setScalar(selected.current.radius * 1.18)
      }
    }
    if (aim.current) {
      const a = aim.current, direction = new Vector3(a.origin.x - a.end.x, 0, a.origin.z - a.end.z)
      const length = direction.length(); arrow.visible = a.moved >= 12 && length >= .08
      arrow.position.set(a.piece.x, .45, a.piece.y); arrow.setDirection(direction.normalize())
      arrow.setLength(2.5 * launchResponse(Math.min(1, length / 2.5), state?.inputCurveBoost ?? 0), .25, .14)
    }
  })
  return <>
    <mesh receiveShadow position={[0, -.14, 0]}><boxGeometry args={[9, .28, 10]} /><meshStandardMaterial color="#c5a06a" roughness={.85} /></mesh>
    {Array.from({ length: 9 }, (_, i) => <mesh key={`v${i}`} position={[i - 4, .004, 0]}><boxGeometry args={[.012, .008, 9.5]} /><meshBasicMaterial color="#806243" /></mesh>)}
    {Array.from({ length: 10 }, (_, i) => <mesh key={`h${i}`} position={[0, .004, i - 4.5]}><boxGeometry args={[8.5, .008, .012]} /><meshBasicMaterial color="#806243" /></mesh>)}
    {pieces.map(piece => <group key={`${state!.gameId}-${piece.id}`} ref={g => { if (g) groups.current.set(piece.id, g); else groups.current.delete(piece.id) }}>
      <mesh castShadow receiveShadow position={[0, .15, 0]} onPointerDown={e => {
        if (e.button !== 0) return
        e.stopPropagation()
        if (!enabled) { explain(blockedReason); return }
        if (!piece.alive || piece.owner !== actor) { explain('상대 알입니다. 내 팀 색깔의 알을 골라주세요.'); return }
        if (itemMode) {
          clear()
          if (itemMode === 'SWAP') pickTarget(piece)
          else explain('아이템 확정 또는 취소를 먼저 눌러주세요.')
          return
        }
        if (selected.current?.id !== piece.id) {
          clearAim(); selected.current = piece
          explain(`${piece.type} 선택됨 · 먼저 클릭해 선택했습니다. 이제 이 알을 다시 누르고 당겨주세요.`)
          return
        }
        const origin = e.ray.intersectPlane(floor, new Vector3())
        if (!origin) return
        gl.domElement.setPointerCapture(e.pointerId)
        selected.current = piece
        explain(`${piece.type} 조준 중 · 당긴 뒤 놓으면 발사됩니다. Esc로 취소`)
        aim.current = { piece, origin, end: origin.clone(), start: { x: e.clientX, y: e.clientY },
          moved: 0, pointerId: e.pointerId, gameId: state!.gameId, version: state!.version }
      }}><cylinderGeometry args={[piece.radius, piece.radius * 1.03, .27, 8]} /><meshStandardMaterial color="#f0d5a1" roughness={.65} /></mesh>
      <Label piece={piece} />
    </group>)}
    {itemTargets.map(id => {
      const piece = pieces.find(p => p.id === id)
      return piece ? <mesh key={id} position={[piece.x, .32, piece.y]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
        <ringGeometry args={[piece.radius * 1.15, piece.radius * 1.32, 48]} /><meshBasicMaterial color="#5fffe6" depthWrite={false} />
      </mesh> : null
    })}
    <primitive object={arrow} />
    <mesh ref={selectionRing} visible={false} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
      <ringGeometry args={[1, 1.13, 48]} /><meshBasicMaterial color="#fff38b" depthWrite={false} />
    </mesh>
  </>
}

function Label({ piece }: { piece: Piece }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#efd6a5'; ctx.fillRect(0, 0, 256, 256)
    ctx.strokeStyle = piece.owner === 0 ? '#9d302b' : '#286452'; ctx.lineWidth = 9
    ctx.beginPath(); ctx.arc(128, 128, 113, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = ctx.strokeStyle; ctx.font = 'bold 172px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(piece.type, 128, 137)
    return new CanvasTexture(canvas)
  }, [piece.type, piece.owner])
  useEffect(() => () => texture.dispose(), [texture])
  return <mesh position={[0, .29, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}><circleGeometry args={[piece.radius * .9, 32]} /><meshBasicMaterial map={texture} /></mesh>
}

createRoot(document.getElementById('root')!).render(<App />)
