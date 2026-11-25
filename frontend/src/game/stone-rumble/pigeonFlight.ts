import type { StonePigeon, StonePigeonImpact, StoneState } from './protocol'

export interface StonePigeonFlight {
  pigeon: StonePigeon
  sampledAt: number
  bornAt: number
  endsAt: number
  impact?: StonePigeonImpact
}

/** 발사·명중도 캐릭터와 같은 표시 시각으로 그린다. 제거 패킷에서 바로 사라지지 않는다. */
export class StonePigeonFlights {
  private game = ''
  private time = -Infinity
  private flights = new Map<number, StonePigeonFlight>()
  current: StonePigeonFlight[] = []

  accept(state: Pick<StoneState, 'gameId' | 'serverTime' | 'startsAt' | 'pigeons' | 'impacts'>) {
    if (state.gameId !== this.game || state.serverTime < this.time || state.serverTime - this.time > 500) this.flights.clear()
    this.game = state.gameId; this.time = state.serverTime
    const active = new Set(state.pigeons.map(p => p.id))
    for (const flight of this.flights.values()) {
      if (!active.has(flight.pigeon.id)) flight.endsAt = Math.min(flight.endsAt, state.serverTime)
    }
    for (const pigeon of state.pigeons) {
      const previous = this.flights.get(pigeon.id)
      const bornAt = pigeon.bornAt ?? previous?.bornAt ?? Math.max(state.startsAt, state.serverTime - 100)
      this.flights.set(pigeon.id, { pigeon, sampledAt: state.serverTime, bornAt, endsAt: bornAt + 1200 })
    }
    for (const impact of state.impacts ?? []) {
      this.flights.set(impact.id, { pigeon: impact, sampledAt: impact.at,
        bornAt: impact.bornAt ?? this.flights.get(impact.id)?.bornAt ?? impact.at,
        endsAt: impact.at, impact })
    }
    for (const [id, flight] of this.flights) if (flight.endsAt < state.serverTime - 500) this.flights.delete(id)
    this.current = [...this.flights.values()].sort((a, b) => a.bornAt - b.bornAt).slice(-16)
  }
}

export function sampleStonePigeon(flight: StonePigeonFlight, time: number, target: { x: number; y: number; z: number }) {
  if (time < flight.bornAt || time >= flight.endsAt) return false
  const seconds = (time - flight.sampledAt) / 1000
  target.x = flight.pigeon.x + flight.pigeon.vx * seconds
  target.y = flight.pigeon.y
  target.z = flight.pigeon.z + flight.pigeon.vz * seconds
  return true
}
