import { useEffect } from 'react'
import { useBungeoppang } from '../features/bungeoppang/store'
import { useShop } from '../features/shop/controller'
import { useWardrobe } from '../features/wardrobe/state'
import { useGame } from '../game/store'
import { useSession } from '../network/worldClient'
import { environmentFrame } from '../world/environmentState'
import { playBgm, playSting } from './bgm'
import { parkTrack, resultSting } from './bgmScene'

/** Picks the park loop on every relevant store change, and once a second for the time of day. */
export function ParkBgm() {
  useEffect(() => {
    const update = () => {
      const session = useSession.getState()
      playBgm(parkTrack({
        game: useGame.getState().game,
        bungeoppang: useBungeoppang.getState().phase !== 'idle',
        shopping: useShop.getState().open || useWardrobe.getState().open,
        telescope: !!session.telescopeId,
        seated: !!session.tableId && session.seatIndex >= 0,
        hour: environmentFrame.hour,
      }))
    }
    update()
    const timer = setInterval(update, 1000)
    const stops = [useGame, useBungeoppang, useShop, useWardrobe, useSession].map(store => store.subscribe(update))
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
