import { HallIcon } from './serviceHall/Icons'
import './gameTools.css'

export function GameTools({ onPause, onHelp, onRestart, disabled = false, helpLabel = '게임 이용 안내', restartLabel = '다시 시작 요청' }: { onPause?: () => void; onHelp: () => void; onRestart?: () => void; disabled?: boolean; helpLabel?: string; restartLabel?: string }) {
  return <nav className="skewer-game-tools" aria-label="게임 도구">
    {onPause ? <button aria-label="일시정지" disabled={disabled} onClick={onPause}><HallIcon name="pause" /></button> : null}
    <button aria-label={helpLabel} disabled={disabled} onClick={onHelp}><HallIcon name="help" /></button>
    {onRestart ? <button aria-label={restartLabel} disabled={disabled} onClick={onRestart}><HallIcon name="reset" /></button> : null}
  </nav>
}
