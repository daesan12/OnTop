import { useShallow } from 'zustand/react/shallow'
import type { QualityPreset } from '../../config/quality'
import { useSession } from '../../network/worldClient'
import { QualityControl } from '../../performance/QualityControl'
import { LookSensitivityControl } from '../../world/LookSensitivityControl'
import { useManual } from './manualState'

/** Paper utility row for the current channel and world settings. */
export function ManualWorldActions({ quality, onQuality }: {
  quality: QualityPreset
  onQuality: (value: QualityPreset) => void
}) {
  const open = useManual(s => s.open)
  const session = useSession(useShallow(s => ({ name: s.channelName, count: s.playerCount, capacity: s.capacity })))
  if (!open) return null
  return <section className="manual-world-actions" aria-label="공원 설정">
    <span>현재 채널 <b>{session.name || '채널 선택'}</b> · <b>{session.count}/{session.capacity}</b></span>
    <QualityControl quality={quality} onQuality={onQuality} />
    <LookSensitivityControl />
  </section>
}
