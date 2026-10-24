import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
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
const spacing = GOMOKU.boardSpan / 14,
  half = GOMOKU.boardSpan / 2
const noRaycast = () => {} // Three line threshold is too wide for 9cm grid cells; pick the board surface.

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
  const game = useGame((s) => s.game),
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
  game: ReturnType<typeof useGame.getState>['game']
}) {
  const relevant = !!game
  const board = relevant ? game.omok.board : null
  const root = useRef<Group>(null),
    black = useRef<InstancedMesh>(null),
    white = useRef<InstancedMesh>(null)
  const press = useRef<{ gameId: string; version: number } | null>(null)
  const grid = useMemo(() => {
    const vertices: number[] = []
    for (let i = 0; i < 15; i++) {
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
          .setPosition(x * spacing - half, 0.019, y * spacing - half)
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
      onPointerDown={() => {
        const g = useGame.getState().game
        press.current =
          g && omokCamera.ready && omokCamera.anchorId === anchor.id
            ? { gameId: g.gameId, version: g.version }
            : null
      }}
      onClick={(event) => {
        event.stopPropagation()
        const g = useGame.getState().game,
          down = press.current
        press.current = null
        if (
          event.delta >= 5 ||
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
        const p = root.current.worldToLocal(event.point.clone()),
          x = Math.round((p.x + half) / spacing),
          y = Math.round((p.z + half) / spacing)
        const own = useSession.getState()
        if (own.status === 'connected' && canPlace(own.sessionId, x, y))
          void parkRuntime.placeOmok(x, y)
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
    </group>
  )
}
