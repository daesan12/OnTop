import coinImage from '../../assets/entry/yeopjeon-icon.webp'
import { HOLD_MS, useMobility, vehicles } from './state'
import './mobility.css'

const formatCoins = new Intl.NumberFormat('ko-KR')

function RentalRate({ amount, perSecond = false }: { amount: number; perSecond?: boolean }) {
  return <span className="mobility-hud__rate">
    <img src={coinImage} alt="" />
    <strong>{formatCoins.format(amount)}냥</strong>{perSecond && <span>/초</span>}
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
  return <aside className="mobility-hud" aria-label={choice.label + ' 대여'} aria-keyshortcuts="E"
    data-holding={holdAt !== null ? 'true' : undefined}>
    <div className="mobility-hud__summary">
      <strong className="mobility-hud__title">{choice.label}</strong>
      <RentalRate amount={choice.rate} perSecond />
    </div>
    <div className="mobility-hud__controls">
      <span className="mobility-hud__hold">
        <svg aria-hidden="true" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="17" />
          {holdAt !== null && <circle key={holdAt} cx="20" cy="20" r="17" pathLength="100"
            className="mobility-progress" style={{ animationDuration: HOLD_MS + 'ms' }} />}
        </svg>
        <kbd>E</kbd>
      </span>
      <span>{holdAt === null ? '길게 눌러 탑승' : '계속 눌러주세요'}</span>
    </div>
  </aside>
}
