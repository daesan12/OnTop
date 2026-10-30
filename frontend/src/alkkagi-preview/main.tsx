import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ArrowHelper, CanvasTexture, Group, Plane, Vector2, Vector3 } from 'three'
import { AlkkagiReplay, type Piece, type Snapshot } from '../game/alkkagi/replay'
import './style.css'

const role = new URLSearchParams(location.search).get('role') ?? 'red'
const actor = role === 'red' ? 0 : role === 'green' ? 1 : -1
const names = ['홍팀', '청팀']
const errorNames: Record<string, string> = {
  NOT_YOUR_TURN: '상대 차례입니다.', NOT_YOUR_PIECE: '내 알을 선택해주세요.',
  NOT_AIMING: '알이 멈춘 후 발사해주세요.', STALE_VERSION: '최신 상태를 확인하고 다시 조준해주세요.',
  STALE_GAME: '새 판으로 변경됐습니다.', PLAYER_REQUIRED: '관전자는 발사할 수 없습니다.',
}

function App() {
  const replay = useMemo(() => new AlkkagiReplay(), [])
  const socket = useRef<WebSocket | null>(null)
  const [state, setState] = useState<Snapshot | null>(null)
  const [connected, setConnected] = useState(false), [notice, setNotice] = useState('서버 연결 중…')
  const [pending, setPending] = useState(false), [now, setNow] = useState(Date.now())
  const [seq, setSeq] = useState(0)
  const received = useRef({ wall: Date.now(), mono: performance.now() })
  useEffect(() => {
    let disposed = false, reconnect: ReturnType<typeof setTimeout> | undefined
    const connect = () => {
      const ws = new WebSocket(`ws://127.0.0.1:19183/dev/alkkagi-ws?role=${encodeURIComponent(role)}`)
      socket.current = ws
      ws.onopen = () => { replay.clear(); setConnected(true); setNotice('내 알을 상대 방향 반대로 당겼다 놓으세요.') }
      ws.onmessage = event => {
        const msg = JSON.parse(event.data)
        if (msg.type === 'STATE') {
          replay.push(msg.seq, msg.state, performance.now())
          setState(msg.state); setSeq(msg.seq)
          received.current = { wall: msg.state.serverNow, mono: performance.now() }
          setPending(false)
        } else if (msg.type === 'ERROR') {
          setNotice(errorNames[msg.code] ?? msg.code); setPending(false)
        } else if (msg.type === 'SHOT_ACCEPTED') {
          setNotice('발사 승인 · 모든 화면이 같은 서버 결과를 재생합니다.')
        }
      }
      ws.onclose = event => {
        setConnected(false); setPending(false)
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
  const left = state?.stage === 'AIMING' ? Math.max(0, Math.ceil((state.turnDeadline - now) / 1000)) : null
  const result = state?.stage === 'FINISHED' ? state.winner === null ? '무승부 / 검증 종료' : `${names[state.winner]} 승리` : ''
  return <main>
    <header><div><span className="eyebrow">ONTOP · LOCAL PHYSICS LAB</span><h1>아이템 알까기 <small>기본 물리</small></h1></div>
      <div className={`connection ${connected ? 'on' : ''}`}>{connected ? '연결됨' : '연결 끊김'}</div></header>
    <div className="provisional">임시 배치·물리값 · 일반 장기 구성 16개/인 · 원작 초기 배치 미확인 · 아이템/판돈 없음</div>
    <section className="stats"><div>내 역할<strong>{actor < 0 ? '관전자' : names[actor]}</strong></div>
      <div>현재 차례<strong>{result || (!state || state.stage === 'WAITING' ? '시작 대기' : `${names[state.turn]} · ${state.turnNumber}턴`)}</strong></div>
      <div>남은 시간<strong>{left === null ? state?.stage === 'SIMULATING' ? '충돌 계산 중' : '—' : `${left}초`}</strong></div>
      <div>생존 알<strong>{state?.pieces.filter(p => p.owner === 0 && p.alive).length ?? 16} : {state?.pieces.filter(p => p.owner === 1 && p.alive).length ?? 16}</strong></div></section>
    <div className="board"><Canvas shadows camera={{ position: [0, 14, 0.01], fov: 46 }}>
      <color attach="background" args={['#253d37']} /><ambientLight intensity={1.8} />
      <directionalLight position={[3, 10, 6]} intensity={2.5} castShadow shadow-mapSize={[1024, 1024]} />
      <Scene state={state} replay={replay} enabled={connected && !pending && state?.stage === 'AIMING' && state.turn === actor} shoot={shoot} />
    </Canvas></div>
    <footer><p role="status">{notice}</p><div className="buttons">
      {actor === 0 && <><button disabled={!connected || pending || state?.stage !== 'WAITING'} onClick={() => send({ type: 'START' })}>테스트 시작</button>
        <button className="secondary" disabled={!connected || pending} onClick={() => send({ type: 'RESET' })}>새 판</button></>}
      <a href="?role=red">홍팀</a><a href="?role=green" target="_blank">청팀 화면 열기 ↗</a><a href="?role=viewer" target="_blank">관전 ↗</a>
    </div><small>작은 알은 가볍게, 큰 알은 무겁게 · 드래그 길이 = 힘 · Esc / 우클릭 취소</small>
      <details><summary>동기화 정보</summary><code>snapshot {seq} · tick {state?.tick} · shot {state?.simulationId} · version {state?.version}<br />game {state?.gameId}<br />{state?.endReason}</code></details></footer>
  </main>
}

type Aim = { piece: Piece; end: Vector3; gameId: string; version: number }
function Scene({ state, replay, enabled, shoot }: { state: Snapshot | null; replay: AlkkagiReplay; enabled: boolean
  shoot(p: Piece, dx: number, dy: number, power: number): void }) {
  const groups = useRef(new Map<string, Group>())
  const displayed = useRef({ gameId: '', generation: -1, alive: new Map<string, boolean>() })
  const { gl, camera, raycaster } = useThree()
  const aim = useRef<Aim | null>(null), arrow = useMemo(() => new ArrowHelper(new Vector3(0, 0, -1), new Vector3(), 1, '#f3c16d'), [])
  const floor = useMemo(() => new Plane(new Vector3(0, 1, 0), -.36), [])
  const pieces = state?.pieces ?? []
  const clear = () => { aim.current = null; arrow.visible = false }
  useEffect(() => {
    const canvas = gl.domElement
    const point = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      raycaster.setFromCamera(new Vector2((event.clientX - rect.left) / rect.width * 2 - 1,
        -(event.clientY - rect.top) / rect.height * 2 + 1), camera)
      return raycaster.ray.intersectPlane(floor, new Vector3())
    }
    const move = (event: PointerEvent) => { const p = point(event); if (aim.current && p) aim.current.end.copy(p) }
    const up = (event: PointerEvent) => {
      const a = aim.current; clear()
      if (event.button !== 0 || !a || !enabled || a.gameId !== state?.gameId || a.version !== state.version) return
      const p = point(event) ?? a.end, dx = a.piece.x - p.x, dy = a.piece.y - p.z
      const length = Math.hypot(dx, dy)
      if (length >= .08) shoot(a.piece, dx / length, dy / length, Math.min(1, length / 2.5))
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') clear() }
    const cancel = (e: Event) => { e.preventDefault(); clear() }
    canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', clear); canvas.addEventListener('contextmenu', cancel)
    window.addEventListener('keydown', key); window.addEventListener('blur', clear)
    return () => { canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', clear); canvas.removeEventListener('contextmenu', cancel)
      window.removeEventListener('keydown', key); window.removeEventListener('blur', clear) }
  }, [camera, gl, raycaster, floor, enabled, state?.gameId, state?.version, shoot])
  useEffect(clear, [enabled, state?.gameId, state?.version])
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
    if (aim.current) {
      const a = aim.current, direction = new Vector3(a.piece.x - a.end.x, 0, a.piece.y - a.end.z)
      const length = direction.length(); arrow.visible = length > .05
      arrow.position.set(a.piece.x, .45, a.piece.y); arrow.setDirection(direction.normalize())
      arrow.setLength(Math.min(2.5, length), .25, .14)
    }
  })
  return <>
    <mesh receiveShadow position={[0, -.14, 0]}><boxGeometry args={[9, .28, 10]} /><meshStandardMaterial color="#c5a06a" roughness={.85} /></mesh>
    {Array.from({ length: 9 }, (_, i) => <mesh key={`v${i}`} position={[i - 4, .004, 0]}><boxGeometry args={[.012, .008, 9.5]} /><meshBasicMaterial color="#806243" /></mesh>)}
    {Array.from({ length: 10 }, (_, i) => <mesh key={`h${i}`} position={[0, .004, i - 4.5]}><boxGeometry args={[8.5, .008, .012]} /><meshBasicMaterial color="#806243" /></mesh>)}
    {pieces.map(piece => <group key={`${state!.gameId}-${piece.id}`} ref={g => { if (g) groups.current.set(piece.id, g); else groups.current.delete(piece.id) }}>
      <mesh castShadow receiveShadow position={[0, .15, 0]} onPointerDown={e => {
        if (!enabled || !piece.alive || piece.owner !== actor || e.button !== 0) return
        e.stopPropagation(); gl.domElement.setPointerCapture(e.pointerId)
        aim.current = { piece, end: new Vector3(piece.x, .36, piece.y), gameId: state!.gameId, version: state!.version }
      }}><cylinderGeometry args={[piece.radius, piece.radius * 1.03, .27, 8]} /><meshStandardMaterial color="#f0d5a1" roughness={.65} /></mesh>
      <Label piece={piece} />
    </group>)}
    <primitive object={arrow} />
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
