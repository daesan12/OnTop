import { parkRuntime } from '../../park/runtime/runtime'
import { TABLET_ENABLED } from './tabletFeature'
import { useSession } from '../../network/worldClient'

/** The primary chair/table action seats; public information remains an explicit secondary action. */
export function interactWithTable(anchorId: string) {
  if (TABLET_ENABLED) {
    if (useSession.getState().tableId) return
    void parkRuntime.joinTable(anchorId)
  }
  else parkRuntime.inspectTable(anchorId)
}
