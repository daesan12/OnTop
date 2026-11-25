import { STONE_RENDER_DELAY } from './motion'
import type { StoneCue } from './feedback'

/** 한 RAF에서 도착한 사건을 묶는다. 서버 사건과 보간된 비둘기·몸의 표시 시각을 맞춘다. */
export class StoneFeedbackTimeline {
  private game = ''
  private time = -Infinity
  private pending = new Map<string, { cue: StoneCue; due: number }>()
  get size() { return this.pending.size }
  reset() { this.pending.clear(); this.game = ''; this.time = -Infinity }

  accept(game: string, serverTime: number, cues: readonly StoneCue[], now: number, ownId?: string) {
    if (game !== this.game || serverTime < this.time || serverTime - this.time > 500) this.pending.clear()
    this.game = game; this.time = serverTime
    for (const cue of cues) this.pending.set(`${cue.kind}:${cue.userId}:${cue.at}`, {
      cue, due: now + (cue.kind === 'fire' && cue.userId === ownId ? 0
        : Math.max(0, cue.at - serverTime + STONE_RENDER_DELAY)),
    })
  }

  drain(now: number) {
    const due: StoneCue[] = []
    for (const [key, item] of this.pending) {
      if (now < item.due) continue
      this.pending.delete(key)
      if (now - item.due <= 250) due.push(item.cue)
    }
    return due
  }
}
