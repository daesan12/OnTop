import { stoneCueDistance, type StoneCue, type StoneListener } from './feedback'
import type { StoneState } from './protocol'

/** 서버 상태의 변화만 사용한다. 같은 외곽 한 줄/갱신에서 무너지는 발판은 하나로 묶는다. */
export class StoneActionTracker {
  private previous?: StoneState
  private enabled = false
  private warned = new Set<string>()
  private crumbleAt = -Infinity
  private cracked = new Set<string>()
  private steps = new Map<string, number>()
  private jumpOrigins = new Map<string, { y: number; floor: number; at: number }>()
  reset() { this.previous = undefined; this.enabled = false; this.warned.clear(); this.cracked.clear(); this.steps.clear(); this.jumpOrigins.clear(); this.crumbleAt = -Infinity }
  read(state: StoneState, enabled: boolean, listener?: StoneListener): StoneCue[] {
    const before = this.previous
    if (before?.gameId === state.gameId && enabled && this.enabled && state.serverTime <= before.serverTime) return []
    if (before?.gameId !== state.gameId) { this.warned.clear(); this.cracked.clear(); this.steps.clear(); this.crumbleAt = -Infinity }
    const continuous = enabled && this.enabled && before?.gameId === state.gameId
      && state.serverTime > before.serverTime && state.serverTime - before.serverTime <= 1000
    if (!continuous) this.jumpOrigins.clear()
    const cues: StoneCue[] = [], view = listener ?? state.players[0]!
    const fresh = (at: number) => at > 0 && at <= state.serverTime && state.serverTime - at <= 250
    const global = (kind: 'cloud' | 'ring-warning', at: number): StoneCue => ({ kind, userId: 'arena', at, x: view.x, y: view.y, z: view.z })
    if (continuous && state.phase === 'DROPPING' && before.phase === 'LOADING' && fresh(state.landsAt - 1200))
      cues.push(global('cloud', state.landsAt - 1200))
    if (continuous && (state.phase === 'RUNNING' || state.phase === 'COUNTDOWN' || state.phase === 'FINISHED')) {
      for (const player of state.players) {
        const old = before.players.find(p => p.userId === player.userId)
        if (!old) continue
        // control 응답은 높이 변화보다 grounded=false를 먼저 보낼 수 있다. 최근 접지 높이에서 실제 상승한 한 번만 점프다.
        const origin = this.jumpOrigins.get(player.userId)
        if (state.phase !== 'FINISHED' && old.alive && player.alive && !player.grounded && origin
          && player.floor === origin.floor && state.serverTime - origin.at <= 300 && player.y > origin.y + .02) {
          this.jumpOrigins.delete(player.userId)
          const jump: StoneCue = { kind: 'jump', userId: player.userId, at: state.serverTime, x: player.x, y: player.y, z: player.z }
          if (Math.abs(player.y - view.y) < 2 && stoneCueDistance(jump, view) < 8) cues.push(jump)
        }
        const at = player.slideStartedAt
        if (player.alive && at > old.slideStartedAt && fresh(at))
          cues.push({ kind: 'slide', userId: player.userId, at, x: player.x, y: player.y + .5, z: player.z })
        if (old.alive && !player.alive && fresh(player.eliminatedAt))
          cues.push({ kind: 'eliminated', userId: player.userId, at: player.eliminatedAt, x: player.x, y: player.y, z: player.z })
      }
    }
    if (state.phase === 'RUNNING') {
      // 발자국은 접지된 서버 좌표의 칸 전환/착지에서만 발생한다. 공중 이동과 입력 예측은 제외한다.
      if (continuous) for (const player of state.players) {
        const old = before.players.find(p => p.userId === player.userId)
        const cell = (n: number) => Math.floor(n / 2.6 + .5)
        if (!old || !old.alive || !player.alive || !player.grounded || Math.abs(player.y - view.y) > 2
          || state.serverTime - (this.steps.get(player.userId) ?? -Infinity) < 200) continue
        if (old.grounded && old.floor === player.floor && cell(old.x) === cell(player.x) && cell(old.z) === cell(player.z)) continue
        const tile = state.tiles.find(t => t.floor === player.floor && t.q === cell(player.x) && t.r === cell(player.z))
        if (!tile || tile.breakAt <= state.serverTime) continue
        const cue: StoneCue = { kind: 'step', userId: player.userId, at: state.serverTime, x: player.x, y: player.y, z: player.z }
        if (stoneCueDistance(cue, view) < 8) { cues.push(cue); this.steps.set(player.userId, state.serverTime) }
      }
      const imminent = new Map<string, number>()
      let nearest: StoneCue | undefined, crack: StoneCue | undefined
      for (const tile of state.tiles) {
        if (tile.stepped && tile.breakAt > state.serverTime && tile.breakAt - state.serverTime <= 350) {
          const key = `${tile.id}:${tile.breakAt}`
          const cue: StoneCue = { kind: 'crack', userId: 'arena', at: tile.breakAt - 350, x: tile.q * 2.6, y: tile.floor * 12, z: tile.r * 2.6 }
          if (continuous && !this.cracked.has(key) && Math.abs(cue.y - view.y) < 2 && stoneCueDistance(cue, view) < 8
            && (!crack || stoneCueDistance(cue, view) < stoneCueDistance(crack, view))) crack = cue
          this.cracked.add(key)
        }
        if (!tile.stepped && tile.breakAt > state.serverTime && tile.breakAt - state.serverTime <= 1200) {
          const key = `${tile.floor}:${Math.max(Math.abs(tile.q), Math.abs(tile.r))}:${tile.breakAt}`
          imminent.set(key, tile.breakAt)
        }
        if (!continuous || state.serverTime - this.crumbleAt < 160 || !fresh(tile.breakAt)) continue
        const old = before.tiles[tile.id]
        if (old?.id !== tile.id || old.breakAt <= before.serverTime || tile.breakAt > state.serverTime) continue
        const cue: StoneCue = { kind: 'collapse', userId: 'arena', at: tile.breakAt, x: tile.q * 2.6, y: tile.floor * 12, z: tile.r * 2.6 }
        if (!nearest || stoneCueDistance(cue, view) < stoneCueDistance(nearest, view)) nearest = cue
      }
      if (crack) cues.push(crack)
      // 복구 직후 이미 진행 중인 경고는 새로 울리지 않는다.
      for (const [key, at] of imminent) {
        if (continuous && !this.warned.has(key) && !cues.some(c => c.kind === 'ring-warning')) cues.push(global('ring-warning', at))
        this.warned.add(key)
      }
      if (nearest && stoneCueDistance(nearest, view) < 18) { cues.push(nearest); this.crumbleAt = state.serverTime }
    }
    for (const player of state.players) {
      if (player.alive && player.grounded) this.jumpOrigins.set(player.userId, { y: player.y, floor: player.floor, at: state.serverTime })
      else {
        const origin = this.jumpOrigins.get(player.userId)
        if (!player.alive || origin && (state.serverTime - origin.at > 300 || player.y < origin.y - .02)) this.jumpOrigins.delete(player.userId)
      }
    }
    this.previous = state; this.enabled = enabled
    return cues
  }
}
