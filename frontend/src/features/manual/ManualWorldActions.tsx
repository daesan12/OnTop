import { useShallow } from 'zustand/react/shallow'
import type { QualityPreset } from '../../config/quality'
import { useSession } from '../../network/worldClient'
import { QualityControl } from '../../performance/QualityControl'
import { LookSensitivityControl } from '../../world/LookSensitivityControl'
import { resetManual, useManual } from './manualState'

/** Original paper utility row, using the existing Spring session/logout callbacks. */
export function ManualWorldActions({ quality, onQuality, onExit }: {
  quality: QualityPreset
  onQuality: (value: QualityPreset) => void
  onExit: () => void
}) {
  const open = useManual(s => s.open)
  const session = useSession(useShallow(s => ({ name: s.channelName, count: s.playerCount, capacity: s.capacity })))
  if (!open) return null
  return <section className="manual-world-actions" aria-label="공원 설정">
    <span>현재 채널 <b>{session.name || '채널 선택'}</b> · <b>{session.count}/{session.capacity}</b></span>
    <QualityControl quality={quality} onQuality={onQuality} />
    <LookSensitivityControl />
    <button onClick={() => { resetManual(); onExit() }}>나가기</button>
  </section>
}
