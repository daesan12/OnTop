import { parkRuntime } from '../../park/runtime/runtime'
import { useSession } from '../../network/worldClient'
import { bindAnchor } from '../../network/tableBindings'

/** Available tables seat directly; active/full tables expose the approved watch flow. */
export function interactWithTable(anchorId: string) {
  const session = useSession.getState()
  if (session.tableId) return
  const tableId = bindAnchor(session.bindings, session.roomId, anchorId, session.tables.map(t => t.tableId))
  const table = session.tables.find(t => t.tableId === tableId)
  if (table?.joinable === false) {
    if (table.status === 'PLAYING') parkRuntime.inspectTable(anchorId, true)
  }
  else void parkRuntime.joinTable(anchorId)
}
