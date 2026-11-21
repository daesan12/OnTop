import { nearbyParkNpcs } from '../ai/parkNpcInteraction'
import { openParkDialogue } from '../ai/parkDialogueState'
import { SLEIGH_ID } from '../winter/sleigh/constants'
import { boardSleigh } from '../winter/sleigh/boarding'
import { winterFrozen } from '../winter/state'
import { DUCK_BOAT, FITNESS, FITNESS_STATIONS, TABLES, TELESCOPES, TELESCOPE, MAILBOX, MAILBOX_BASE_Y } from '../../park/mapConfig'
import { boatQueueOpen } from '../duckBoat/controller'
import { openBoatChooser } from '../duckBoat/model'
import { authoritativePose, avatars, useSession, estimatedServerTime } from '../../network/worldClient'
import { parkRuntime } from '../../park/runtime/runtime'
import { balloonEntrance, canReachBalloonDoor } from '../balloon/boarding'
import { openLocalBalloon } from '../balloon/localRide'
import { A_FRAME, A_FRAME_SIGNS } from '../../config/parkAdvertising'
import { renewalAdSigns } from '../../../park-renewal-preview/live/advertisingPlacement'
import { BALLOON_RIDE_ENABLED } from '../../park/mapSelection'
import { viewControls } from '../../world/cameraPerspective'
import { tableBusy, useGame } from '../../game/store'
import { panelOwnsKeys, roamingInput } from '../../world/inputOwnership'
import { benchAnchors, canReachBench } from './benchAnchors'
import { facilityAvailable, facilityInRange, facilityMovementBlocked, useFacilityState } from '../facilities/state'
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
import { openPlusMinus } from '../plusMinus/store'
import { openRpsRoulette } from '../rpsRoulette/store'
import { canReachRenewalRecreation, renewalMap, type RenewalRecreationId } from '../../park/renewalMap'
import { MINI_PROPS } from '../../park/mapConfig'
import { interactWithTable } from '../tableLobby/tableInteraction'
import { tableEntry } from '../tableLobby/tableEntry'
import { useTableLobby } from '../tableLobby/state'
import { STONE_RUMBLE_ANCHOR_ID } from '../../game/stone-rumble/entrance'
import { STONE_RUMBLE_GUIDE_ID, stoneRumbleStelePosition } from '../../game/stone-rumble/entranceStele'
import { openStoneRumbleGuide, stoneRumbleGuideScope } from '../../game/stone-rumble/guideState'
import { STONE_RUMBLE_ENABLED } from '../tableLobby/model'
import { canReachTable } from '../tableLobby/tableReach'
import { GENERATED_PARK_ENABLED, JUMPMAP_ENABLED, RENEWAL_PARK_ENABLED } from '../../park/mapSelection'
import { constructionSites,canReachConstruction,openConstructionNotice,openParkGacha } from '../construction/model'
import { openSpotDifference } from '../spotDifference/store'
import { canReachParkGacha, PARK_GACHA_MACHINE } from '../gacha/parkMachinePlacement'
import { gachaInteractionEnabled } from '../gacha/state'
import { canReachRankingBoard,openRankingBoard,rankingBoardTarget } from '../rankingBoard/model'
import { canReachParkVr, openParkVrZone, parkVrEntrance } from '../vrZone/parkBridge'
import { openJumpRope } from '../jumpRope/store'
import { canReachJumpmapGuide, jumpmapGuideScope, openJumpmapGuide } from '../jumpmap/guideState'
import { GUIDE as JUMPMAP_GUIDE } from '../jumpmap/activeCourse'
import { useJumpmap } from '../jumpmap/state'
import { carryInteraction, interactWithAvatar } from '../carry/interaction'
import {canReachJokeJudge,jokeJudgePosition,openJokeContest} from '../ai/jokeContest'
import { openFortune } from '../fortune/controller'
import { useMobility } from '../mobility/state'
import { useDisplayGame } from '../../game/displayGame'
import { diamond, interiorVisit, visitScope } from '../../../park-renewal-preview/interiorEvents'
import { accessAt, interiorAccess } from '../../../park-renewal-preview/interiorAccess'

const interiorLabels: Record<keyof typeof interiorAccess, string> = {
  vestibule: '돌문 열기', surface: '공원으로 나가기', passage: '통로로 들어가기',
  entry: '돌문 열기', return: '입구로 나가기', exit: '공원으로 나가기',
}

