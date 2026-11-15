import { parkRuntime } from '../../park/runtime/runtime'
import { useSession } from '../../network/worldClient'
import { STONE_RUMBLE_ANCHOR_ID } from '../../game/stone-rumble/entrance'
import { STONE_RUMBLE_ENABLED } from './model'
import { tableEntry } from './tableEntry'
import { useTableLobby } from './state'

/** Available tables seat directly; active/full tables expose the approved watch flow. */
export function interactWithTable(anchorId: string) {
  const session = useSession.getState()
  if (session.tableId || (anchorId === STONE_RUMBLE_ANCHOR_ID && !STONE_RUMBLE_ENABLED)) return
  if (session.focusedAnchorId === anchorId && useTableLobby.getState().spectatorStatus === 'waiting'
    && useTableLobby.getState().spectatorRequested) { parkRuntime.closeTable(); return }
  if (tableEntry(anchorId) === 'watch') parkRuntime.inspectTable(anchorId, true)
  else void parkRuntime.joinTable(anchorId)
}
