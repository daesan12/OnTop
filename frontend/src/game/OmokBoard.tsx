import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import {
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Matrix4,
  MeshStandardMaterial,
  SphereGeometry,
  type Group,
  type InstancedMesh,
} from 'three'
import { useShallow } from 'zustand/react/shallow'
import { GOMOKU, type TableAnchor } from '../config'
import { useSession } from '../network/worldClient'
import { canPlace, useGame } from './store'
import { parkRuntime } from '../park/runtime/runtime'
import { omokCamera } from './cameraState'
import { omokCell, stonePoint, OMOK_SIZE, OMOK_SPACING as spacing, OMOK_HALF as half } from './omokPresentation'

// App-lifetime shared geometry/material cache. No per-frame React state or per-stone mesh.
const stoneGeometry = new SphereGeometry(0.039, 12, 8)
const blackMaterial = new MeshStandardMaterial({
  color: '#101717',
  roughness: 0.3,
})
const whiteMaterial = new MeshStandardMaterial({
  color: '#f3eee2',
  roughness: 0.3,
})
const woodMaterial = new MeshStandardMaterial({
  color: '#b7894d',
  roughness: 0.8,
})
const woodGeometry = new BoxGeometry(1.48, 0.05, 1.48)
const noRaycast = () => {} // Three line threshold is too wide for 9cm grid cells; pick the board surface.
const blackPreview = blackMaterial.clone(), whitePreview = whiteMaterial.clone()
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
  const selected =
    !!binding && session.tableStates[binding.tableId]?.gameCode === 'OMOK'
  const relevant =
    !!game &&
    !!binding &&
    (start?.tableId === binding.tableId || session.tableId === binding.tableId ||
      (game.role === 'SPECTATOR' && session.watchedTableId === binding.tableId))
  if (!selected && !relevant) return null
  return <OmokSurface anchor={anchor} game={relevant ? game : null} />
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
    return relevant && session.status === 'connected' && !session.pending && omokCamera.ready
      && omokCamera.anchorId === anchor.id && canPlace(session.sessionId, x, y)
  }
  const grid = useMemo(() => {
    const vertices: number[] = []
    for (let i = 0; i < OMOK_SIZE; i++) {
      const a = -half + i * spacing
      vertices.push(-half, 0, a, half, 0, a, a, 0, -half, a, 0, half)
    }
    return new BufferGeometry().setAttribute(
      'position',
      new Float32BufferAttribute(vertices, 3),
    )
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
    <group
      ref={root}
      position={[0, GOMOKU.boardY, 0]}
      name={'omok-board-' + anchor.id}
      onPointerDown={(event) => {
        const g = useGame.getState().game, point = cell(event)
        press.current =
          event.button === 0 && point && g && playable(point.x, point.y)
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
        } else clearHover()
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
        if (point && point.x === down.x && point.y === down.y && playable(point.x, point.y)) {
          clearHover()
          void parkRuntime.placeOmok(point.x, point.y)
        }
      }}
    >
      <mesh
        geometry={woodGeometry}
        material={woodMaterial}
        position={[0, -0.026, 0]}
        dispose={null}
      />
      <lineSegments
        geometry={grid}
        position={[0, 0.001, 0]}
        raycast={noRaycast}
      >
        <lineBasicMaterial color="#3e2c1b" />
      </lineSegments>
      {[3, 7, 11].flatMap(x => [3, 7, 11].map(y => <mesh key={`${x}-${y}`}
        position={[x * spacing - half, 0.002, y * spacing - half]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <circleGeometry args={[0.008, 8]} /><meshBasicMaterial color="#3e2c1b" />
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
        <ringGeometry args={[0.012, 0.018, 16]} /><meshBasicMaterial color="#e88b37" />
      </mesh>}
      <group ref={hover} name="omok-hover" visible={false}>
        <mesh geometry={stoneGeometry} material={game?.omok.turnUserId === game?.omok.whiteUserId ? whitePreview : blackPreview}
          scale={[1, 0.42, 1]} raycast={noRaycast} dispose={null} />
        <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
          <ringGeometry args={[0.035, 0.041, 20]} /><meshBasicMaterial color="#62a375" depthTest={false} />
        </mesh>
      </group>
    </group>
  )
}
