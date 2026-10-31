import { parkRuntime } from '../../park/runtime/runtime'
import { useSession } from '../../network/worldClient'
import { bindAnchor } from '../../network/tableBindings'

/** Available tables seat directly; active/full tables expose the approved watch flow. */
export function interactWithTable(anchorId: string) {
  const session = useSession.getState()
  if (session.tableId) return
  const tableId = bindAnchor(session.bindings, session.roomId, anchorId, session.tables.map(t => t.tableId))
  const table = session.tables.find(t => t.tableId === tableId)
  if (table?.joinable === false) parkRuntime.inspectTable(anchorId, table.status === 'PLAYING')
  else void parkRuntime.joinTable(anchorId)
}
