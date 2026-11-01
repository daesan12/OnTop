import { useEffect } from 'react'
import { useManual } from '../features/manual/manualState'
import { useWardrobe } from '../features/wardrobe/state'
import { useDiceUI } from '../game/farkle/controls'
import { useGame } from '../game/store'
import { useSession } from '../network/worldClient'
import { playSfx, setSfxLoop } from './sfx'
import { gameSfx } from './sfxEvents'
import { useBungeoppang } from '../features/bungeoppang/store'

type Session = ReturnType<typeof useSession.getState>
const ownReady = (s: Session) => !!s.tableStates[s.tableId]?.seats.find(seat => seat.userId === s.sessionId)?.ready

/** Screen cues: buttons, the manual, wallet, wardrobe, table readiness and game updates. */
export function ParkSfx() {
  useEffect(() => {
    const stops = [
      useGame.subscribe((next, prev) => {
        if (next.game === prev.game) return
        for (const cue of gameSfx(prev.game, next.game, useSession.getState().sessionId)) playSfx(cue)
      }),
      useSession.subscribe((next, prev) => {
        const balance = next.account?.balance, before = prev.account?.balance
        // The first read after entry is not income.
        const breadPhase = useBungeoppang.getState().phase
        // 붕어빵 지급음은 결과의 지급 문구가 실제로 보일 때 한 번 재생한다.
        if (balance != null && before != null && balance > before && !['ending', 'result'].includes(breadPhase)) playSfx('coin-gain')
        if (next.tableId && next.tableId === prev.tableId && ownReady(next) && !ownReady(prev)) playSfx('game-ready')
      }),
      useWardrobe.subscribe((next, prev) => {
        if (prev.equipping && !next.equipping && !next.equipError) playSfx('ui-equip')
      }),
      useManual.subscribe((next, prev) => { if (next.open && !prev.open) playSfx('ui-manual') }),
      // The cup rattles for as long as it is held, ready or not.
      useDiceUI.subscribe(next => setSfxLoop('dice-shake', next.cup === 'idle' ? 0 : 1)),
    ]
    const click = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('button, [role="menuitem"], [role="tab"]')) playSfx('ui-click')
    }
    document.addEventListener('click', click, true)
    return () => {
      stops.forEach(stop => stop())
      document.removeEventListener('click', click, true)
      setSfxLoop('dice-shake', 0)
    }
  }, [])
  return null
}