const stoneRumbleTable = RENEWAL_PARK_ENABLED && STONE_RUMBLE_ENABLED
  ? TABLES.find(table => table.id === STONE_RUMBLE_ANCHOR_ID) : undefined
const stoneRumbleGuidePosition = stoneRumbleTable && stoneRumbleStelePosition(stoneRumbleTable)

const plazaKiosksEnabled = GENERATED_PARK_ENABLED || RENEWAL_PARK_ENABLED
const advertisementSigns = RENEWAL_PARK_ENABLED
  ? await import('../../../park-renewal-preview/groundSurface').then(({ groundSurfaceHeight }) =>
    renewalAdSigns.map(sign => ({ ...sign, y: groundSurfaceHeight(sign.x, sign.z) })))
  : GENERATED_PARK_ENABLED ? [] : A_FRAME_SIGNS.map(sign => ({ ...sign, y: 0 }))
const recreationLabels: Record<RenewalRecreationId, string> = {
  fortune: '오늘의 운세 보기',
  'fish-bread': '붕어빵 굽기',
  'rps-roulette-cabinet': '가위바위보 룰렛 하기',
  'plus-minus-cabinet': '더하기빼기 하기',
  'mole-shop': '두더지 모드 고르기',
  'pigeon-jump-rope': '구구구 줄넘기 하기',
}

