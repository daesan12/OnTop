import { useEffect } from 'react'
import { useBungeoppang } from '../features/bungeoppang/store'
import { useJumpRope } from '../features/jumpRope/store'
import { useMole } from '../features/mole/store'
import { usePlusMinus } from '../features/plusMinus/store'
import { useRpsRoulette } from '../features/rpsRoulette/store'
import { useShop } from '../features/shop/controller'
import { useSpeedMole } from '../features/speedMole/store'
import { useWardrobe } from '../features/wardrobe/state'
import { useGame } from '../game/store'
import { useSession } from '../network/worldClient'
import { environmentFrame } from '../world/environmentState'
import { playBgm, playSting } from './bgm'
import { parkTrack, resultSting, type BgmTrack } from './bgmScene'

/** 두더지 잡기는 마지막 피버 구간에만 피버 곡, 가위바위보 룰렛·더하기 빼기는 게임방 곡을 함께 쓴다. */
function arcadeTrack(): BgmTrack | null {
  if (useSpeedMole.getState().open) return 'speed-mole-bgm'
  const mole = useMole.getState()
  if (mole.open) return mole.fever ? 'mole-bgm-fever' : 'mole-bgm-normal'
  return useRpsRoulette.getState().open || usePlusMinus.getState().open ? 'arcade-room-bgm' : null
}

/** Picks the park loop on every relevant store change, and once a second for the time of day. */
export function ParkBgm() {
  useEffect(() => {
    const update = () => {
      // 구구구 줄넘기는 카운트다운 무음·GO 이후 반복 같은 자체 BGM을 직접 관리하므로, 창이 열려 있는 동안 공원 곡을 멈춘다.
      // 창을 닫으면 공원 곡은 멈췄던 위치에서 다시 이어진다.
      if (useJumpRope.getState().open) return playBgm(null)
      const session = useSession.getState()
      playBgm(parkTrack({
        game: useGame.getState().game,
        bungeoppang: useBungeoppang.getState().phase !== 'idle',
        arcade: arcadeTrack(),
        shopping: useShop.getState().open || useWardrobe.getState().open,
        telescope: !!session.telescopeId,
        seated: !!session.tableId && session.seatIndex >= 0,
        hour: environmentFrame.hour,
      }))
    }
    update()
    const timer = setInterval(update, 1000)
    const stops = [useGame, useBungeoppang, useMole, useSpeedMole, useRpsRoulette, usePlusMinus, useShop, useWardrobe, useSession, useJumpRope]
      .map(store => store.subscribe(update))
    return () => { clearInterval(timer); stops.forEach(stop => stop()) }
  }, [])

  useEffect(() => {
    // A result already on screen when the park mounts is not replayed; later versions keep the same id.
    let played = useGame.getState().result?.gameSessionId ?? ''
    return useGame.subscribe(({ result }) => {
      if (!result || result.gameSessionId === played) return
      played = result.gameSessionId
      const sting = resultSting(result, useSession.getState().sessionId)
      if (sting) playSting(sting)
    })
  }, [])
  return null
}
