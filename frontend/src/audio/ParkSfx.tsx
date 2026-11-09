import { useEffect } from 'react'
import { useManual } from '../features/manual/manualState'
import { useWardrobe } from '../features/wardrobe/state'
import { useDiceUI } from '../game/farkle/controls'
import { useGame } from '../game/store'
import { estimatedServerTime, useSession } from '../network/worldClient'
import { playSfx, preloadSfx, setSfxLoop } from './sfx'
import { alkkagiCues, gameSfx } from './sfxEvents'
import { AlkkagiFeedback, type AlkkagiFeedbackEvent } from '../game/alkkagi/feedback'
import { useBungeoppang } from '../features/bungeoppang/store'
import { consumeWalletRewardSoundLevel } from '../features/wallet/settlementRefresh'

type Session = ReturnType<typeof useSession.getState>
const ownReady = (s: Session) => !!s.tableStates[s.tableId]?.seats.find(seat => seat.userId === s.sessionId)?.ready

/** Screen cues: buttons, the manual, wallet, wardrobe, table readiness and game updates. */
export function ParkSfx() {
  useEffect(() => {
    const alkkagi = new AlkkagiFeedback()
    const stops = [
      useGame.subscribe((next, prev) => {
        if (next.game === prev.game) return
        // 할리갈리 상태에 들어오면 종소리를 미리 디코드한다. 캐시된 뒤에는 조회만 하고, 잠금 해제 전이면 다음 갱신에서 다시 시도한다.
        if (next.game?.halli) preloadSfx('halli-bell')
        for (const cue of gameSfx(prev.game, next.game, useSession.getState().sessionId, estimatedServerTime())) playSfx(cue)
        // 경기를 떠났다가 같은 경기를 다시 보더라도 그 사이 변화를 한꺼번에 재생하지 않는다.
        if (next.game?.alkkagi) for (const [cue, level] of alkkagiCues(alkkagi.update(next.game.alkkagi))) playSfx(cue, undefined, level)
        else alkkagi.reset()
      }),
      useSession.subscribe((next, prev) => {
        const balance = next.account?.balance, before = prev.account?.balance
        // The first read after entry is not income.
        const breadPhase = useBungeoppang.getState().phase
        // 붕어빵 지급음은 결과의 지급 문구가 실제로 보일 때 한 번 재생한다.
        if (balance !== before) {
          const level = consumeWalletRewardSoundLevel(next.sessionId)
          if (balance != null && before != null && balance > before && !['ending', 'result'].includes(breadPhase))
            playSfx('coin-gain', undefined, level)
        }
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
      const target = event.target instanceof Element ? event.target.closest('button, [role="menuitem"], [role="tab"]') : null
      // 가위바위보 룰렛·더하기 빼기 게임기의 버튼은 오락기 버튼 소리로 바꾼다.
      if (target) playSfx(target.closest('.rps-roulette, .plus-minus') ? 'arcade-button' : 'ui-click')
    }
    // 게임판이 내 알을 집어 조준을 시작할 때 보내는 이벤트(AlkkagiBoard).
    const alkkagiSelect = (event: Event) => {
      if ((event as CustomEvent<AlkkagiFeedbackEvent>).detail?.type === 'PIECE_SELECTED') playSfx('alkkagi-select')
    }
    document.addEventListener('click', click, true)
    window.addEventListener('alkkagi:feedback', alkkagiSelect)
    return () => {
      stops.forEach(stop => stop())
      document.removeEventListener('click', click, true)
      window.removeEventListener('alkkagi:feedback', alkkagiSelect)
      setSfxLoop('dice-shake', 0)
    }
  }, [])
  return null
}
