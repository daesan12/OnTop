import { CARRY_ESCAPE_PRESSES } from './escape'

/** The same alternating keyboard cue for being carried and breaking out of ice. */
export function CarryEscapeHint({ action = '내려오기', onPress }: {
  action?: string; onPress?: (key: 'A' | 'D') => void
}) {
  return <span role="status" className="carry-escape-hint" aria-label={`A와 D를 번갈아 ${CARRY_ESCAPE_PRESSES}회 눌러 ${action}`}>
    <span className="carry-escape-hint__keys">
      {onPress ? <button type="button" aria-label="A 입력" onClick={() => onPress('A')}><kbd data-key="A">A</kbd></button>
        : <kbd data-key="A">A</kbd>}
      <span aria-hidden="true">↔</span>
      {onPress ? <button type="button" aria-label="D 입력" onClick={() => onPress('D')}><kbd data-key="D">D</kbd></button>
        : <kbd data-key="D">D</kbd>}
    </span>
  </span>
}
