import coinImage from '../../assets/entry/yeopjeon-icon.webp'
import { HOLD_MS, rentalCapability, useMobility, vehicles } from './state'
import { useParkXR } from '../parkXR/state'
import './mobility.css'

const formatCoins = new Intl.NumberFormat('ko-KR')

function RentalRate({ amount }: { amount: number }) {
  return <span className="mobility-hud__rate">
    <img src={coinImage} alt="" />
    <strong>{formatCoins.format(amount)}냥</strong>
  </span>
}

function DismountKeys({ retry = false }: { retry?: boolean }) {
  return <div className="mobility-hud__controls">
    <kbd>Space</kbd>
    <kbd className="mobility-hud__secondary-key">Esc</kbd>
    <span>{retry ? '하차 재시도' : '하차'}</span>
  </div>
}

export function MobilityHud() {
  const { phase, target, holdAt, vehicle, notice, total } = useMobility()
  const immersive = useParkXR(s => s.phase === 'active' || s.phase === 'ending')
  if (immersive) return null
  if (notice || phase === 'starting' || phase === 'ending') {
    const message = notice || (phase === 'starting' ? '탑승 확인 중…' : '하차 확인 중…')
    return <aside className="mobility-hud mobility-hud--message" role="status">{message}</aside>
  }
  if (phase === 'riding') {
    return <aside className="mobility-hud mobility-hud--riding" aria-label="탈것 이용 중"
      aria-keyshortcuts="Space Escape">
      {vehicle && <div className="mobility-hud__summary">
        <strong className="mobility-hud__title">{vehicles[vehicle].label}</strong>
        <span className="mobility-hud__total">
          <span>이용 요금</span>
          <RentalRate amount={total} />
        </span>
      </div>}
      <DismountKeys retry={!vehicle} />
    </aside>
  }
  if (!target) return null
  const choice = vehicles[target.vehicle]
  return <aside className="park-interaction" data-target-kind="rental"
    aria-label={choice.label + ' 대여'} aria-keyshortcuts="E">
    <span className="mobility-rental-key">
      <kbd>E</kbd>
      <svg aria-hidden="true" viewBox="0 0 40 40">
        <circle className="mobility-rental-track" cx="20" cy="20" r="17" />
        {holdAt !== null && <circle key={holdAt} cx="20" cy="20" r="17" pathLength="100"
          className="mobility-progress" style={{ animationDuration: HOLD_MS + 'ms' }} />}
      </svg>
    </span>
    <span className="mobility-rental-copy">
      <strong>{choice.label} 대여{rentalCapability.available ? ` · ${choice.rate}냥/초` : ''}</strong>
      <small>{!rentalCapability.available ? '현재 대여 불가' : holdAt === null ? '길게 눌러 탑승' : '계속 눌러주세요'}</small>
    </span>
  </aside>
}
