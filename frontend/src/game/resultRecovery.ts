import { record } from '../network/protocol'

// The game this tab played, scoped to tab/account. A hint only: the history REST response and
// GAME_RESULT_CHECK decide what may be shown. Never authority for seats, input or results.
const prefix = 'ontop.game.result-candidate.v1:'
const key = (owner: string) => prefix + encodeURIComponent(owner)
const storedId = (v: unknown): v is string => typeof v === 'string' && /^[1-9][0-9]{0,18}$/.test(v)

export function readTabGame(owner: string) {
  try {
    const value = owner ? sessionStorage.getItem(key(owner)) : null
    return storedId(value) ? value : ''
  } catch { return '' }
}
export function keepTabGame(owner: string, gameId: string) {
  try {
    if (owner && storedId(gameId)) sessionStorage.setItem(key(owner), gameId)
    else if (owner) sessionStorage.removeItem(key(owner))
  } catch { /* Storage restrictions only disable automatic recovery for this tab. */ }
}
/** Logout or an ended login forgets every account's hint in this tab. */
export function forgetTabGames() {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const name = sessionStorage.key(i)
      if (name?.startsWith(prefix)) sessionStorage.removeItem(name)
    }
  } catch { /* Nothing was stored. */ }
}
/** Most recent own FINISHED/INVALID game from GET /api/v1/users/me/games?size=1 (DB ID order). */
export function latestEndedGame(body: unknown) {
  if (!record(body) || !Array.isArray(body.items)) throw new Error('경기 내역 응답을 확인할 수 없습니다.')
  const item: unknown = body.items[0]
  if (item === undefined) return ''
  if (!record(item) || !storedId(item.gameSessionId) || !['FINISHED', 'INVALID'].includes(String(item.status)))
    throw new Error('경기 내역 응답을 확인할 수 없습니다.')
  return item.gameSessionId
}
