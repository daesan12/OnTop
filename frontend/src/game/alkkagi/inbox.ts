import type { Snapshot } from './replay'

/** 승인 응답 직후 남아 있던 옛 프레임이 손패/조작 화면을 잠깐 되돌리지 않게 한다. */
export class AlkkagiInbox {
  private seq = -1
  private state: Snapshot | null = null
  private acknowledged = 0
  reset() { this.seq = -1; this.state = null; this.acknowledged = 0 }
  ack(gameId: string, version: number) {
    if (this.state?.gameId === gameId && Number.isSafeInteger(version)) this.acknowledged = Math.max(this.acknowledged, version)
  }
  publicState(seq: number, state: Snapshot) {
    if (!Number.isSafeInteger(seq) || seq <= this.seq) return false
    this.seq = seq
    if (state.gameId === this.state?.gameId && state.version < Math.max(this.acknowledged, this.state.version)) return false
    if (state.gameId !== this.state?.gameId) this.acknowledged = 0
    this.state = state
    return true
  }
  privateState(seq: number, gameId: string, version: number) {
    return seq === this.seq && this.state?.gameId === gameId && this.state.version === version && version >= this.acknowledged
  }
}
