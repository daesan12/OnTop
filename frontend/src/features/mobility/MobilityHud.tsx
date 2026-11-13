import { HOLD_MS, useMobility, vehicles } from './state'
import './mobility.css'

export function MobilityHud() {
  const { phase, target, holdAt, vehicle, notice, total } = useMobility()
  if (notice) return <aside className="mobility-hud" role="status">{notice}</aside>
  if (phase === 'starting') return <aside className="mobility-hud" role="status">탑승 확인 중…</aside>
  if (phase === 'ending') return <aside className="mobility-hud" role="status">하차 확인 중…</aside>
  if (phase === 'riding' && !vehicle) return <aside className="mobility-hud" role="status">
    <kbd>Space</kbd> <kbd>Esc</kbd> 하차 재시도
  </aside>
  if (phase === 'riding' && vehicle) return <aside className="mobility-hud" aria-label="탈것 이용 중">
    <strong>{vehicles[vehicle].label} · 이용 요금 <b>{total}냥</b></strong>
    <span><kbd>Space</kbd> <kbd>Esc</kbd> 하차</span>
  </aside>
  if (!target) return null
  const choice = vehicles[target.vehicle]
  return <aside className="mobility-hud" aria-label={choice.label + ' 대여'}>
    <strong>{choice.label} · <b>{choice.rate}냥/초</b></strong>
    <span className="mobility-hold">
      <span className="mobility-key">
        <svg aria-hidden="true" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="17" />
          {holdAt !== null && <circle key={holdAt} cx="20" cy="20" r="17" pathLength="100"
            className="mobility-progress" style={{ animationDuration: HOLD_MS + 'ms' }} />}
        </svg>
        <kbd>E</kbd>
      </span>
      길게 눌러 탑승
    </span>
  </aside>
}
