import { useShallow } from 'zustand/react/shallow'
import { useSession } from '../../network/worldClient'
import type { TableAnchor } from '../../park/tablePlacement'
import { useTableGameCode } from '../../features/tableLobby/tableGamePresentation'
import { parkRuntime } from '../../park/runtime/runtime'
import { OMOK_FOCUS_LAYER } from '../../world/omokCamera'
import { FocusWood } from '../omok/BoardWood'
import { useOmokEvents } from '../omok/spectatorEvents'
import { useGame } from '../store'
import { useQuoridorControls, useQuoridorUI } from './controls'
import { quoridorCamera, quoridorCameraActive, quoridorYaw } from './camera'
import { BOARD_Y, playerGoal } from './presentation'
import { QuoridorScene } from './QuoridorScene'

/** 최신 TableShell의 로컬 기준만 사용한다. 시설 앵커·충돌·맵 계약은 변경하지 않는다. */
export function ParkQuoridorBoard({ anchor }: { anchor: TableAnchor }) {
  const session = useSession(useShallow(s => ({ bindings: s.bindings, roomId: s.roomId, tableId: s.tableId, watchedTableId: s.watchedTableId })))
  const game = useGame(s => s.game?.quoridor ? s.game : null)
  const selected = useTableGameCode(anchor.id) === 'QUORIDOR'
  const binding = session.bindings.find(b => b.channelId === session.roomId && b.anchorId === anchor.id)
  const relevant = !!game && !!binding && (game.role === 'PLAYER' ? session.tableId : session.watchedTableId) === binding.tableId
  if (!selected && !relevant) return null
  return relevant ? <LiveBoard /> : <group position={[0, BOARD_Y, 0]}><QuoridorScene state={null} /></group>
}
function LiveBoard() {
  const c = useQuoridorControls(), hasResult = useGame(s => !!s.lastResult)
  const pings = useOmokEvents(s => s.pings)
  const focused = c.focused && quoridorCameraActive(c.board?.status, hasResult, !c.player)
  const ready = () => quoridorCamera.ready && quoridorCamera.gameId === c.game?.gameId
  return <>
    <mesh name="quoridor-focus-table" visible={focused} layers-mask={1 << OMOK_FOCUS_LAYER}
      position={[0, BOARD_Y - .071, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}} receiveShadow>
      <planeGeometry args={[14, 14]} /><FocusWood />
    </mesh>
    <group position={[0, BOARD_Y, 0]}>
      <QuoridorScene state={c.board ?? null} ownId={c.session.sessionId} canAct={c.canAct} spectator={c.canPing}
        wallMode={c.ui.wallMode} orientation={c.ui.orientation} selected={c.ui.selected} hover={c.ui.hover}
        layer={focused ? OMOK_FOCUS_LAYER : 0} pings={pings.filter(p => p.gameId === c.game?.gameId)}
        labelYaw={quoridorYaw(c.player && c.board ? playerGoal(c.board, c.session.sessionId) : undefined)}
        onSelect={wall => { if (ready() && c.canAct) useQuoridorUI.setState({ selected: wall }) }}
        onHover={hover => useQuoridorUI.setState({ hover })}
        onOrientationChange={orientation => useQuoridorUI.setState({ orientation, selected: null, hover: null })}
        onMove={cell => { if (ready() && c.canAct) void parkRuntime.actQuoridor?.({ kind: 'move', ...cell }) }}
        onPlace={wall => { if (ready() && c.canAct) void parkRuntime.actQuoridor?.({ kind: 'wall', ...wall }) }}
        onPing={cell => { if (ready() && c.canPing) void parkRuntime.pingOmok(cell.x, cell.y) }} />
    </group>
  </>
}
