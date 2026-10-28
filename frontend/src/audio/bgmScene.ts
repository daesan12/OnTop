import { gameState, type Game, type Result } from '../game/protocol'

/** File names under public/audio/bgm, without the .ogg extension. */
export type BgmTrack = 'title' | 'onboarding' | 'park-day' | 'park-dusk' | 'park-night' | 'lobby'
  | 'omok' | 'dice' | 'onecard' | 'bridge' | 'bungeoppang' | 'shop' | 'observatory'
export type BgmSting = 'victory' | 'defeat'

export interface ParkMoment {
  game: Game | null
  bungeoppang: boolean
  shopping: boolean
  telescope: boolean
  seated: boolean
  hour: number
}

/** Same bands as the location chip: 아침·낮 → day, 해질녘 → dusk, 밤·새벽 → night. */
export function parkPeriodTrack(hour: number): BgmTrack {
  if (hour >= 7 && hour < 16) return 'park-day'
  if (hour >= 16 && hour < 19) return 'park-dusk'
  return 'park-night'
}

const gameTrack = (g: Game): BgmTrack => g.omok ? 'omok' : g.dice ? 'dice' : g.onecard ? 'onecard' : 'bridge'

/** First match wins: a live game (played or watched), then the activity on screen, then the park. */
export function parkTrack(m: ParkMoment): BgmTrack {
  if (m.game && gameState(m.game).status === 'PLAYING') return gameTrack(m.game)
  if (m.bungeoppang) return 'bungeoppang'
  if (m.shopping) return 'shop'
  if (m.telescope) return 'observatory'
  if (m.seated) return 'lobby'
  return parkPeriodTrack(m.hour)
}

/** Only a finished game the player took part in has a sting; a draw or void game stays quiet. */
export function resultSting(result: Result, ownId: string): BgmSting | null {
  if (result.status !== 'FINISHED') return null
  const mine = result.participants.find(p => p.userId === ownId)?.result
  if (mine === 'WIN') return 'victory'
  return mine && mine !== 'DRAW' ? 'defeat' : null
}
