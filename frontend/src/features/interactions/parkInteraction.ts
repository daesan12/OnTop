import { FITNESS, FITNESS_STATIONS, GOMOKU, TABLES, tableScale } from '../../config'
import { avatars, useSession } from '../../network/worldClient'
import { tableBusy } from '../../game/store'
import { parkRuntime } from '../../park/runtime/runtime'
import { panelOwnsKeys, roamingInput } from '../../world/inputOwnership'
import { benchAnchors } from './benchAnchors'
import { useBenchState } from './benchState'
import { benchService } from './benchService'
import { sitBench } from './benchController'
import { interactionScore } from './interactionAim'
import { useFitnessState } from '../fitness/state'
import { fitnessService } from '../fitness/service'
import { enterFitness } from '../fitness/controller'
import { canReachFitness } from '../fitness/anchors'

export interface ParkInteraction {
  kind: 'bench' | 'table' | 'fitness'
  id: string
  label: string
  seat?: 0 | 1
  occupied: boolean
  available: boolean
  score: number
  distance: number
  occupant?: string
}
/** One fresh selection path for both the on-screen hint and E/click. */
export function getParkInteraction(): ParkInteraction | null {
  const session = useSession.getState(), benches = useBenchState.getState(), fitness = useFitnessState.getState()
  const p = avatars.get(session.sessionId)
  if (!roamingInput.ready || !p || session.status !== 'connected' || !session.mapCompatible || session.tableId || p.seatIndex >= 0
    || p.fitnessId || p.swimming || session.pending || benches.pending || fitness.pending
    || tableBusy() || panelOwnsKeys()) return null
  const choices: ParkInteraction[] = []
  for (const station of FITNESS_STATIONS) {
    if (!canReachFitness(p.current, station.id)) continue
    const occupant = Object.values(fitness.placements).find(lease => lease.channelId === session.roomId && lease.stationId === station.id)
    const distance = Math.hypot(p.current.x - station.position[0], p.current.z - station.position[2])
    choices.push({ kind: 'fitness', id: station.id, label: `${station.name} 이용하기`, occupied: !!occupant,
      occupant: occupant ? avatars.get(occupant.userId)?.nickname ?? '이웃' : undefined,
      available: fitnessService.mode !== 'unavailable', distance,
      score: interactionScore(distance, { x: station.position[0], y: station.position[1] + FITNESS.handleHeight, z: station.position[2] }) })
  }
  for (const bench of benchAnchors) {
    const distance = Math.hypot(p.current.x - bench.position[0], p.current.z - bench.position[2])
    if (distance > bench.radius || Math.abs(p.current.y - bench.position[1] - 0.8) > bench.heightTolerance) continue
    const taken = new Set(Object.values(benches.placements)
      .filter(lease => lease.channelId === session.roomId && lease.benchId === bench.id).map(lease => lease.seat))
    const available = ([0, 1] as const).filter(seat => !taken.has(seat))
    for (const seat of available.length ? available : [undefined]) {
      const pose = bench.seats[seat ?? 0]!
      choices.push({ kind: 'bench', id: bench.id, seat, label: '벤치에 앉기', occupied: seat === undefined,
        available: benchService.mode !== 'unavailable', distance,
        score: interactionScore(distance, { x: pose.x, y: pose.y - 0.2, z: pose.z }) })
    }
  }
  for (const table of TABLES) {
    const distance = Math.hypot(p.current.x - table.position[0], p.current.z - table.position[2])
    if (distance > GOMOKU.interactionRadius * tableScale(table)
      || Math.abs(p.current.y - table.position[1] - 0.8) > 0.7) continue
    choices.push({ kind: 'table', id: table.id, label: '테이블 정보 보기', occupied: false, available: true,
      distance, score: interactionScore(distance, { x: table.position[0], y: table.position[1] + 0.65, z: table.position[2] }) })
  }
  return choices.filter(c => Number.isFinite(c.score)).sort((a, b) => a.score - b.score || a.distance - b.distance
    || a.id.localeCompare(b.id) || (a.seat ?? 2) - (b.seat ?? 2))[0] ?? null
}
export function interactWithPark(): boolean {
  const target = getParkInteraction()
  if (!target) return false
  if (target.kind === 'table') parkRuntime.inspectTable(target.id)
  else if (target.kind === 'fitness' && target.available && !target.occupied) void enterFitness(target.id)
  else if (target.available && !target.occupied && target.seat !== undefined) void sitBench(target.id, target.seat)
  return true
}
