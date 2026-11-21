import { COLORS, physical, validMeld, type Color, type Placed, type Rummikub, type Tile } from './protocol'

export type TileDestination = { kind: 'new' } | { kind: 'meld'; index: number; replace?: string } | { kind: 'rack' }
export type JokerRole = { color: Color; number: number }
const ordered = (tiles: Placed[]) => [...tiles].sort((a, b) => a.number - b.number || COLORS.indexOf(a.color) - COLORS.indexOf(b.color))

/** Buttons and physical dragging edit the same draft. Only the server commits a turn. */
export function editTiles(state: Rummikub, draft: Placed[][], hand: Tile[], own: string, ids: string[], destination: TileDestination, joker: JokerRole, inferJoker = false): { melds: Placed[][]; message: string } {
  const reject = (message: string) => ({ melds: draft, message })
  const registered = state.players.find(p => p.userId === own)?.registered === true
  const original = new Set(state.melds.flat().map(t => t.id)), ownIds = new Set(hand.map(t => t.id))
  if (!ids.length || new Set(ids).size !== ids.length) return reject('옮길 타일을 선택하세요.')
  if (!registered && (ids.some(id => original.has(id)) || destination.kind === 'meld' && destination.index < state.melds.length))
    return reject('첫 등록 턴에는 내 손패로만 새 조합을 만드세요.')
  if (destination.kind === 'rack' && ids.some(id => !ownIds.has(id))) return reject('기존 공개 타일은 받침대로 가져올 수 없습니다.')
  if (destination.kind === 'meld' && !draft[destination.index]) return reject('조합이 바뀌었습니다. 다시 선택하세요.')
  const picked: Placed[] = []
  for (const id of ids) {
    const tile = draft.flat().find(t => t.id === id) ?? hand.find(t => t.id === id)
    if (!tile || !physical(id) || !original.has(id) && !ownIds.has(id)) return reject('현재 내 타일과 공개 타일만 옮길 수 있습니다.')
    picked.push(physical(id)?.color === null ? { id, ...joker } : { id, color: tile.color!, number: tile.number })
  }
  const next = draft.map(m => m.filter(t => !ids.includes(t.id)))
  if (destination.kind === 'rack') return { melds: next.filter(m => m.length), message: `${ids.length}개를 받침대로 돌렸습니다.` }
  const target = destination.kind === 'meld' ? next[destination.index]! : []
  // A precise drop onto the matching joker replaces it. Keep that joker on the
  // table in a separate draft meld until it is reused; never return it to a hand.
  const replacement = destination.kind === 'meld' && destination.replace
    ? target.find(t => t.id === destination.replace && physical(t.id)?.color === null) : undefined
  if (registered && replacement && picked.length === 1 && physical(picked[0]!.id)?.color !== null
    && picked[0]!.color === replacement.color && picked[0]!.number === replacement.number && ownIds.has(picked[0]!.id)) {
    next[destination.kind === 'meld' ? destination.index : 0] = target.map(t => t.id === replacement.id ? picked[0]! : t)
    next.push([replacement])
    return { melds: next.filter(m => m.length), message: '조커를 교체했습니다. 테이블의 조커를 이번 턴에 다른 조합으로 옮기세요.' }
  }
  if (inferJoker && picked.length === 1 && physical(picked[0]!.id)?.color === null && target.length) {
    const candidates: Placed[] = []
    for (const color of COLORS) for (let number = 1; number <= 13; number++) {
      const candidate = { id: picked[0]!.id, color, number }
      if (validMeld(ordered([...target, candidate]))) candidates.push(candidate)
    }
    picked[0] = candidates.find(t => t.color === joker.color && t.number === joker.number) ?? candidates[0] ?? picked[0]!
  }
  const meld = ordered([...target, ...picked])
  if (destination.kind === 'new') next.push(meld)
  else next[destination.index] = meld
  return { melds: next.filter(m => m.length), message: `${ids.length}개를 ${destination.kind === 'new' ? '새 조합으로' : `${destination.index + 1}번 조합에`} 옮겼습니다. 조합을 완성한 뒤 턴을 확정하세요.` }
}
