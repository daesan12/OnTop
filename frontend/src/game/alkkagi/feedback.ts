import type { Snapshot } from './replay'

export type AlkkagiFeedbackEvent = { id: string; type: string; at: number; pieceId?: string; strength?: 'weak' | 'medium' | 'strong'; winner?: number | null; endReason?: string | null }

/** 외부 효과음은 아직 없다. 실제 승인 상태로부터 팀원이 구독할 이벤트만 만든다. */
export class AlkkagiFeedback {
  private previous: Snapshot | null = null
  private impactId = 0
  reset() { this.previous = null; this.impactId = 0 }
  update(state: Snapshot): AlkkagiFeedbackEvent[] {
    const old = this.previous; this.previous = state
    if (!old || old.gameId !== state.gameId) { this.impactId = state.impacts?.at(-1)?.id ?? 0; return [] }
    const events: AlkkagiFeedbackEvent[] = []
    const emit = (type: string, id: string, pieceId?: string) => events.push({ id: `${state.gameId}:${id}`, type, at: state.serverNow, pieceId })
    if (state.simulationId > old.simulationId) emit('SHOT', `shot:${state.simulationId}`)
    if (state.turnNumber > old.turnNumber) emit('TURN_CHANGED', `turn:${state.turnNumber}`)
    if (state.stage === 'AIMING' && state.turnNumber === old.turnNumber
      && old.turnDeadline - old.serverNow > 5000 && state.turnDeadline - state.serverNow <= 5000) emit('TURN_WARNING', `warning:${state.turnNumber}`)
    if (state.lastItemEffect && state.lastItemEffect.version !== old.lastItemEffect?.version) emit(`ITEM_${state.lastItemEffect.type}`, `item:${state.lastItemEffect.version}`)
    for (const p of state.pieces) if (!p.alive && old.pieces.find(a => a.id === p.id)?.alive) emit('PIECE_FALL', `fall:${p.id}`, p.id)
    for (const impact of state.impacts ?? []) {
      if (impact.id <= this.impactId) continue
      this.impactId = impact.id
      if (state.serverNow - impact.at > 500) continue
      events.push({ id: `${state.gameId}:impact:${impact.id}`, type: impact.kind === 'WALL' ? 'WALL_HIT' : 'PIECE_HIT',
        at: impact.at, strength: impact.impulse < 2 ? 'weak' : impact.impulse < 8 ? 'medium' : 'strong' })
    }
    if (state.stage === 'FINISHED' && old.stage !== 'FINISHED') events.push({ id: `${state.gameId}:finished`, type: 'GAME_FINISHED',
      at: state.endedAt ?? state.serverNow, winner: state.winner, endReason: state.endReason })
    return events
  }
}
