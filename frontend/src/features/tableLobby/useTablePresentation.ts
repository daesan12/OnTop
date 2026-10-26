import { useEffect } from 'react'
import type { TableAnchor } from '../../config'
import { useSession } from '../../network/worldClient'
import { renderedTableAnchors } from './tabletAnchors'
import { approvedChairCount, usePreparationPort } from './tabletModel'
import { TABLET_ENABLED } from './tabletFeature'

/** Kept outside TableShell's map-owned picking callback to avoid overlapping edits. */
export function usePresentedChairCount(anchor: TableAnchor) {
  useEffect(() => {
    renderedTableAnchors.set(anchor.id, anchor)
    return () => { if (renderedTableAnchors.get(anchor.id) === anchor) renderedTableAnchors.delete(anchor.id) }
  }, [anchor])
  const table = useSession(s => s.tableStates[s.bindings.find(b => b.channelId === s.roomId && b.anchorId === anchor.id)?.tableId ?? ''])
  const port = usePreparationPort(s => s.port)
  return TABLET_ENABLED ? approvedChairCount(table, table && port ? port.selectedPlayers(table) : null) : 4
}
