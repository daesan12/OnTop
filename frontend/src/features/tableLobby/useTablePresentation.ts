import { useEffect } from 'react'
import type { TableAnchor } from '../../config'
import { useSession } from '../../network/worldClient'
import { renderedTableAnchors } from './tabletAnchors'
import { presentedChairCount, usePreparationPort } from './tabletModel'
import { TABLET_ENABLED } from './tabletFeature'

/** Kept outside TableShell's map-owned picking callback to avoid overlapping edits. */
export function usePresentedChairCount(anchor: TableAnchor) {
  useEffect(() => {
    renderedTableAnchors.set(anchor.id, anchor)
    return () => { if (renderedTableAnchors.get(anchor.id) === anchor) renderedTableAnchors.delete(anchor.id) }
  }, [anchor])
  const port = usePreparationPort(s => s.port)
  return useSession(s => {
    const tableId = s.bindings.find(b => b.channelId === s.roomId && b.anchorId === anchor.id)?.tableId
    // WORLD_STATE carries the same approved count used by channel physics. A full
    // snapshot replaces older HTTP/private-table data, including reset/removal.
    if (s.mapCompatible && s.publicTables !== null) {
      const published = tableId ? s.publicTables[tableId] : undefined
      return published?.anchorId === anchor.id ? published.chairCount : 2
    }
    if (!TABLET_ENABLED) return 4
    if (!s.mapCompatible) return 2
    if (!tableId) return 2
    const table = s.tableStates[tableId]
    const summary = s.tables.find(item => item.tableId === tableId)
    return presentedChairCount(table, summary, table && port ? port.selectedPlayers(table) : null)
  })
}
