import { CLAP_EMOTE } from '../../config'
export function clapElapsedMs(
  player: {
    connected: boolean
    emote: string
    emoteAt: number
    fitnessId: string
  },
  now: number,
): number | null {
  const age = now - player.emoteAt
  return player.connected &&
    !player.fitnessId &&
    player.emote === 'EMOTE_CLAP' &&
    age >= 0 &&
    age < CLAP_EMOTE.durationMs
    ? age
    : null
}
