import { FITNESS, FITNESS_STATIONS, TABLES, TELESCOPES, TELESCOPE, MAILBOX } from '../../park/mapConfig'
import { avatars, useSession } from '../../network/worldClient'
import { tableBusy, useGame } from '../../game/store'
import { panelOwnsKeys, roamingInput } from '../../world/inputOwnership'
import { benchAnchors, canReachBench } from './benchAnchors'
import { facilityAvailable, facilityMovementBlocked, useFacilityState } from '../facilities/state'
import { useBenchState } from './benchState'
import { benchService } from './benchService'
import { sitBench } from './benchController'
import { interactionScore } from './interactionAim'
import { useFitnessState } from '../fitness/state'
import { fitnessService } from '../fitness/service'
import { enterFitness } from '../fitness/controller'
import { canReachFitness } from '../fitness/anchors'
import { canReachTelescope } from '../telescopes/anchors'
import { useTelescopeState } from '../telescopes/state'
import { telescopeService } from '../telescopes/service'
import { enterTelescope } from '../telescopes/controller'
import { canReachFeedback } from '../feedback/validation'
import { openFeedback } from '../feedback/controller'
import { NOTES_BOX } from '../../park/mapConfig'
import { canReachNotes } from '../notes/validation'
import { openNotes } from '../notes/controller'
import { canReachBungeoppang } from '../bungeoppang/access'
import { openBungeoppang } from '../bungeoppang/store'
import { canOpenRpsRoulette, canReachRpsRoulette, RPS_CABINET } from '../rpsRoulette/access'
import { openArcade } from '../arcade/store'
import { MINI_PROPS } from '../../park/mapConfig'
import { interactWithTable } from '../tableLobby/tableInteraction'
import { tableEntry } from '../tableLobby/tableEntry'
import { useTableLobby } from '../tableLobby/state'
import { canReachTable } from '../tableLobby/tableReach'
import { GENERATED_PARK_ENABLED } from '../../park/mapSelection'
import { constructionSites,canReachConstruction,openConstructionNotice } from '../construction/model'
import { canReachRankingBoard,openRankingBoard,rankingBoardTarget } from '../rankingBoard/model'
import { canReachParkVr, openParkVrZone, parkVrEntrance } from '../vrZone/parkBridge'
import { canReachJumpmapGuide, jumpmapGuideScope, openJumpmapGuide } from '../jumpmap/guideState'
import { START as JUMPMAP_START } from '../jumpmap/course'
import { useJumpmap } from '../jumpmap/state'
import { carryInteraction, interactWithAvatar } from '../carry/interaction'

