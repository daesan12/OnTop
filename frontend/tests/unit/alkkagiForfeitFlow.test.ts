import { readFileSync } from 'node:fs'
import { afterEach, expect, it } from 'vitest'
import { receive, resetWorld, useSession } from '../../src/network/worldClient'
import type { Envelope, TableState } from '../../src/network/protocol'
import { receiveGame, resetGame, tableBusy, useGame } from '../../src/game/store'
import { resetForfeit } from '../../src/game/forfeit'
import { getGathering, returnToWaiting } from '../../src/features/tableLobby/gathering'
import { canLeaveByMovement } from '../../src/features/tableLobby/model'

// Captured from AlkkagiForfeitFlowTests: authenticated sockets on a random local port, memory ledger only.
const wire = JSON.parse(readFileSync(new URL('../fixtures/alkkagi-forfeit.json', import.meta.url), 'utf8')) as {
  initial: Envelope; initialStart: Envelope; ended: Envelope; debris: Envelope; waiting: Envelope
  result: Envelope; left: Envelope; trace: Envelope[]; rejoined: Envelope; configured: Envelope; nextStart: Envelope; nextGame: Envelope; advanced: Envelope; nextRecovery: Record<string,unknown>
}
afterEach(() => { resetWorld(); resetGame(); resetForfeit() })

it('accepts the red host forfeit sequence and lets the green winner return to waiting and stand', () => {
  resetWorld('connected'); resetGame(); resetForfeit()
  const table = wire.trace.find(m => m.type === 'TABLE_STATE')!.payload as unknown as TableState
  const version = String(wire.debris.payload.mapVersion)
  useSession.setState({ sessionId: '202', status: 'connected', roomId: String(wire.debris.payload.channelId),
    tableId: table.tableId, seatIndex: 1, mapCompatible: true, mapVersion: version,
    tableStates: { [table.tableId]: table }, tables:[{tableId:table.tableId,capacity:table.capacity,
      occupiedSeats:table.seats.filter(s=>s.userId).length,availableSeats:table.capacity-table.seats.filter(s=>s.userId).length,
      joinable:true,gameCode:table.gameCode,betAmountPerPlayer:table.betAmountPerPlayer,status:'WAITING'}], bindings: [{ channelId: String(wire.debris.payload.channelId),
      tableId: table.tableId, anchorId: String((wire.debris.payload.items as {anchorId:string}[])[0].anchorId) }] })
  useGame.setState({ recovery: 'RESTORED' })
  const accept = (m: Envelope) => {
    receive(m, version)
    receiveGame(m, '202', useSession.getState().tableId)
  }
  accept(wire.initialStart); accept(wire.initial)
  expect(useGame.getState().game?.alkkagi?.status).toBe('PLAYING')
  for (const message of wire.trace) expect(() => accept(message)).not.toThrow()
  accept(wire.waiting); accept(wire.result)
  expect(useGame.getState().lastResult?.participants.find(p => p.userId === '202')?.result).toBe('WIN')
  expect(tableBusy()).toBe(false)
  expect(getGathering()?.canReturn).toBe(true)
  returnToWaiting()
  expect(useGame.getState().recovery).toBe('LOBBY')
  expect(canLeaveByMovement(useSession.getState().tableStates[table.tableId], '202', useGame.getState())).toBe(true)
  accept(wire.left)
  expect(useSession.getState().tableId).toBe('')
  expect(useGame.getState().uncertain).toBe(false)
  accept(wire.rejoined); accept(wire.configured)
  expect(useSession.getState().tableId).toBe(table.tableId)
  accept(wire.nextStart)
  accept({requestId:null,type:'GAME_CONNECTION_STATE',payload:wire.nextRecovery})
  accept(wire.nextGame)
  const next=useGame.getState()
  expect(next.game?.gameId).not.toBe(wire.initial.payload.gameId)
  expect(next.game?.gameId).toBe(wire.nextGame.payload.gameId)
  expect(next.game?.alkkagi?.stage).toBe('AIMING')
  expect(next.permittedGameId).toBe(next.game?.gameId)
  expect(next.recovery).toBe('RESTORED')
  expect(next.pending || next.uncertain).toBe(false)
  expect(next.lastResult).toBeNull()
  expect(next.game?.alkkagi?.walls).toEqual([])
  expect(next.game?.alkkagiHand?.cards).toEqual([])
  // An old settled result cannot reopen the previous round after the next match starts.
  accept(wire.result)
  expect(useGame.getState().lastResult).toBeNull()
  expect(useGame.getState().game?.gameId).toBe(next.game?.gameId)
  accept(wire.advanced)
  expect(useGame.getState().game?.alkkagi?.simulationId).toBe(1)
})