export interface ParkInteraction {
  kind: 'park-npc' | 'sleigh' | 'bench' | 'table' | 'fitness' | 'telescope' | 'boat' | 'balloon' | 'feedback' | 'notes' | 'bungeoppang' | 'rps-roulette' | 'renewal-game' | 'spot-difference' | 'construction' | 'gacha' | 'ranking-board' | 'vr' | 'jumpmap-guide' | 'stone-rumble-guide' | 'avatar-pickup' | 'avatar-throw' | 'joke-judge' | 'interior-item' | 'interior-access' | 'advertisement'
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
export function getParkInteraction(preferredGuide?: typeof STONE_RUMBLE_GUIDE_ID): ParkInteraction | null {
  const session = useSession.getState(), benches = useBenchState.getState(), fitness = useFitnessState.getState()
  const p = avatars.get(session.sessionId)
  if (winterFrozen(session.sessionId, estimatedServerTime())) return null
  const mobility = useMobility.getState()
  if (mobility.target || mobility.phase !== 'idle' || p?.vehicle || facilityMovementBlocked(session.sessionId)) return null
  if (!roamingInput.ready || !p || session.status !== 'connected' || !session.mapCompatible || session.tableId || p.seatIndex >= 0
    || p.fitnessId || p.telescopeId || p.swimming || session.pending || benches.pending || fitness.pending
    || useTelescopeState.getState().pending || tableBusy() || useGame.getState().watchedGameId || useDisplayGame.getState().localPractice || panelOwnsKeys()) return null
  const choices: ParkInteraction[] = []
  for (const npc of nearbyParkNpcs(p.current, session.roomId)) {
    const distance = Math.hypot(p.current.x - npc.x, p.current.z - npc.z)
    choices.push({ kind: 'park-npc', id: npc.id, label: `${npc.name}${npc.speaker === 'santa' || npc.speaker === 'hansu' ? '와' : '과'} 대화`, available: true, occupied: false, distance,
      score: interactionScore(distance, { x: npc.x, y: npc.y + 1, z: npc.z }) })
  }
  if(canReachJokeJudge(p.current)){const distance=Math.hypot(p.current.x-jokeJudgePosition.x,p.current.z-jokeJudgePosition.z);choices.push({kind:'joke-judge',id:'joke-judge',label:'김부장과 대화',occupied:false,available:true,distance,score:interactionScore(distance,{...jokeJudgePosition,y:jokeJudgePosition.y+1.5})})}
  if (p.carry && p.carry.role !== 'CARRIER') return null
  const carry = carryInteraction()
  if (p.carry?.role === 'CARRIER') return carry
  const at = RENEWAL_PARK_ENABLED && !session.benchId ? authoritativePose(session.sessionId) : undefined
  const access = at && accessAt(at)
  if (at && access) {
    const [x, , z] = interiorAccess[access].from
    const locked = access === 'exit' && !at.interiorExitReady
    return { kind: 'interior-access', id: access, label: locked ? '3층에 올라가면 열려요' : interiorLabels[access], occupied: false,
      available: !locked, distance: Math.hypot(at.x - x, at.z - z), score: 0 }
  }
  if (RENEWAL_PARK_ENABLED && !p.carry && interiorVisit.canAddDiamond(visitScope(session.sessionId, session.roomId), p.current)) {
    const [x,,z] = diamond, distance = Math.hypot(p.current.x-x,p.current.z-z)
    return { kind:'interior-item', id:'interior-item', label:'다이아 집기', occupied:false, available:true, distance, score:0 }
  }
  if (stoneRumbleGuidePosition && !session.benchId) {
    const [x, y, z] = stoneRumbleGuidePosition
    const distance = Math.hypot(p.current.x - x, p.current.z - z)
    if (distance <= 2.4 && Math.abs(p.current.y - (y + .8)) <= .95) {
      const guide: ParkInteraction = { kind: 'stone-rumble-guide', id: STONE_RUMBLE_GUIDE_ID,
        label: '돌탑 생존전 규칙 보기', occupied: false, available: true, distance,
        score: interactionScore(distance, { x, y: y + 1.3, z }) }
      if (preferredGuide) return guide
      choices.push(guide)
    }
  }
  if (carry) choices.push(carry)
  if (JUMPMAP_ENABLED && !useJumpmap.getState().run && canReachJumpmapGuide(p.current)) {
    const distance=Math.hypot(p.current.x-JUMPMAP_GUIDE.x,p.current.z-JUMPMAP_GUIDE.z)
    choices.push({kind:'jumpmap-guide',id:'jumpmap-guide',label:'돌탑 점프맵 안내',occupied:false,available:true,distance,
      score:interactionScore(distance,{x:JUMPMAP_GUIDE.x,y:JUMPMAP_GUIDE.y+(RENEWAL_PARK_ENABLED?1.4:.12),z:JUMPMAP_GUIDE.z})})
  }
  if(plazaKiosksEnabled&&canReachRankingBoard(p.current)){
    const [x,y,z]=rankingBoardTarget.reachPosition,distance=Math.hypot(p.current.x-x,p.current.z-z)
    choices.push({kind:'ranking-board',id:rankingBoardTarget.id,label:'랭킹 자세히 보기',occupied:false,available:true,distance,score:interactionScore(distance,{x,y,z})})
  }
  for (const sign of advertisementSigns) {
    const distance = Math.hypot(p.current.x - sign.x, p.current.z - sign.z)
    if (distance > 2.5 || Math.abs(p.current.y - (sign.y + .8)) > 1) continue
    choices.push({ kind: 'advertisement', id: `a-frame-${sign.id}`, label: '광고 보기',
      occupied: false, available: true, distance, score: interactionScore(distance, { ...sign, y: sign.y + A_FRAME.panelY }) })
  }
  if (RENEWAL_PARK_ENABLED && facilityInRange(p.current, SLEIGH_ID)) {
    const d = useFacilityState.getState().catalog[SLEIGH_ID]
    const occupied = Object.values(useFacilityState.getState().occupancies).some(l => l.facilityId === SLEIGH_ID)
    const distance = Math.hypot(p.current.x - d.center.x, p.current.z - d.center.z)
    choices.push({ kind: 'sleigh', id: SLEIGH_ID, label: occupied ? '썰매 비행 중 · 잠시 기다려주세요' : '루돌프 썰매 타기 · 무료',
      occupied, available: !occupied && facilityAvailable(SLEIGH_ID), distance, score: interactionScore(distance, d.center) })
  }
  if (BALLOON_RIDE_ENABLED && balloonEntrance && canReachBalloonDoor(p.current)) {
    const distance = Math.hypot(p.current.x - balloonEntrance.x, p.current.z - balloonEntrance.z)
    choices.push({ kind: 'balloon', id: 'balloon', label: '열기구 탑승',
      occupied: false, available: true, distance, score: interactionScore(distance, balloonEntrance) })
  }
  if(plazaKiosksEnabled)for(const site of constructionSites){
    // layout-shop is the visible gacha machine. Its E prompt is controlled by the
    // backend runtime capability below, not by the legacy construction marker.
    if(site.id===PARK_GACHA_MACHINE.id || RENEWAL_PARK_ENABLED && site.id.startsWith('mobility-'))continue
    if (site.id === 'balloon' && BALLOON_RIDE_ENABLED) continue
    if(!canReachConstruction(p.current,site.id))continue
    const [x,y,z]=site.reachPosition,distance=Math.hypot(p.current.x-x,p.current.z-z)
    // The deployed 220m map still classifies this anchor as construction.
    if (renewalMap && site.id === 'shooting') {
      choices.push({ kind: 'spot-difference', id: site.id, label: '스피드 틀린 그림 찾기',
        occupied: false, available: true, distance, score: interactionScore(distance, { x, y: y + .5, z }) })
      continue
    }
    const label = site.id === 'layout-drink' ? '복권방 열기' : site.label
    choices.push({kind:'construction',id:site.id,label,occupied:false,available:true,distance,score:interactionScore(distance,{x,y,z})})
  }
  if (plazaKiosksEnabled && (RENEWAL_PARK_ENABLED || gachaInteractionEnabled(session.sessionId)) && canReachParkGacha(p.current)) {
    const { id, x, y, z } = PARK_GACHA_MACHINE
    const distance = Math.hypot(p.current.x - x, p.current.z - z)
    choices.push({ kind: 'gacha', id, label: '의상 뽑기', occupied: false, available: true, distance,
      score: interactionScore(distance, { x, y: y + 1.35, z }) })
  }
  if (canReachParkVr(p.current)) {
    const distance = Math.hypot(p.current.x - parkVrEntrance.x, p.current.z - parkVrEntrance.z)
    choices.push({ kind: 'vr', id: 'vr-experience-hall', label: '온탑 꼬치왕', occupied: false, available: true, distance,
      score: interactionScore(distance, { x: parkVrEntrance.x, y: parkVrEntrance.y + .7, z: parkVrEntrance.z }) })
  }
  for (const anchor of renewalMap?.data.interactions.recreation ?? []) {
    if (!canReachRenewalRecreation(p.current, anchor)) continue
    const [x, y, z] = anchor.id === 'fortune' ? anchor.reachPosition : anchor.position
    const distance = Math.hypot(p.current.x - x, p.current.z - z)
    choices.push({ kind: 'renewal-game', id: anchor.id, label: recreationLabels[anchor.id],
      occupied: false, available: true, distance, score: interactionScore(distance, { x, y: anchor.id === 'fortune' ? y : y + 1.3, z }) })
  }
  if (!renewalMap && canReachBungeoppang(p.current)) {
    const cart = MINI_PROPS[0], distance = Math.hypot(p.current.x - cart.x, p.current.z - cart.z)
    choices.push({ kind: 'bungeoppang', id: cart.id, label: '붕어빵 굽기', occupied: false, available: true,
      distance, score: interactionScore(distance, { x: cart.x, y: 1.875, z: cart.z }) })
  }
  if (!renewalMap && canReachRpsRoulette(p.current)) {
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
      available: true, distance, score: interactionScore(distance, { x: MAILBOX.x, y: MAILBOX_BASE_Y + MAILBOX.height * 0.7, z: MAILBOX.z }) })
  }
  if (DUCK_BOAT && facilityInRange(p.current, DUCK_BOAT.id)) {
    const [x, y, z] = DUCK_BOAT.position, distance = Math.hypot(p.current.x - x, p.current.z - z)
    choices.push({ kind: 'boat', id: DUCK_BOAT.id, label: `오리배 타기 · ${useFacilityState.getState().boats?.fare ?? 30}냥`,
      occupied: !boatQueueOpen(), available: facilityAvailable(DUCK_BOAT.id), distance,
      score: interactionScore(distance, { x, y: y + 1, z }) })
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
    const stoneRumble = table.id === STONE_RUMBLE_ANCHOR_ID
    if (stoneRumble && !STONE_RUMBLE_ENABLED) continue
    const distance = Math.hypot(p.current.x - table.position[0], p.current.z - table.position[2])
    if (!canReachTable(p.current, table.id)) continue
    const lobby = useTableLobby.getState()
    const waiting = lobby.spectatorRequested && lobby.spectatorStatus === 'waiting' && session.focusedAnchorId === table.id
    choices.push({ kind: 'table', id: table.id, label: waiting ? '관전 대기 취소' : tableEntry(table.id) === 'watch' ? '관전하기' : stoneRumble ? '돌탑 생존전 입장' : '테이블에 앉기', occupied: false, available: true,
      distance, score: interactionScore(distance, { x: table.position[0], y: table.position[1] + 0.65, z: table.position[2] }) })
  }
  return choices.filter(c => Number.isFinite(c.score)).sort((a, b) => a.score - b.score || a.distance - b.distance
    || a.id.localeCompare(b.id) || (a.seat ?? 2) - (b.seat ?? 2))[0] ?? null
}
export function interactWithPark(expectedId?: string): boolean {
  const target = getParkInteraction(expectedId === STONE_RUMBLE_GUIDE_ID ? expectedId : undefined)
  if (!target || (expectedId !== undefined && target.id !== expectedId)) return false
  if (target.kind === 'interior-access') {
    if (!target.available) return false
    const { sessionId, roomId } = useSession.getState()
    const at = authoritativePose(sessionId)
    const access = at && accessAt(at)
    if (!at || access !== target.id) return false
    const submit = () => {
      void parkRuntime.useInteriorAccess?.(access).then(moved => {
        const session = useSession.getState()
        if (moved && session.sessionId === sessionId && session.roomId === roomId) {
          viewControls.yaw = access === 'vestibule' ? Math.PI : interiorAccess[access].yaw
          viewControls.pitch = .05
        }
      })
    }
    if (access !== 'exit' || !interiorVisit.deferExit(visitScope(sessionId, roomId), at, performance.now(), submit)) submit()
    return true
  }
  if (target.kind === 'interior-item') {
    const { sessionId, roomId } = useSession.getState(), pose = avatars.get(sessionId)?.current
    return !!pose && interiorVisit.addDiamond(visitScope(sessionId, roomId), pose)
  }
  if (target.kind === 'avatar-pickup' || target.kind === 'avatar-throw') interactWithAvatar(target.kind, target.id)
  else if (target.kind === 'stone-rumble-guide') openStoneRumbleGuide(stoneRumbleGuideScope(useSession.getState()))
  else if (target.kind === 'jumpmap-guide') openJumpmapGuide(jumpmapGuideScope(useSession.getState()))
  else if (target.kind === 'ranking-board') openRankingBoard()
  else if (target.kind === 'advertisement') window.dispatchEvent(new Event('ontap-open-pickus'))
  else if (target.kind === 'park-npc') {
    const session = useSession.getState(), own = avatars.get(session.sessionId)
    const npc = own && nearbyParkNpcs(own.current, session.roomId).find(n => n.id === target.id)
    if (!npc) return false
    parkRuntime.stopMovement()
    openParkDialogue(npc.speaker, session.sessionId + ':' + session.roomId)
  }
  else if (target.kind === 'joke-judge') openJokeContest()
  else if (target.kind === 'vr') openParkVrZone()
  else if (target.kind === 'gacha') openParkGacha()
  else if (target.kind === 'spot-difference') openSpotDifference()
  else if (target.kind === 'sleigh') { if (!target.available) return false; void boardSleigh(target.id); return true }
  else if (target.kind === 'balloon') return openLocalBalloon()
  else if (target.kind === 'construction') openConstructionNotice(target.id)
  else if (target.kind === 'bungeoppang') openBungeoppang()
  else if (target.kind === 'rps-roulette') { if (canOpenRpsRoulette()) openArcade() }
  else if (target.kind === 'renewal-game') {
    switch (target.id) {
      case 'fortune': return openFortune()
      case 'fish-bread': openBungeoppang(); break
      case 'rps-roulette-cabinet': if (canOpenRpsRoulette()) openRpsRoulette(); break
      case 'plus-minus-cabinet': openPlusMinus(); break
      case 'mole-shop': openArcade('mole'); break
      case 'pigeon-jump-rope': openJumpRope(); break
    }
  }
  else if (target.kind === 'table') interactWithTable(target.id)
  else if (target.kind === 'notes') openNotes()
  else if (target.kind === 'feedback') openFeedback()
  else if (target.kind === 'telescope' && target.available && !target.occupied) void enterTelescope(target.id)
  else if (target.kind === 'boat' && target.available && !target.occupied) openBoatChooser()
  else if (target.kind === 'fitness' && target.available && !target.occupied) void enterFitness(target.id)
  else if (target.available && !target.occupied && target.seat !== undefined) void sitBench(target.id, target.seat)
  return true
}
