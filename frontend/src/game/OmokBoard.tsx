import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import {
  BufferGeometry,
  BoxGeometry,
  Float32BufferAttribute,
  Matrix4,
  type Group,
  type InstancedMesh,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { useShallow } from 'zustand/react/shallow'
import { type TableAnchor } from '../config'
import { useSession } from '../network/worldClient'
import { canPlaceDisplayed as canPlace, useDisplayGame as useGame } from './displayGame'
import {practiceAction} from '../ai-park/practiceActions'
import { parkRuntime } from '../park/runtime/runtime'
import { omokCamera } from './cameraState'
import { canShowForbiddenMarks, omokCell, stonePoint, OMOK_SIZE, OMOK_BOARD_Y, OMOK_SPACING as spacing, OMOK_HALF as half } from './omokPresentation'
import { GomokuAssets, stoneGeometry, blackStoneMaterial as blackMaterial, whiteStoneMaterial as whiteMaterial } from './omok/GomokuAssets'
import { FocusWood } from './omok/BoardWood'
import { OMOK_FOCUS_LAYER } from '../world/omokCamera'
import { seatScope, useTableLobby } from '../features/tableLobby/state'
import { useOmokEvents } from './omok/spectatorEvents'
import { OmokPings } from './omok/OmokFeedback'
import { panelOwnsKeys } from '../world/inputOwnership'
import { BoardCoordinates } from './omok/BoardCoordinates'
import { ForbiddenMarks } from './omok/ForbiddenMarks'
import { useTableGameCode } from '../features/tableLobby/tableGamePresentation'

const noRaycast = () => {} // Three line threshold is too wide for 9cm grid cells; pick the board surface.
const blackPreview = blackMaterial.clone(), whitePreview = whiteMaterial.clone()
const previewGuide = new BufferGeometry().setAttribute('position', new Float32BufferAttribute([
  -.057, 0, 0, -.043, 0, 0, .043, 0, 0, .057, 0, 0,
  0, 0, -.057, 0, 0, -.043, 0, 0, .043, 0, 0, .057,
], 3))
for (const material of [blackPreview, whitePreview]) {
  material.transparent = true
  material.opacity = 0.5
  material.depthWrite = false
}

export function OmokBoard({ anchor }: { anchor: TableAnchor }) {
  const session = useSession(
    useShallow((s) => ({
      bindings: s.bindings,
      roomId: s.roomId,
      tableStates: s.tableStates,
      tableId: s.tableId,
      watchedTableId: s.watchedTableId,
    })),
  )
  const game = useGame((s) => s.game?.omok ? s.game : null),
    start = useGame((s) => s.start)
  const binding = session.bindings.find(
    (b) => b.channelId === session.roomId && b.anchorId === anchor.id,
  )
  const selected = useTableGameCode(anchor.id) === 'OMOK'
  const relevant =
    !!game &&
    !!binding &&
    (start?.tableId === binding.tableId || session.tableId === binding.tableId ||
      (game.role === 'SPECTATOR' && session.watchedTableId === binding.tableId))
  if (!selected && !relevant) return null
  // 대기 관전 중 판 재질을 처음 읽어도 공원 전체를 Suspense로 숨기지 않는다.
  return <Suspense fallback={null}><OmokSurface anchor={anchor} game={relevant ? game : null} /></Suspense>
}
function OmokSurface({
  anchor,
  game,
}: {
  anchor: TableAnchor
  game: import('./protocol').OmokGame | null
}) {
  const relevant = !!game
  const board = relevant ? game.omok.board : null
  const root = useRef<Group>(null),
    black = useRef<InstancedMesh>(null),
    white = useRef<InstancedMesh>(null),
    hover = useRef<Group>(null)
  const press = useRef<{ gameId: string; version: number; x: number; y: number } | null>(null)
  const canvas = useThree(s => s.gl.domElement)
  const ownsCursor = useRef(false)
  const connected = useSession(s => s.status === 'connected'), pending = useSession(s => s.pending)
  const scope = useSession(seatScope)
  const seatIndex = useSession(s => s.seatIndex)
  const ownId = useSession(s => s.sessionId)
  const blackAtSouth = useSession(s => {
    const table = s.tableStates[s.tableId || s.watchedTableId]
    const seat = table?.seats.find(seat => seat.userId === game?.omok.blackUserId)?.seatNumber
    return seat ? seat === 1 : game?.role === 'PLAYER' ? (s.sessionId === game.omok.blackUserId) === (s.seatIndex === 0) : true
  })
  const spectatorView = useTableLobby(s => s.spectatorView)
  const focused = game?.omok.status === 'PLAYING' && (game.role === 'PLAYER' ? !!scope : spectatorView === 'board')
  // 반대 좌석의 탑뷰도 A1이 좌상단이다. 돌·미리보기·핑·피킹을 함께 회전한다.
  const reversed = game?.role === 'PLAYER' && focused && seatIndex === 1
  useLayoutEffect(() => {
    root.current?.traverse(object => {
      if (focused) object.layers.enable(OMOK_FOCUS_LAYER)
      else object.layers.disable(OMOK_FOCUS_LAYER)
    })
  }, [focused, game])
  useLayoutEffect(() => {
    const instances = [black.current!, white.current!]
    return () => instances.forEach(mesh => mesh.dispose())
  }, [])
  const blocked = useGame(s => s.pending || s.uncertain || s.recovery !== 'RESTORED' || (s.game?.version ?? -1) < s.awaitingVersion)
  const clearHover = useCallback(() => {
    if (hover.current) hover.current.visible = false
    if (ownsCursor.current) { canvas.style.cursor = ''; ownsCursor.current = false }
  }, [canvas])
  useLayoutEffect(() => {
    press.current = null
    clearHover()
    return clearHover
  }, [game, connected, pending, blocked, clearHover])
  const cell = (event: ThreeEvent<PointerEvent | MouseEvent>) => {
    const p = root.current?.worldToLocal(event.point.clone())
    return p ? omokCell(p.x, p.z) : null
  }
  const playable = (x: number, y: number) => {
    const session = useSession.getState()
    return !panelOwnsKeys() && relevant && session.status === 'connected' && !session.pending && omokCamera.ready
      && omokCamera.anchorId === anchor.id && canPlace(session.sessionId, x, y)
  }
  const pingable = () => !useGame.getState().localPractice && relevant && game?.role === 'SPECTATOR' && game.omok.status === 'PLAYING'
    && useSession.getState().status === 'connected' && useOmokEvents.getState().canSend && !panelOwnsKeys()
    && omokCamera.ready && omokCamera.anchorId === anchor.id
  const grid = useMemo(() => {
    const strips: BufferGeometry[] = []
    for (let i = 0; i < OMOK_SIZE; i++) {
      const a = -half + i * spacing
      strips.push(new BoxGeometry(2 * half + .003, .0015, .003).translate(0, 0, a),
        new BoxGeometry(.003, .0015, 2 * half + .003).translate(a, 0, 0))
    }
    const merged = mergeGeometries(strips, false)!
    strips.forEach(strip => strip.dispose())
    return merged
  }, [])
  useEffect(() => () => grid.dispose(), [grid])
  useLayoutEffect(() => {
    if (!black.current || !white.current) return
    const matrix = new Matrix4()
    let b = 0,
      w = 0
    board?.forEach((row, y) =>
      row.forEach((stone, x) => {
        if (!stone) return
        matrix
          .makeScale(1, 0.42, 1)
          .setPosition(...stonePoint(x, y))
        if (stone === 1) black.current!.setMatrixAt(b++, matrix)
        else white.current!.setMatrixAt(w++, matrix)
      }),
    )
    black.current.count = b
    white.current.count = w
    black.current.instanceMatrix.needsUpdate = true
    white.current.instanceMatrix.needsUpdate = true
    black.current.computeBoundingSphere()
    white.current.computeBoundingSphere()
  }, [board])
  return (
    <>
    {/* Original local presentation backdrop: roofs cannot obstruct a resized top view. */}
    <mesh name={'omok-focus-surface-' + anchor.id} visible={focused} layers-mask={1 << OMOK_FOCUS_LAYER}
      position={[0, OMOK_BOARD_Y - .12, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
      <planeGeometry args={[14, 14]} />
      <FocusWood />
    </mesh>
    <group
      ref={root}
      position={[0, OMOK_BOARD_Y, 0]}
      rotation={[0, reversed ? Math.PI : 0, 0]}
      name={'omok-board-' + anchor.id}
      onPointerDown={(event) => {
        const g = useGame.getState().game, point = cell(event)
        press.current =
          event.button === 0 && point && g && (playable(point.x, point.y) || pingable())
            ? { gameId: g.gameId, version: g.version, ...point }
            : null
      }}
      onPointerMove={(event) => {
        const point = cell(event)
        if (point && hover.current && playable(point.x, point.y)) {
          hover.current.position.set(...stonePoint(point.x, point.y))
          hover.current.visible = true
          canvas.style.cursor = 'pointer'
          ownsCursor.current = true
        } else {
          clearHover()
          if (point && pingable()) { canvas.style.cursor = 'pointer'; ownsCursor.current = true }
        }
      }}
      onPointerOut={clearHover}
      onClick={(event) => {
        event.stopPropagation()
        const g = useGame.getState().game,
          down = press.current
        press.current = null
        if (
          event.button !== 0 || event.delta >= 5 ||
          !omokCamera.ready ||
          omokCamera.anchorId !== anchor.id ||
          !g ||
          !relevant ||
          !down ||
          down.gameId !== g.gameId ||
          down.version !== g.version ||
          !root.current
        )
          return
        const point = cell(event)
        if (point && point.x === down.x && point.y === down.y && (playable(point.x, point.y) || pingable())) {
          clearHover()
          if (g.role === 'SPECTATOR') void parkRuntime.pingOmok(point.x, point.y)
          else if(useGame.getState().localPractice) void practiceAction('place',point)
          else void parkRuntime.placeOmok(point.x, point.y)
        }
      }}
    >
      <GomokuAssets blackAtSouth={blackAtSouth} reverseSupplies={reversed} />
      <BoardCoordinates />
      {focused && canShowForbiddenMarks(game, ownId)
        && !!game?.omok.forbiddenMoves?.length && <ForbiddenMarks points={game.omok.forbiddenMoves}/>}
      {game && <OmokPings gameId={game.gameId} focused={focused} />}
      {/* Decorations never pick cells; keep the approved grid's original local coordinates. */}
      <mesh name="omok-pick-surface" position={[0, 0.0005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.4, 1.4]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh name="omok-grid"
        geometry={grid}
        position={[0, 0.0015, 0]}
        raycast={noRaycast}
      >
        <meshBasicMaterial color="#28170c" />
      </mesh>
      {[3, 7, 11].flatMap(x => [3, 7, 11].map(y => <mesh key={`${x}-${y}`}
        position={[x * spacing - half, 0.002, y * spacing - half]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <circleGeometry args={[0.009, 8]} /><meshBasicMaterial color="#49301f" />
      </mesh>))}
      <instancedMesh
        ref={black}
        args={[stoneGeometry, blackMaterial, 225]}
        dispose={null}
      />
      <instancedMesh
        ref={white}
        args={[stoneGeometry, whiteMaterial, 225]}
        dispose={null}
      />
      {game?.omok.lastMove && <mesh name="omok-last-move" raycast={noRaycast}
        position={[game.omok.lastMove.x * spacing - half, 0.038, game.omok.lastMove.y * spacing - half]}
        rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.014, 0.019, 4, 1, Math.PI / 4]} /><meshBasicMaterial color="#e88b37" />
      </mesh>}
      <group ref={hover} name="omok-hover" visible={false}>
        <mesh geometry={stoneGeometry} material={game?.omok.turnUserId === game?.omok.whiteUserId ? whitePreview : blackPreview}
          scale={[1, 0.42, 1]} raycast={noRaycast} dispose={null} />
        <lineSegments name="omok-preview-guide" position={[0, .018, 0]} raycast={noRaycast}>
          <primitive object={previewGuide} attach="geometry" dispose={null} />
          <lineBasicMaterial color="#f2d7ad" depthTest={false} />
        </lineSegments>
      </group>
    </group>
    </>
  )
}
