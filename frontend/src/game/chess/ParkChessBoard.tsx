import { useShallow } from 'zustand/react/shallow'
import { useSession } from '../../network/worldClient'
import { useGame } from '../store'
import { useTableGameCode } from '../../features/tableLobby/tableGamePresentation'
import type { TableAnchor } from '../../park/tablePlacement'
import { OMOK_FOCUS_LAYER } from '../../world/omokCamera'
import { FocusWood } from '../omok/BoardWood'
import { useOmokEvents } from '../omok/spectatorEvents'
import { ChessBoardScene } from './ChessBoard3D'
import { CHESS_BOARD_SCALE, CHESS_BOARD_Y } from './camera'
import { useChessControls } from './parkControls'
import { checkedKingSquare } from './moveHints'

const INITIAL_BOARD = 'RNBQKBNRPPPPPPPP................................pppppppprnbqkbnr'

/** Uses the existing table anchor and common park renderer; adds no map coordinates or colliders. */
export function ParkChessBoard({ anchor }: { anchor: TableAnchor }) {
  const session = useSession(useShallow(s => ({ bindings: s.bindings, roomId: s.roomId, tableId: s.tableId, watchedTableId: s.watchedTableId })))
  const game = useGame(s => s.game?.chess ? s.game : null)
  const selected = useTableGameCode(anchor.id) === 'CHESS'
  const binding = session.bindings.find(b => b.channelId === session.roomId && b.anchorId === anchor.id)
  const relevant = !!game && !!binding && (game.role === 'PLAYER' ? session.tableId : session.watchedTableId) === binding.tableId
  if (!selected && !relevant) return null
  return relevant ? <LiveBoard /> : <group position={[0, CHESS_BOARD_Y, 0]} scale={CHESS_BOARD_SCALE} name="chess-waiting-board">
    <ChessBoardScene board={INITIAL_BOARD} blackView={false} selected="" destinations={[]} pings={[]} disabled />
  </group>
}

function LiveBoard() {
  const { game, c, state, ui, looking, connected, disabled, choose } = useChessControls()
  const pings = useOmokEvents(s => s.pings)
  if (!game || !c) return null
  const focused = c.status === 'PLAYING' && !state.lastResult && !looking
  return <>
    <mesh name="chess-focus-surface" visible={focused} layers-mask={1 << OMOK_FOCUS_LAYER}
      position={[0, 1.06, 0]} rotation-x={-Math.PI / 2} raycast={() => {}}>
      <planeGeometry args={[14, 14]} /><FocusWood />
    </mesh>
    <group position={[0, CHESS_BOARD_Y, 0]} scale={CHESS_BOARD_SCALE} name="chess-world-board">
      <ChessBoardScene board={c.board} blackView={false} selected={ui.selected} checkedSquare={checkedKingSquare(c)} gameId={game.gameId} moves={c.moves}
        animateMoves={connected && !looking && !state.uncertain && state.recovery === 'RESTORED' && c.status === 'PLAYING'}
        destinations={c.legalMoves.filter(move => move.from === ui.selected).map(move => move.to)} lastMove={c.moves.at(-1)}
        pings={pings.filter(p => p.gameId === game.gameId).map(p => p.y * 8 + p.x)} disabled={disabled}
        onSquare={choose} layer={focused ? OMOK_FOCUS_LAYER : 0} />
    </group>
  </>
}