export interface ParkInteraction {
  kind: 'bench' | 'table' | 'fitness' | 'telescope' | 'feedback' | 'notes' | 'bungeoppang' | 'rps-roulette' | 'construction' | 'ranking-board' | 'vr' | 'jumpmap-guide' | 'avatar-pickup' | 'avatar-throw'
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
  if (facilityMovementBlocked(session.sessionId)) return null
  if (!roamingInput.ready || !p || session.status !== 'connected' || !session.mapCompatible || session.tableId || p.seatIndex >= 0
    || p.fitnessId || p.telescopeId || p.swimming || session.pending || benches.pending || fitness.pending
    || useTelescopeState.getState().pending || tableBusy() || useGame.getState().watchedGameId || panelOwnsKeys()) return null
  const choices: ParkInteraction[] = []
  if (p.carry && p.carry.role !== 'CARRIER') return null
  const carry = carryInteraction()
  if (p.carry?.role === 'CARRIER') return carry
  if (carry) choices.push(carry)
  if (GENERATED_PARK_ENABLED && !useJumpmap.getState().run && canReachJumpmapGuide(p.current)) {
    const distance=Math.hypot(p.current.x-JUMPMAP_START.x,p.current.z-JUMPMAP_START.z)
    choices.push({kind:'jumpmap-guide',id:'jumpmap-guide',label:'돌탑 점프맵 안내',occupied:false,available:true,distance,
      score:interactionScore(distance,{x:JUMPMAP_START.x,y:JUMPMAP_START.y+.12,z:JUMPMAP_START.z})})
  }
  if(GENERATED_PARK_ENABLED&&canReachRankingBoard(p.current)){
    const [x,y,z]=rankingBoardTarget.reachPosition,distance=Math.hypot(p.current.x-x,p.current.z-z)
    choices.push({kind:'ranking-board',id:rankingBoardTarget.id,label:'랭킹 자세히 보기',occupied:false,available:true,distance,score:interactionScore(distance,{x,y,z})})
  }
  if(GENERATED_PARK_ENABLED)for(const site of constructionSites){
    if(!canReachConstruction(p.current,site.id))continue
    const [x,y,z]=site.reachPosition,distance=Math.hypot(p.current.x-x,p.current.z-z)
    const label=site.id==='layout-shop'?site.label:site.label+' · 행운의 뽑기'
    choices.push({kind:'construction',id:site.id,label,occupied:false,available:true,distance,score:interactionScore(distance,{x,y,z})})
  }
  if (canReachParkVr(p.current)) {
    const distance = Math.hypot(p.current.x - parkVrEntrance.x, p.current.z - parkVrEntrance.z)
    choices.push({ kind: 'vr', id: 'vr-experience-hall', label: '온탑 꼬치왕', occupied: false, available: true, distance,
      score: interactionScore(distance, { x: parkVrEntrance.x, y: 1.5, z: parkVrEntrance.z }) })
  }
  if (canReachBungeoppang(p.current)) {
    const cart = MINI_PROPS[0], distance = Math.hypot(p.current.x - cart.x, p.current.z - cart.z)
    choices.push({ kind: 'bungeoppang', id: cart.id, label: '붕어빵 굽기', occupied: false, available: true,
      distance, score: interactionScore(distance, { x: cart.x, y: 1.875, z: cart.z }) })
  }
  if (canReachRpsRoulette(p.current)) {
    const distance = Math.hypot(p.current.x - RPS_CABINET.x, p.current.z - RPS_CABINET.z)
    choices.push({ kind: 'rps-roulette', id: 'rps-roulette-cabinet', label: '오락기 하기', occupied: false, available: true,
      distance, score: interactionScore(distance, { x: RPS_CABINET.x, y: 1.3, z: RPS_CABINET.z }) })
  }
  if (canReachNotes(p.current)) {
    const distance = Math.hypot(p.current.x - NOTES_BOX.x, p.current.z - NOTES_BOX.z)
    choices.push({ kind: 'notes', id: 'tower-notes', label: '익명 메모 소리함 열기', occupied: false,
      available: true, distance, score: interactionScore(distance, { x: NOTES_BOX.x, y: NOTES_BOX.y + 0.7, z: NOTES_BOX.z }) })
  }
  if (canReachFeedback(p.current)) {
    const distance = Math.hypot(p.current.x - MAILBOX.x, p.current.z - MAILBOX.z)
    choices.push({ kind: 'feedback', id: 'feedback-mailbox', label: '소리함에 의견 쓰기', occupied: false,
      available: true, distance, score: interactionScore(distance, { x: MAILBOX.x, y: MAILBOX.height * 0.7, z: MAILBOX.z }) })
  }
  for (const t of TELESCOPES) {
    if (!canReachTelescope(p.current, t.id)) continue
    const occupant = Object.values(useTelescopeState.getState().placements).find(lease => lease.channelId === session.roomId && lease.telescopeId === t.id)
    const distance = Math.hypot(p.current.x - t.position[0], p.current.z - t.position[2])
    choices.push({ kind: 'telescope', id: t.id, label: `${t.name} 이용하기`, occupied: !!occupant,
      occupant: occupant ? avatars.get(occupant.userId)?.nickname ?? '이웃' : undefined,
      available: telescopeService.mode === 'server' ? facilityAvailable(t.id) : telescopeService.mode !== 'unavailable', distance,
      score: interactionScore(distance, { x: t.position[0], y: t.position[1] + TELESCOPE.eyeHeight, z: t.position[2] }) })
  }
  for (const station of FITNESS_STATIONS) {
    if (!canReachFitness(p.current, station.id)) continue
    const occupant = Object.values(fitness.placements).find(lease => lease.channelId === session.roomId && lease.stationId === station.id)
    const distance = Math.hypot(p.current.x - station.position[0], p.current.z - station.position[2])
    choices.push({ kind: 'fitness', id: station.id, label: `${station.name} 이용하기`, occupied: !!occupant,
      occupant: occupant ? avatars.get(occupant.userId)?.nickname ?? '이웃' : undefined,
      available: fitnessService.mode === 'server' ? facilityAvailable(station.id) : fitnessService.mode !== 'unavailable', distance,
      score: interactionScore(distance, { x: station.position[0], y: station.position[1] + FITNESS.handleHeight, z: station.position[2] }) })
  }
  for (const bench of benchAnchors) {
    const distance = Math.hypot(p.current.x - bench.position[0], p.current.z - bench.position[2])
    if (!canReachBench(p.current, bench.id)) continue
    const taken = new Set(Object.values(benches.placements)
      .filter(lease => lease.channelId === session.roomId && lease.benchId === bench.id).map(lease => lease.seat))
    const available = ([0, 1] as const).filter(seat => !taken.has(seat))
    for (const seat of available.length ? available : [undefined]) {
      const pose = useFacilityState.getState().catalog[bench.id]?.seats[seat ?? 0] ?? bench.seats[seat ?? 0]!
      choices.push({ kind: 'bench', id: bench.id, seat, label: '벤치에 앉기', occupied: seat === undefined,
        available: benchService.mode === 'server' ? facilityAvailable(bench.id) : benchService.mode !== 'unavailable', distance,
        score: interactionScore(distance, { x: pose.x, y: pose.y - 0.2, z: pose.z }) })
    }
  }
  for (const table of TABLES) {
    const distance = Math.hypot(p.current.x - table.position[0], p.current.z - table.position[2])
    if (!canReachTable(p.current, table.id)) continue
    const lobby = useTableLobby.getState()
    const waiting = lobby.spectatorRequested && lobby.spectatorStatus === 'waiting' && session.focusedAnchorId === table.id
    choices.push({ kind: 'table', id: table.id, label: waiting ? '관전 대기 취소' : tableEntry(table.id) === 'watch' ? '관전하기' : '테이블에 앉기', occupied: false, available: true,
      distance, score: interactionScore(distance, { x: table.position[0], y: table.position[1] + 0.65, z: table.position[2] }) })
  }
  return choices.filter(c => Number.isFinite(c.score)).sort((a, b) => a.score - b.score || a.distance - b.distance
    || a.id.localeCompare(b.id) || (a.seat ?? 2) - (b.seat ?? 2))[0] ?? null
}
export function interactWithPark(): boolean {
  const target = getParkInteraction()
  if (!target) return false
  if (target.kind === 'avatar-pickup' || target.kind === 'avatar-throw') interactWithAvatar(target.kind, target.id)
  else if (target.kind === 'jumpmap-guide') openJumpmapGuide(jumpmapGuideScope(useSession.getState()))
  else if (target.kind === 'ranking-board') openRankingBoard()
  else if (target.kind === 'vr') openParkVrZone()
  else if (target.kind === 'construction') openConstructionNotice(target.id)
  else if (target.kind === 'bungeoppang') openBungeoppang()
  else if (target.kind === 'rps-roulette') { if (canOpenRpsRoulette()) openArcade() }
  else if (target.kind === 'table') interactWithTable(target.id)
  else if (target.kind === 'notes') openNotes()
  else if (target.kind === 'feedback') openFeedback()
  else if (target.kind === 'telescope' && target.available && !target.occupied) void enterTelescope(target.id)
  else if (target.kind === 'fitness' && target.available && !target.occupied) void enterFitness(target.id)
  else if (target.available && !target.occupied && target.seat !== undefined) void sitBench(target.id, target.seat)
  return true
}
