import { useShallow } from 'zustand/react/shallow'
import { useSession } from '../../network/worldClient'
import { useManual } from './manualState'

/** Paper utility row for the current channel; world settings live in the dock's 설정 panel. */
export function ManualWorldActions() {
  const open = useManual(s => s.open)
  const session = useSession(useShallow(s => ({ name: s.channelName, count: s.playerCount, capacity: s.capacity })))
  if (!open) return null
  return <p className="manual-world-actions" aria-label="현재 채널">
    현재 채널 <b>{session.name || '채널 선택'}</b> · <b>{session.count}/{session.capacity}</b>
  </p>
}
