import { Suspense, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { ParkRuntimeView } from '../../park/runtime/ParkRuntime'
import type { ParkRuntimePort } from '../../park/runtime/contracts'
import { ParkChat } from '../../features/chat/ParkChat'
import { ManualHost } from '../../features/manual/ManualHost'
import { useSession } from '../../network/worldClient'
import { useGame } from '../store'
import { OmokSpectatorEvents, useOmokEvents } from '../omok/spectatorEvents'
import { FocusWood } from '../omok/BoardWood'
import { QuoridorHud } from './QuoridorPanel'
import { QuoridorScene } from './QuoridorScene'
import { useQuoridorControls, useQuoridorUI } from './controls'
import { BOARD_Y, cellPoint, wallPoint, playerGoal, sameWall } from './presentation'
import { QUORIDOR_FOV, quoridorCamera, quoridorCameraPose, quoridorViewport, quoridorYaw } from './camera'
import type { Quoridor, QuoridorInput, Wall } from './protocol'
import '../../styles.css'
import '../../park/park.css'
import '../../park/scene.css'
import '../../features/parkMenus/hud.css'
import '../gameHudLayout.css'

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('로컬 입체 보드 검수 전용입니다.')
const params = new URLSearchParams(location.search), spectator = params.get('role') === 'spectator', count = params.get('players') === '2' ? 2 : 4
const gameId = 'preview-gilmok', own = spectator ? '505' : '101'
const board: Quoridor = { gameCode: 'QUORIDOR', boardSize: 9, version: 1, status: 'PLAYING', turnUserId: '101', turnDeadline: null,
  players: (count === 4 ? [[4, 0, 'SOUTH'], [8, 4, 'WEST'], [4, 8, 'NORTH'], [0, 4, 'EAST']] : [[4, 0, 'SOUTH'], [4, 8, 'NORTH']])
    .map(([x, y, goal], i) => ({ userId: String((i + 1) * 101), x: Number(x), y: Number(y), goal: goal as Quoridor['players'][number]['goal'], wallsRemaining: count === 4 ? (i === 3 ? 5 : 4) : (i === 0 ? 9 : 8), active: true })),
  walls: [{ x: 2, y: 2, orientation: 'HORIZONTAL' }, { x: 5, y: 2, orientation: 'VERTICAL' }, { x: 6, y: 5, orientation: 'HORIZONTAL' }],
  legalMoves: [{ x: 3, y: 0 }, { x: 5, y: 0 }, { x: 4, y: 1 }], legalWalls: [], winnerUserIds: [], endReason: null, endedAt: null }
// 표시·픽킹 검수용으로 첫 행동 한 번만 제공한다. 실제 규칙·경로 검증은 서버 엔진의 책임이다.
for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) for (const orientation of ['HORIZONTAL', 'VERTICAL'] as const) {
  const wall = { x, y, orientation }
  if (!board.walls.some(p => p.orientation === orientation ? orientation === 'HORIZONTAL'
    ? p.y === y && Math.abs(p.x - x) < 2 : p.x === x && Math.abs(p.y - y) < 2 : p.x === x && p.y === y)) board.legalWalls.push(wall)
}
useSession.setState({ status: 'connected', roomId: 'preview', sessionId: own, tableId: spectator ? '' : 'preview-table', seatIndex: spectator ? -1 : 0,
  mapCompatible: true, pending: false, profiles: Object.fromEntries([['101','길목 하나'],['202','길목 둘'],['303','길목 셋'],['404','길목 넷'],['505','훈수 할아버지']]
    .map(([id,nickname]) => [id,{ nickname, nicknameKnown: true }])) as never,
  tableStates: { 'preview-table': { tableId: 'preview-table', gameCode: 'QUORIDOR', seats: [], betAmountPerPlayer: 0 } } as never })
useGame.setState({ game: { gameId, version: 1, role: spectator ? 'SPECTATOR' : 'PLAYER', quoridor: board }, start: null,
  pending: false, uncertain: false, recovery: 'RESTORED', permittedGameId: spectator ? '' : gameId, watchedGameId: spectator ? gameId : '',
  awaitingVersion: 1, error: '', result: null, lastResult: null })
const feed = new OmokSpectatorEvents({
  scope: () => { const g = useGame.getState().game; return g?.quoridor?.status === 'PLAYING'
    ? { key: `preview/${spectator}`, gameId, version: g.version, role: g.role, canSend: true, pingBoardSize: 9 } : null },
  displayName: id => id === '505' ? '훈수 할아버지' : '길목 하나',
  request: async (type, payload) => { const now = Date.now(); return { requestId: null,
    type: type === 'OMOK_SPECTATOR_PING_SEND' ? 'OMOK_SPECTATOR_PING' : 'GAME_SPECTATOR_CHAT_MESSAGE',
    payload: { ...payload, senderUserId: own, sentAt: now, serverNow: now, expiresAt: now + (type === 'OMOK_SPECTATOR_PING_SEND' ? 2000 : 3000) } } },
})
feed.sync()
const previewNow = Date.now()
feed.accept({ type: 'GAME_SPECTATOR_CHAT_MESSAGE', requestId: null, payload: { gameId, eventId: crypto.randomUUID(),
  senderUserId: '505', text: '가운데 길을 막아봐요!', sentAt: previewNow, serverNow: previewNow, expiresAt: previewNow + 3000 } })
