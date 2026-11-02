import { parkRuntime } from '../../park/runtime/runtime'
import { useSession } from '../../network/worldClient'
import { tableEntry } from './tableEntry'
import { useTableLobby } from './state'

/** Available tables seat directly; active/full tables expose the approved watch flow. */
export function interactWithTable(anchorId: string) {
  const session = useSession.getState()
  if (session.tableId) return
  if (session.focusedAnchorId === anchorId && useTableLobby.getState().spectatorStatus === 'waiting'
    && useTableLobby.getState().spectatorRequested) { parkRuntime.closeTable(); return }
  if (tableEntry(anchorId) === 'watch') parkRuntime.inspectTable(anchorId, true)
  else void parkRuntime.joinTable(anchorId)
}
