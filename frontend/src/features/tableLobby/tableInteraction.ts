import { parkRuntime } from '../../park/runtime/runtime'
import { useSession } from '../../network/worldClient'

/** Tables and chairs share one entry: request a seat from the server. */
export function interactWithTable(anchorId: string) {
  if (useSession.getState().tableId) return
  void parkRuntime.joinTable(anchorId)
}