const act = async (input: QuoridorInput) => {
  const g = useGame.getState().game, state = g?.quoridor
  if (spectator || !g || !state || state.status !== 'PLAYING' || state.turnUserId !== own) return false
  if (input.kind === 'move' && !state.legalMoves.some(p => p.x === input.x && p.y === input.y)) return false
  if (input.kind === 'wall' && !state.legalWalls.some(p => sameWall(p, input))) return false
  const next = structuredClone(state); next.version++; next.turnUserId = '202'
  if (input.kind === 'move') Object.assign(next.players[0], { x: input.x, y: input.y })
  else { next.walls.push({ x: input.x, y: input.y, orientation: input.orientation }); next.players[0].wallsRemaining-- }
  next.legalMoves = []; next.legalWalls = []
  useGame.setState({ game: { ...g, version: next.version, quoridor: next } }); feed.sync(); return true
}
const runtime = { actQuoridor: act, pingOmok: (x: number, y: number) => feed.send('ping', { x, y }),
  sendChat: (text: string) => feed.send('chat', text), sendSpectatorChat: (text: string) => feed.send('chat', text),
  sendTyping: async () => false, checkRecovery: async () => true,
  unwatchGame: async () => { useGame.setState({ game: null, watchedGameId: '' }); feed.reset(); return true },
  forfeitGame: async () => { useGame.setState({ error: '로컬 보드 프리뷰에서는 정산·기권을 전송하지 않습니다.' }); return false },
} as unknown as ParkRuntimePort

function PreviewBoard() {
  const c = useQuoridorControls(), pings = useOmokEvents(s => s.pings), { camera, gl, size } = useThree()
  useFrame(() => {
    if (!c.focused) {
      camera.position.set(0, BOARD_Y + 1.2, 2.6); camera.up.set(0, 1, 0); camera.lookAt(0, BOARD_Y, 0); camera.updateMatrixWorld()
      quoridorCamera.ready = false
      return
    }
    const frame = quoridorCameraPose(size.width, size.height, 1, quoridorYaw(c.player && c.board ? playerGoal(c.board, own) : undefined), quoridorViewport)
    camera.position.set(frame.position[0], BOARD_Y + .05 + frame.position[1], frame.position[2])
    camera.up.set(0, 1, 0); camera.lookAt(frame.target[0], BOARD_Y + .05 + frame.target[1], frame.target[2]); camera.updateMatrixWorld()
    quoridorCamera.gameId = gameId; quoridorCamera.ready = true
  })
  useEffect(() => {
    const project = (position: [number,number,number]) => { const p = new Vector3(position[0], BOARD_Y + position[1], position[2]).project(camera), rect = gl.domElement.getBoundingClientRect()
      return { x: rect.left + (p.x + 1) / 2 * rect.width, y: rect.top + (1 - p.y) / 2 * rect.height } }
    Object.assign(window, { gilmokBoardPreview: { cell: (x: number,y: number) => project(cellPoint({x,y})), wall: (wall: Wall) => {const p = wallPoint(wall);p[1]=.04;return project(p)},
      state: () => useGame.getState().game?.quoridor, ready: () => quoridorCamera.ready,
      view: () => ({ insets: { ...quoridorViewport }, position: camera.position.toArray() }) } })
  }, [camera, gl])
  return <>
    <mesh position={[0, BOARD_Y - .071, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow raycast={() => {}}><planeGeometry args={[14,14]} /><FocusWood /></mesh>
    <group position={[0, BOARD_Y, 0]}><QuoridorScene state={c.board ?? null} ownId={own} canAct={c.canAct} spectator={c.canPing} wallMode={c.ui.wallMode}
      orientation={c.ui.orientation} selected={c.ui.selected} hover={c.ui.hover} pings={pings}
      labelYaw={quoridorYaw(c.player && c.board ? playerGoal(c.board, own) : undefined)}
      onMove={cell => void act({kind:'move',...cell})} onPing={cell => void runtime.pingOmok(cell.x,cell.y)}
      onSelect={selected => useQuoridorUI.setState({selected})} onHover={hover => useQuoridorUI.setState({hover})} /></group>
  </>
}
function Preview() {
  return <ParkRuntimeView runtime={runtime}><main className="park-page" style={{height:'100dvh',background:'#6d5038'}}>
    <Canvas shadows aria-label="길목 한 수 입체 게임판" camera={{fov:QUORIDOR_FOV,position:[0,3,2]}} gl={{antialias:true,preserveDrawingBuffer:true}} dpr={[1,2]}>
      <color attach="background" args={['#6d5038']} /><hemisphereLight args={['#fff2db','#69503a',1.3]} />
      <directionalLight position={[-3,6,4]} intensity={2.4} castShadow shadow-mapSize={[2048,2048]} shadow-camera-left={-3} shadow-camera-right={3} shadow-camera-top={3} shadow-camera-bottom={-3} shadow-normalBias={.002} />
      <Suspense fallback={null}><PreviewBoard /></Suspense>
    </Canvas>
    <QuoridorHud runtime={runtime} /><ParkChat /><ManualHost />
    <aside className="qr-preview-notice" title="독립 메모리 fixture · 실제 공원·인증·서버 미연결 · 첫 행동 한 번만 제공">로컬 3D 프리뷰 · 서버 미연결
      <a href="?players=2">2인</a><a href="?players=4">4인</a><a href="?role=spectator">관전</a><button onClick={() => location.reload()}>초기화</button>
    </aside>
  </main></ParkRuntimeView>
}
createRoot(document.getElementById('root')!).render(<Preview />)
