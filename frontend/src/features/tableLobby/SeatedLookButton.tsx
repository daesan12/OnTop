import { useSession } from '../../network/worldClient'
import { resetSeatedLook, seatScope, useTableLobby } from './state'

export function SeatedLookButton() {
  const scope = useSession(s => seatScope(s)), current = useTableLobby(s => s.lookScope)
  if (!scope) return null
  return <button aria-pressed={current === scope} onClick={() => {
    if (current === scope) resetSeatedLook()
    else useTableLobby.setState({ lookScope: scope })
  }}>{current === scope ? '판으로 돌아가기' : '주변 둘러보기'}</button>
}
