import { acceptAlkkagiSocial, resetAlkkagiSocial, syncAlkkagiSocial } from '../../game/alkkagi/spectatorEvents'
import { notifyOwnBalloonEnd, receiveRemoteBalloon } from '../../features/balloon/remoteRide'
import type { BalloonBoarding, Input as BalloonInput, Point as BalloonPoint } from '../../features/balloon/flight'
import type { ControlAction } from '../../features/balloon/controls'
import type { CabinPose } from '../../features/balloon/cabin'
import { BALLOON_RIDE_ENABLED } from '../mapSelection'
import { acquireVRProtection, vrCarryProtection } from '../../features/vrSession/protection'
import {
  clearAuthSession,
  getAuthSession,
  restoreAuthSession,
} from '../../auth/authFlow'
import { acceptRental, rentalNotice, rentalCapability, useMobility, type RentalTarget } from '../../features/mobility/state'
import { SharedSocket, ServerError } from '../../network/socketClient'
import { StoneControlQueue } from '../../game/stone-rumble/controlQueue'
import { routeCoopMessage, subscribeCoop } from '../../features/skewer/coop/contracts'
import { OmokSpectatorEvents } from '../../game/omok/spectatorEvents'
import { chatAuthorName } from '../../features/chat/author'
import { OneCardPrankEvents, ONECARD_PRANKS_ENABLED, type PrankScope } from '../../game/onecard/prankEvents'
import { OneCardDefenseEvents, ONECARD_DEFENSE_ENABLED } from '../../game/onecard/defenseEvents'
import { BUNGEOPPANG_RANKINGS_ENABLED } from '../../features/bungeoppang/ranking'
import { handScope, useOneCardUI } from '../../game/onecard/uiState'
import { WorldTimeClient } from '../../network/worldTimeClient'
import {MapAdmission,MAP_UPDATE_MESSAGE,type MapIdentity} from '../../network/mapContract'
import { FacilityClient } from '../../network/facilityClient'
import { facilityMovementBlocked, FacilityUseBlockedError, showFacilityUseNotice, serverFacilities } from '../../features/facilities/state'
import { RestError } from '../../network/restError'
import { jokeBusinessMessage, jokeSubmissionPath } from '../../features/ai/jokeSubmissionError'
import { clearRoamingInput, inputState, focusParkCanvas } from '../../world/inputOwnership'
import { rememberRoamingView } from '../../world/cameraReturn'
import { useMouseLook } from '../../world/mouseLook'
import { benchTable, benchViewScope, resetBenchSpectator } from '../../features/interactions/benchSpectator'
import { gameChatScope } from '../../features/chat/gameChat'
import {useCompanions,acceptCompanions} from '../../features/ai/companions'
import {companionPath,residentsEnabled} from '../../features/ai/serviceFeatures'
import {observedNpcPractice,syncPracticeSpectator} from '../../features/ai/practiceSpectator'
import { gamePlayers, gameState } from '../../game/protocol'
import { useBenchState } from '../../features/interactions/benchState'
import { useFacilityState } from '../../features/facilities/state'
import { receiveWalletSettlement, refreshWalletAfterSettlement } from '../../features/wallet/settlementRefresh'
import {
  channel,
  record,
  tableSummary,
  userProfile,
  type Envelope,
} from '../../network/protocol'
import { bindAnchor, parseBindings } from '../../network/tableBindings'
import { setDisplayProfiles } from '../../network/profileBridge'
import { canPlace, canPlayDice, receiveGame, tableBusy, useGame } from '../../game/store'
import { canUndoAction, type OmokUndoInput } from '../../game/omok/undo'
import { parkXRView } from '../../world/xrView'
import { canDrawAction, type OmokDrawInput } from '../../game/omok/draw'
import { forgetTabGames, keepTabGame, latestEndedGame, readTabGame } from '../../game/resultRecovery'
import { canStartForfeit, canRetryForfeit, definiteForfeitRejection, forfeitError, interruptForfeit, parseForfeitResult, resetForfeit, useForfeit } from '../../game/forfeit'
import { validDiceAction } from '../../game/farkle/scoring'
import { canActOneCard } from '../../game/onecard/actions'
import type { OneCardInput } from '../../game/onecard/protocol'
import { canActBridge } from '../../game/bridge/actions'
import type { BridgeInput } from '../../game/bridge/protocol'
import { canActLedger } from '../../game/ledger/actions'
import type { LedgerInput, LedgerPingTarget } from '../../game/ledger/protocol'
import { LedgerPingEvents } from '../../game/ledger/pings'
import { canFlipHalli, canLeaveEliminatedHalli, canRingHalli, classifyHalliError, halliNotice, markHalliRing } from '../../game/halligalli/actions'
import type { HalliInput } from '../../game/halligalli/protocol'
import { loadParkBindings } from './deployment'
import type { ParkRuntimePort } from './contracts'
import { benchBusy } from '../../features/interactions/benchState'
import { fitnessBusy } from '../../features/fitness/state'
import { telescopeBusy } from '../../features/telescopes/state'
import { resetFeedbackState, useFeedbackState } from '../../features/feedback/state'
import { resetNotesState, useNotesState } from '../../features/notes/state'
import { NotesChangeEvents } from '../../features/notes/changeEvents'
import { MovementInputBuffer, normalizedMove, stoppedIntent, type MovementIntent } from '../../network/movementInput'
import { localMovement } from '../../network/localMovementPrediction'
import { emoteSource, emoteUnavailable } from '../../features/emotes/availability'
import { parseEmoteBindings, previewEmoteBindings, type EmoteId } from '../../features/emotes/catalog'
import { emoteSignal, useEmoteState } from '../../features/emotes/state'
import { mockEmote } from '../../features/emotes/mock/MockEmoteService'
import { GAME_CONSTRUCTION_NOTICE, gameSelection, isTableGamePlayable, waitingForRound, type TableGameCode } from '../../features/tableLobby/model'
import { recommendedChannel, rememberChannel, rememberedChannel } from '../../features/parkMenus/channelEntry'
import { publicMatchService } from '../../features/tableLobby/publicMatch'
import { PublicGameWatcher } from '../../features/tableLobby/PublicGameWatcher'
import { FollowClient } from '../../features/follow/serverClient'
import { bindFollowService, followService } from '../../features/follow/service'
import { useTableLobby, resetSeatedLook } from '../../features/tableLobby/state'
import { TabletLobbyClient } from '../../features/tableLobby/TabletLobbyClient'
import { TABLET_ENABLED } from '../../features/tableLobby/tabletFeature'
import { canReachTable } from '../../features/tableLobby/tableReach'
import {
  avatars,
  cancelAvatarEmote,
  presentEmote,
  clearChannel,
  clearMovementNotice,
  showMovementNotice,
  receive,
  applyFacilityOccupancies,
  resetWorld,
  useSession,
  estimatedServerTime,
} from '../../network/worldClient'

export function validateChat(value: string): string {
  const text = value.trim()
  if (
    !text ||
    [...text].length > 200 ||
    /[\u0000-\u001f\u007f-\u009f\u2028\u2029\uD800-\uDFFF]/u.test(text)
  )
    throw new Error('채팅은 줄바꿈 없이 1~200자로 입력해주세요.')
  return text
}
type AuthEnded = () => void
/** One instance per app, including StrictMode's mount → cleanup → mount probe. */
export class ParkRuntime implements ParkRuntimePort {
  private readonly mapAdmission: MapAdmission
  constructor(options: {map?:MapIdentity;requireMapMetadata?:boolean} = {}) {
    this.mapAdmission=new MapAdmission(options.map,options.requireMapMetadata)
  }
  private mapConfirmationId = ''
  private beforeMap: Envelope[] = []

  private active = false
  private mapReady = false
  private generation = 0
  private inputSequence = 0
  private retryCount = 0
  private preferredChannel = ''
  private timer: ReturnType<typeof setTimeout> | undefined
  private actionErrorTimer: ReturnType<typeof setTimeout> | undefined
  private bootAbort: AbortController | undefined
  private authListeners = new Set<AuthEnded>()
  private notesChanges = new NotesChangeEvents()
  subscribeNotesChanged = (changed: () => void) => this.notesChanges.subscribe(changed)
  private actionBusy = false
  private movementRequests = new Map<string, number>()
  private stoneControlRequests = new Map<string, string>()
  private stoneControls = new StoneControlQueue((scope, input) =>
    useGame.getState().game?.gameId === scope ? this.sendStoneAction(input) : Promise.resolve(false))
  private stoneRecoveryRequests = new Map<string, string>()
  private stoneRecoveryGameId = ''
  private stoneRecoveryFlight: { gameId: string; promise: Promise<Envelope> } | null = null
  private resetStoneRecovery() {
    this.stoneControls.reset()
    this.stoneControlRequests.clear()
    this.stoneRecoveryRequests.clear()
    this.stoneRecoveryGameId = ''
    this.stoneRecoveryFlight = null
  }
  private inspection = 0
  private tableWatchRequestId = ''
  private obsoleteWatchRequests = new Set<string>()
  private ownProfile: ReturnType<typeof userProfile> | null = null
  private resultDiscovery = ''
  private resultDiscovering = -1
  /** Seat states the server sends on (re)connect, before CHANNEL_JOIN and the REST table list exist. */
  private initialStates: Envelope[] | null = null
  private quietResultChecks = new Set<string>()
  private untrackTabGame: (() => void) | undefined
  private untrackPracticeEvents: (() => void) | undefined
  private facilityMapInvalid = false
  private spectatorIntent: { userId: string; channelId: string; tableId: string; benchScope: string; awaitingStart?: boolean; npcPractice?: boolean } | null = null
  private npcWatchAttempt = 0
  private gameWatchRequestId = ''
  private spectatorChecks = new Map<string, string>()
  private obsoleteGameWatchRequests = new Set<string>()
  private tableClosing: Promise<boolean> | null = null
  private forfeitRequests = new Map<string, string>()
  private movement = new MovementInputBuffer((intent, scope) => this.sendMovement(intent, scope))
  private socket = new SharedSocket({
    ticket: async (signal) => {
      const body = await this.getJSON('/api/v1/auth/websocket-ticket', {
        method: 'POST',
        signal,
      })
      if (!record(body) || typeof body.ticket !== 'string' || !body.ticket
        || typeof body.expiresIn !== 'number' || !Number.isFinite(body.expiresIn) || body.expiresIn <= 0)
        throw new Error('접속권 응답을 확인할 수 없습니다.')
      return { ticket: body.ticket, expiresIn: body.expiresIn }
    },
    socket: (ticket) => {
      const url = new URL('/ws/tables', window.location.href)
      if (url.hostname === 'www.on-top.world') url.hostname = 'api.on-top.world'
      if (url.hostname === 'dev.on-top.world') url.hostname = 'dev-api.on-top.world'
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      url.searchParams.set('ticket', ticket)
      return new WebSocket(url) // Sole production WebSocket constructor in frontend/src.
    },
    message: (message) => this.message(message),
    closed: (code) => this.closed(code),
    error: (message) => this.report(message),
  })
  private tablet = new TabletLobbyClient({ connected: () => this.active && this.socket.connected,
    request: (type, payload, expected) => this.socket.request(type, payload, expected), action: job => this.action(job) })
  private worldTime = new WorldTimeClient({
    request: (type, payload, expected, onId) => this.socket.request(type, payload, expected, onId),
  })
  private spectator = new PublicGameWatcher({
    start: async target => {
      this.movement.clear(false)
      useGame.setState({ watchedGameId: target.gameId, error: '', uncertain: false })
      await this.socket.request('GAME_WATCH', { gameId: target.gameId }, ['GAME_STATE'], id => { this.gameWatchRequestId = id })
      if (this.spectator.accepts(target.gameId) && useGame.getState().game?.role !== 'SPECTATOR')
        throw new Error('공개 경기 관전 승인 상태를 확인하지 못했어요.')
    },
    stop: async () => { await this.socket.request('GAME_UNWATCH', {}, ['GAME_WATCH_LEFT']) },
    hide: () => {
      resetAlkkagiSocial()
      this.omokEvents.reset()
      this.ledgerPings.reset()
      this.oneCardPranks.reset()
      this.oneCardDefense.reset()
      if (this.gameWatchRequestId) this.obsoleteGameWatchRequests.add(this.gameWatchRequestId)
      for (const id of this.spectatorChecks.keys()) this.obsoleteGameWatchRequests.add(id)
      this.spectatorChecks.clear()
      if (this.obsoleteGameWatchRequests.size > 64) this.obsoleteGameWatchRequests.delete(this.obsoleteGameWatchRequests.values().next().value!)
      this.gameWatchRequestId = ''
      useGame.setState(s => ({ watchedGameId: '', game: s.game?.role === 'SPECTATOR' ? null : s.game }))
    },
    status: (spectatorStatus, error = '') => useTableLobby.setState({
      spectatorStatus: spectatorStatus === 'idle' && this.spectatorIntent ? 'waiting' : spectatorStatus,
      spectatorError: error,
    }),
  })
  private gameEventScope = () => {
    const s = useSession.getState(), g = useGame.getState()
    const c=useCompanions.getState(),practice=c.practiceChat??(c.practice?{gameId:c.practice.snapshot.gameId,version:c.practice.snapshot.version,role:'PLAYER' as const}:null)
    if(practice&&this.active&&this.socket.connected&&s.status==='connected'&&s.roomId&&s.mapCompatible)
      return {key:JSON.stringify([this.generation,s.sessionId,s.roomId,practice.gameId,practice.role]),...practice,canSend:getAuthSession()?.status==='AUTHENTICATED'}
    if (!this.active || !this.socket.connected || s.status !== 'connected' || !s.mapCompatible || !s.roomId
      || !g.game || gameState(g.game).status !== 'PLAYING' || g.lastResult) return null
    const game = g.game
    if (game.role === 'PLAYER' && (!s.tableId || g.recovery !== 'RESTORED' || g.permittedGameId !== game.gameId
      || !gamePlayers(game).includes(s.sessionId))) return null
    if (game.role === 'SPECTATOR' && (!this.spectator.accepts(game.gameId) || g.watchedGameId !== game.gameId)) return null
    return { key: JSON.stringify([this.generation, s.sessionId, s.roomId, game.gameId, game.role,
      game.role === 'SPECTATOR' ? this.gameWatchRequestId : '']), gameId: game.gameId, version: game.version,
      role: game.role, canSend: (game.role === 'PLAYER' || !s.tableId) && getAuthSession()?.status === 'AUTHENTICATED' }
  }
  private omokEvents = new OmokSpectatorEvents({
    displayName: userId => chatAuthorName(useSession.getState().profiles[userId]),
    scope: () => this.gameEventScope(),
    request: (type, payload, expected, onId) => this.socket.request(type, payload, expected, onId),
  })
  // 주사위 장부 관전자 훈수. 채팅과 같은 경기 범위를 쓰고 장부 경기에서만 열린다.
  private ledgerPings = new LedgerPingEvents({
    scope: () => useGame.getState().game?.ledger ? this.gameEventScope() : null,
    request: (type, payload, expected, onId) => this.socket.request(type, payload, expected, onId),
  })
  sendSpectatorChat = (text: string) => this.omokEvents.send('chat', text)
  pingLedger = (target: LedgerPingTarget) => this.ledgerPings.send(target)
  private oneCardScope = (): PrankScope | null => {
      const s = useSession.getState(), state = useGame.getState(), game = state.game
      if (!this.active || !this.socket.connected || s.status !== 'connected' || !s.mapCompatible || !s.roomId
        || !game?.onecard || game.onecard.status !== 'PLAYING' || state.lastResult) return null
      if (game.role === 'PLAYER' && (state.permittedGameId !== game.gameId
        || !game.onecard.players.some(p => p.userId === s.sessionId && p.active))) return null
      if (game.role === 'SPECTATOR' && (!this.spectator.accepts(game.gameId) || state.watchedGameId !== game.gameId)) return null
      const ui = useOneCardUI.getState()
      return { key: JSON.stringify([this.generation, s.sessionId, s.roomId, game.gameId, game.role,
        game.role === 'SPECTATOR' ? this.gameWatchRequestId : '']), gameId: game.gameId, ownId: s.sessionId,
        role: game.role, version: game.version, turnCount: game.onecard.turnCount, turnUserId: game.onecard.turnUserId,
        canSend: game.role === 'SPECTATOR' && !s.tableId && game.onecard.stage === 'PLAYING' && getAuthSession()?.status === 'AUTHENTICATED',
        canRestore: game.role === 'PLAYER', handIds: game.hand?.hand.map(c => c.id) ?? [],
        protectedId: ui.scope === handScope(s.sessionId, s.roomId, game.gameId, game.version) ? ui.selectedId : '' }
    }
  private oneCardPranks = new OneCardPrankEvents({
    enabled: ONECARD_PRANKS_ENABLED, scope: () => this.oneCardScope(),
    request: (type, payload, expected, onId) => this.socket.request(type, payload, expected, onId),
  })
  private oneCardDefense = new OneCardDefenseEvents({
    enabled: ONECARD_DEFENSE_ENABLED,
    scope: () => {
      const state = useGame.getState(), scope = this.oneCardScope()
      if (!scope) return null
      const fresh = !state.uncertain && !state.pending && !!state.game && state.game.version >= state.awaitingVersion
        && (scope.role === 'SPECTATOR' || state.recovery === 'RESTORED')
      return { ...scope, canSend: scope.canSend && fresh, canRestore: scope.canRestore && fresh }
    },
    canReach: target => this.oneCardPranks.canFlip(target),
    request: (type, payload, expected, onId) => this.socket.request(type, payload, expected, onId),
  })
  flipOneCardHand = (targetUserId: string, cardIndex?: number, handVersion?: number) => ONECARD_DEFENSE_ENABLED
    ? this.oneCardDefense.reach(targetUserId, cardIndex, handVersion) : Promise.resolve(false)
  hitOneCardHand = (attemptId: string) => this.oneCardDefense.hit(attemptId)
  restoreOneCardHand = () => this.oneCardPranks.restore()
  pingOmok = (x: number, y: number) => this.omokEvents.send('ping', { x, y })
  private resetSpectator() {
    this.omokEvents.reset()
    this.ledgerPings.reset()
    this.oneCardPranks.reset()
    this.oneCardDefense.reset()
    this.spectatorIntent = null; this.spectator.reset(); this.gameWatchRequestId = ''
    this.spectatorChecks.clear()
    this.obsoleteGameWatchRequests.clear(); this.tableClosing = null
  }
  private syncSpectator() {
    const intent = this.spectatorIntent, s = useSession.getState()
    if (intent && (s.status !== 'connected' || !s.mapCompatible || intent.userId !== s.sessionId || intent.channelId !== s.roomId
      || s.tableId || intent.tableId !== s.watchedTableId || intent.benchScope && intent.benchScope !== benchViewScope(s))) {
      this.closeTable(); return
    }
    // NPC matches are authorized by TABLE_WATCH/status, not the product GAME_WATCH directory.
    if (intent?.npcPractice) return
    const reference = intent ? publicMatchService.find({ channelId: intent.channelId, tableId: intent.tableId }) : null
    if (intent?.awaitingStart) {
      if (!canReachTable(avatars.get(s.sessionId)?.current, s.focusedAnchorId)) { this.closeTable(); return }
      if (!reference) return
      intent.awaitingStart = false
      useTableLobby.setState({ entryNotice: null })
    }
    if (intent && (!reference || useGame.getState().watchedGameId && reference.gameId !== useGame.getState().watchedGameId)) {
      this.closeTable(); return
    }
    void this.spectator.set(reference && intent ? { gameId: reference.gameId,
      scope: JSON.stringify([this.generation, intent.userId, intent.channelId, intent.tableId, intent.benchScope]) } : null)
  }
  cooperativeGame = {
    protectVR: () => acquireVRProtection(this),
    scope: () => { const s = useSession.getState(); return { userId: s.sessionId, channelId: s.roomId, connected: this.active && this.socket.connected && s.status === 'connected' && s.mapCompatible } },
    request: (type: string, payload: Record<string, unknown>, expected: readonly string[], onId?: (id: string) => void) => this.socket.request(type, payload, expected, onId),
    subscribe: subscribeCoop,
    requestJSON: (path: string, init?: RequestInit) => this.requestJSON(path, init),
  }
  private facilities = new FacilityClient({
    mapVersion: () => this.mapAdmission.expected.mapVersion,
    scope: () => {
      const s = useSession.getState()
      return { generation: this.generation, channelId: s.roomId, userId: s.sessionId,
        connected: this.active && this.socket.connected && s.status === 'connected' }
    },
    request: (type, payload, expected, onId) => this.socket.request(type, payload, expected, onId),
    apply: applyFacilityOccupancies,
    blockMovement: () => { this.movement.clear(false); localMovement.suspend() },
  })
  checkFacilities = (reloadCatalog = false) => this.facilities.refresh(reloadCatalog)
  private follow = new FollowClient({
    scope: () => {
      const s = useSession.getState()
      return { generation: this.generation, userId: s.sessionId, channelId: s.roomId,
        connected: this.active && this.socket.connected && s.status === 'connected' }
    },
    request: (type, payload, expected, onId) => {
      if (type === 'WORLD_FOLLOW_STOP') localMovement.stopSteering()
      return this.socket.request(type, payload, expected, onId)
    },
  })
  useFacility = (id: string, seat: number, signal: AbortSignal) => {
    const session = useSession.getState()
    rememberRoamingView(session.sessionId, session.roomId)
    return this.facilities.use(id, seat, signal)
  }
  releaseFacility = (id: string, signal: AbortSignal) => this.facilities.release(id, signal)
  aimFacility = (id: string, aim: { yaw: number; pitch: number }, signal: AbortSignal) => this.facilities.aim(id, aim, signal)
  addAuthListener(listener: AuthEnded) {
    this.authListeners.add(listener)
    return () => {
      this.authListeners.delete(listener)
    }
  }
  private report(error: unknown) {
    if (this.active && error instanceof FacilityUseBlockedError) {
      showFacilityUseNotice(useSession.getState().sessionId)
      return
    }
    clearTimeout(this.actionErrorTimer)
    this.actionErrorTimer = undefined
    if (this.active) {
      useSession.setState({
        error: error instanceof Error ? error.message : String(error),
      })
      this.expireActionError()
    }
  }
  private expireActionError() {
    clearTimeout(this.actionErrorTimer)
    const { status, error: message } = useSession.getState(), generation = this.generation
    if (status !== 'connected' || !message) return
    this.actionErrorTimer = setTimeout(() => {
      this.actionErrorTimer = undefined
      const current = useSession.getState()
      if (this.active && generation === this.generation && current.status === 'connected'
        && current.error === message) useSession.setState({ error: '' })
    }, 3000)
  }
  private authEnded() {
    this.resetStoneRecovery()
    this.notesChanges.reset()
    this.tablet.end()
    this.mapReady = false
    this.worldTime.reset()
    this.forfeitRequests.clear()
    resetForfeit()
    this.follow.reset()
    this.resetSpectator()
    this.facilities.reset()
    resetNotesState()
    resetFeedbackState()
    this.movement.clear()
    this.active = false
    clearTimeout(this.timer)
    this.bootAbort?.abort()
    this.initialStates = null
    forgetTabGames()
    clearAuthSession()
    void this.socket.disconnect()
    resetWorld('error', '로그인이 종료되었습니다. 다시 로그인해주세요.')
    this.authListeners.forEach((listener) => listener())
  }
  private async getJSON(url: string, init: RequestInit = {}): Promise<unknown> {
    const fetchOnce = () => {
      const session = getAuthSession()
      if (session?.status !== 'AUTHENTICATED')
        throw new Error('로그인이 필요합니다.')
      return fetch(url, {
        ...init,
        credentials: 'omit',
        cache: 'no-store',
        headers: {
          ...init.headers,
          Authorization: `Bearer ${session.accessToken}`,
        },
      })
    }
    let response = await fetchOnce()
    if (response.status === 401 && !init.signal?.aborted) {
      if (!(await restoreAuthSession(true))) {
        this.authEnded()
        throw new Error('로그인이 만료되었습니다.')
      }
      if (init.signal?.aborted) throw new Error('연결 요청이 취소되었습니다.')
      response = await fetchOnce()
    }
    const distanceCode = url === '/api/v1/feedback' ? 'FEEDBACK_OUT_OF_RANGE'
      : /^\/api\/v1\/notes(?:\?channelId=[^&#?]+)?$/.test(url) ? 'NOTES_OUT_OF_RANGE'
      : url === jokeSubmissionPath ? 'JOKE_OUT_OF_RANGE' : ''
    const distanceForbidden = response.status === 403 && !!distanceCode
    if (response.status === 401 || (response.status === 403 && !distanceForbidden)) this.authEnded()
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null)
      const code = record(body) && typeof body.code === 'string' ? body.code : 'HTTP_ERROR'
      // Only the documented distance rejection is a business error, not an ended login session.
      if (distanceForbidden && code !== distanceCode) this.authEnded()
      throw new RestError(response.status, code,
        response.status === 401
          ? '로그인을 다시 확인해주세요.'
          : jokeBusinessMessage(url, response.status, body) ?? `서버 요청에 실패했습니다. (${response.status})`,
        record(body) && typeof body.nextAllowedAt === 'string' ? body.nextAllowedAt : undefined,
      )
    }
    // DELETE /api/v1/users/me answers 204 without a body.
    return response.status === 204 ? null : response.json()
  }
  requestJSON = async (path: string, init: RequestInit = {}) => {
    const notesRead = /^\/api\/v1\/notes\?channelId=[^&#?]+$/.test(path) && (init.method ?? 'GET') === 'GET'
    const notesWrite = path === '/api/v1/notes' && init.method === 'POST'
    const method = init.method ?? 'GET'
    const jumpmapRequest = (method === 'GET' && /^\/api\/v1\/minigames\/jumpmap\/status\?channelId=[^&#?]+$/.test(path))
      || (method === 'GET' && path === '/api/v1/minigames/jumpmap/rankings')
      || (method === 'POST' && path === '/api/v1/minigames/jumpmap/tips')
    const shopRequest = (method === 'GET' && (path === '/api/v1/shop/items' || path === '/api/v1/users/me/items'))
      || (method === 'POST' && path === '/api/v1/shop/purchases')
      || (method === 'PATCH' && path === '/api/v1/users/me/equipment')
    const profileRequest = ((method === 'PATCH' || method === 'DELETE') && path === '/api/v1/users/me')
      || (method === 'GET' && /^\/api\/v1\/users\/nickname-availability\?nickname=[^&#]+$/.test(path))
    const historyRequest = method === 'GET' && (path === '/api/v1/users/me/game-stats'
      || /^\/api\/v1\/users\/me\/games\?size=20(?:&cursor=[1-9]\d{0,18})?(?:&gameCode=(?:OMOK|DICE|ONE_CARD|LIAR_BRIDGE|DICE_LEDGER|HALLI_GALLI))?$/.test(path))
    const minigameRequest = /^\/api\/v1\/minigames\/sessions(?:\?rulesVersion=v[45]|\/\d+(?:\?(?:(?:includeSource|includeProgress)=true|deliveryKey=[A-Za-z0-9_-]{1,64})(?:&(?:(?:includeSource|includeProgress)=true|deliveryKey=[A-Za-z0-9_-]{1,64}))*|\/(?:complete|abandon|deliveries))?)?$/.test(path)
      || method === 'POST' && /^\/api\/v1\/minigames\/sessions\/\d+\/manual-pause$/.test(path)
    const rankingRequest = BUNGEOPPANG_RANKINGS_ENABLED && method === 'GET'
      && /^\/api\/v1\/minigames\/bungeoppang\/rankings\?period=ALL_TIME&rulesVersion=v[45]&limit=20(?:&durationMs=[1-9]\d{0,8})?(?:&cursor=[A-Za-z0-9%+_.~-]{1,1536})?$/.test(path)
    const parkRankingRequest = method === 'GET' && path === '/api/v1/rankings/park'
    const fitnessRewardRequest = method === 'GET' && path === '/api/v1/world/fitness/rewards/status'
    const balloonFareRequest = method === 'POST' && path === '/api/v1/world/balloon/tickets'
    const skewerCoop = method === 'GET' && /^\/api\/v1\/minigames\/skewer\/coop\/rooms\?channelId=[^&#?]+$/.test(path)
      || method === 'GET' && /^\/api\/v1\/minigames\/skewer\/coop\/result\?gameId=skewer-coop-[a-f0-9-]{36}$/.test(path)
      || method === 'GET' && /^\/api\/v1\/minigames\/skewer\/coop\/rankings(?:\?mode=(?:PC|VR))?$/.test(path)
      || method === 'POST' && ['/api/v1/minigames/skewer/coop/rooms', '/api/v1/minigames/skewer/coop/leave'].includes(path)
    const rpsRouletteRequest = (method === 'GET' && path === '/api/v1/minigames/rps-roulette/status')
      || (method === 'POST' && /^\/api\/v1\/minigames\/rps-roulette\/rounds(?:\/[1-9]\d{0,18}\/(?:hands|challenge|stop))?$/.test(path))
    const plusMinusRequest = (method === 'GET' && path === '/api/v1/minigames/plus-minus/status')
      || (method === 'POST' && path === '/api/v1/minigames/plus-minus/rounds')
    const moleRequest = (method === 'GET' && path === '/api/v1/minigames/whack-a-mole/status')
      || (method === 'GET' && /^\/api\/v1\/minigames\/whack-a-mole\/rankings\?limit=20&offset=\d{1,5}$/.test(path))
      || (method === 'POST' && /^\/api\/v1\/minigames\/whack-a-mole\/rounds(?:\/[1-9]\d{0,18}\/complete)?$/.test(path))
    const speedMoleRequest = (method === 'GET' && /^\/api\/v1\/minigames\/speed-mole\/rankings\?limit=20&offset=\d{1,5}$/.test(path))
      || (method === 'POST' && /^\/api\/v1\/minigames\/speed-mole\/rounds(?:\/[1-9]\d{0,18}\/complete)?$/.test(path))
    const jumpRopeRequest = (method === 'GET' && path === '/api/v1/minigames/jump-rope/rankings')
      || (method === 'POST' && /^\/api\/v1\/minigames\/jump-rope\/rounds(?:\/[1-9]\d{0,18}\/complete)?$/.test(path))
    const spotDifferenceRequest = (method === 'GET' && path === '/api/v1/minigames/spot-difference/status')
      || (method === 'POST' && /^\/api\/v1\/minigames\/spot-difference\/runs(?:\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/actions)?$/.test(path))
    const raffleRequest = (method === 'GET' && path === '/api/v1/raffles/current')
      || (method === 'POST' && path === '/api/v1/raffles/current/tickets')
    const gachaRequest = (method === 'GET' && (path === '/api/v1/gacha'
      || /^\/api\/v1\/gacha\/operations\/[A-Za-z0-9_-]{1,64}$/.test(path)))
      || (method === 'POST' && ['/api/v1/gacha/tickets', '/api/v1/gacha/draws', '/api/v1/gacha/boxes/open'].includes(path))
    const serviceAiRequest = (method === 'GET' && ['/api/v1/ai/features','/api/v1/ai/companions/status'].includes(path))
      || (method === 'POST' && /^\/api\/v1\/ai\/companions\/(?:invite|action|talk)$/.test(path))
      || (method === 'GET' && /^\/api\/v1\/ai\/joke-contest\/(?:me|rankings(?:\?date=\d{4}-\d{2}-\d{2})?|yesterday|hall|reveal\/[a-zA-Z0-9-]+|submissions\/[a-zA-Z0-9-]+)$/.test(path))
      || (method === 'POST' && path === '/api/v1/ai/joke-contest/submissions')
    const localAiRequest = import.meta.env.DEV && import.meta.env.VITE_AI_PARK === 'true'
      && ['127.0.0.1','localhost'].includes(location.hostname)
      && ((method === 'POST' && /^\/local\/ai\/(?:feedback-position|table-position|jumpmap-position|roof-position|flush|digest)$/.test(path))
        || (method === 'GET' && path === '/local/ai/status')
        || (method === 'GET' && /^\/local\/ai\/joke-contest\/(?:me|rankings(?:\?date=\d{4}-\d{2}-\d{2})?|yesterday|hall|reveal\/[a-zA-Z0-9-]+|submissions\/[a-zA-Z0-9-]+)$/.test(path))
        || (method === 'POST' && /^\/local\/ai\/joke-contest\/(?:submissions|position)$/.test(path))
        || (method === 'GET' && path === '/local/ai/companions/status')
        || (method === 'POST' && /^\/local\/ai\/companions\/(?:invite|action|talk)$/.test(path)))
    if (!this.active || (!serviceAiRequest && !localAiRequest && !notesRead && !notesWrite && !shopRequest && !profileRequest
      && !historyRequest && !minigameRequest && !jumpmapRequest && !rankingRequest && !parkRankingRequest && !skewerCoop
      && !rpsRouletteRequest && !plusMinusRequest && !moleRequest && !speedMoleRequest && !jumpRopeRequest
      && !spotDifferenceRequest && !raffleRequest && !gachaRequest && !fitnessRewardRequest && !balloonFareRequest
      && !/^\/api\/v1\/(?:wallets\/me|feedback)$/.test(path))
      || (path === '/api/v1/feedback' && init.method !== 'POST'))
      throw new Error('현재 공원에서 사용할 수 없는 요청입니다.')
    const signals = [this.bootAbort?.signal, init.signal].filter((s): s is AbortSignal => !!s)
    return this.getJSON(path, { ...init, signal: AbortSignal.any(signals) })
  }
  start() {
    if (this.active) return
    this.active = true
    if (TABLET_ENABLED) this.tablet.begin()
    bindFollowService(this.follow)
    this.untrackTabGame?.()
    this.untrackPracticeEvents?.()
    this.untrackPracticeEvents=useCompanions.subscribe((next,previous)=>{
      if(next.practiceChat!==previous.practiceChat || next.practice!==previous.practice)this.omokEvents.sync()
    })
    this.untrackTabGame = useGame.subscribe((next, prev) => {
      if (next.game?.gameId !== prev.game?.gameId || next.recovery !== 'RESTORED'
        || next.game?.stone?.status !== 'PLAYING' || next.game.role !== 'PLAYER'
        || !next.game.stone.players.find(player => player.userId === useSession.getState().sessionId)?.alive) this.stoneControls.reset()
      const owner = useSession.getState().sessionId
      if (next.permittedGameId && next.permittedGameId !== prev.permittedGameId) keepTabGame(owner, next.permittedGameId)
      // A result the player already closed is not shown again after a refresh.
      if (next.dismissedResult && next.dismissedResult !== prev.dismissedResult
        && readTabGame(owner) === next.dismissedResult.gameId) keepTabGame(owner, '')
    })
    this.retryCount = 0
    void this.boot()
  }
  private async boot() {
    this.notesChanges.reset()
    this.mapAdmission.reset();this.mapConfirmationId='';this.beforeMap=[]
    if (TABLET_ENABLED) this.tablet.reset(true)
    this.mapReady = false
    this.worldTime.reset()
    interruptForfeit()
    this.follow.reset()
    this.resetSpectator()
    this.facilities.reset()
    this.facilityMapInvalid = false
    this.movement.clear()
    const generation = ++this.generation
    this.resetStoneRecovery()
    this.initialStates = []
    this.actionBusy = false
    this.bootAbort?.abort()
    const abort = (this.bootAbort = new AbortController())
    resetWorld(this.retryCount ? 'reconnecting' : 'joining')
    this.ownProfile = null
    try {
      await this.socket.disconnect()
      if (!this.active || generation !== this.generation) return
      const ready = Promise.all([
        this.getJSON('/api/v1/channels', { signal: abort.signal }),
        loadParkBindings(abort.signal),
        this.getJSON('/api/v1/users/me', { signal: abort.signal }).then(
          userProfile,
        ),
      ]).then(([body, config, profile]) => {
        if (!this.active || generation !== this.generation || abort.signal.aborted) return
        if (!record(body) || !Array.isArray(body.items) || !record(config))
          throw new Error('공원 설정 응답을 확인할 수 없습니다.')
        const channels = body.items.map(channel),
          bindings = parseBindings(config.bindings)
        useSession.setState({ channels, bindings })
        useEmoteState.setState({ bindings: config.emotes === undefined && import.meta.env.DEV && import.meta.env.MODE === 'facility-preview'
          ? { ...previewEmoteBindings } : parseEmoteBindings(config.emotes) })
        this.ownProfile = profile
        if (!channels.length)
          this.report('서버에 등록된 채널이 없습니다. 채널 설정을 확인해주세요.')
      })
      await this.socket.connect(ready)
    } catch (error) {
      if (!this.active || generation !== this.generation) return
      abort.abort()
      useSession.setState({ status: 'error' })
      this.report(error)
    }
  }
  async stop() {
    this.notesChanges.reset()
    this.untrackTabGame?.()
    this.untrackPracticeEvents?.()
    this.untrackPracticeEvents=undefined
    this.untrackTabGame = undefined
    this.tablet.end()
    this.mapReady = false
    this.worldTime.reset()
    this.forfeitRequests.clear()
    resetForfeit()
    this.follow.reset()
    this.resetSpectator()
    this.facilities.reset()
    this.movement.clear()
    this.active = false
    ++this.generation
    this.resetStoneRecovery()
    this.initialStates = null
    this.actionBusy = false
    clearTimeout(this.timer)
    clearTimeout(this.actionErrorTimer)
    this.actionErrorTimer = undefined
    this.bootAbort?.abort()
    const closing = this.socket.disconnect()
    resetWorld()
    await closing
  }
  private closed(code: number) {
    this.notesChanges.reset()
    if(this.mapAdmission.status==='mismatch')return
    if (TABLET_ENABLED) this.tablet.reset(true)
    this.mapReady = false
    this.worldTime.reset()
    interruptForfeit()
    this.follow.reset()
    this.resetSpectator()
    this.facilities.reset()
    this.movement.clear()
    if (!this.active) return
    if (code === 4401 || code === 4403) {
      this.authEnded()
      return
    }
    if (code === 1008 || code === 1000) {
      resetWorld(
        'error',
        code === 1008
          ? '같은 계정의 연결이 이미 있거나 서버가 연결을 거절했습니다. 다른 공원 창을 확인해주세요.'
          : '서버가 연결을 종료했습니다.',
      )
      return
    }
    resetWorld('reconnecting', '연결이 끊겨 다시 연결하고 있습니다.')
    if (++this.retryCount > 5) {
      useSession.setState({
        status: 'error',
        error: '자동 재연결을 중지했습니다. 잠시 후 다시 시도해주세요.',
      })
      return
    }
    this.timer = setTimeout(
      () => void this.boot(),
      Math.min(500 * 2 ** this.retryCount, 8000),
    )
  }
  reconnect = () => {
    if (!this.active) return
    clearTimeout(this.timer)
    this.retryCount = 0
    void this.boot()
  }
  private async loadChannels() {
    const body = await this.getJSON('/api/v1/channels', { signal: this.bootAbort?.signal })
    if (!record(body) || !Array.isArray(body.items)) throw new Error('채널 목록을 확인할 수 없습니다.')
    const channels = body.items.map(channel)
    useSession.setState({ channels })
    return channels
  }
  refreshChannels = async (): Promise<boolean> => {
    if (!this.active) return false
    try {
      await this.loadChannels()
      return true
    } catch (error) {
      this.report(error)
      return false
    }
  }
  private message(message: Envelope) {
    if (!this.active) return
    const stoneRecovery = message.requestId && this.stoneRecoveryRequests.get(message.requestId)
    if (stoneRecovery) {
      const state = useGame.getState()
      if ((state.permittedGameId || state.completedGameId) !== stoneRecovery
        || this.stoneSettledInLobby(stoneRecovery)) return
      if (message.type === 'GAME_CONNECTION_STATE' && message.payload.status === 'LOBBY'
        && state.permittedGameId === stoneRecovery) {
        // The server already left the engine, but its terminal result can still be in flight.
        // Remember only the round identity; its result/settlement must still come from the server.
        useGame.setState({ completedGameId: stoneRecovery })
      }
    }
    const moveSeq = message.requestId ? this.movementRequests.get(message.requestId) : undefined
    if (message.type === 'WORLD_STATE' && moveSeq !== undefined) localMovement.receivedInput(moveSeq)
    if (message.type === 'ERROR' && message.requestId
      && this.movementRejectedAfterSeating(message.requestId, message.payload.code)) return
    // Seat states held before the table list carry no requestId, so they never meet the movement filter above.
    if(message.type==='ERROR'&&['MAP_VERSION_MISMATCH','MAP_VERSION_REQUIRED'].includes(String(message.payload.code))) {
      this.rejectMap(message.payload.serverMap)
      return
    }
    if(this.mapAdmission.status==='mismatch')return
    if(message.type==='WORLD_MAP_STATE') {
      if(this.mapAdmission.status!=='confirming'||message.requestId!==this.mapConfirmationId)return
      if(!this.mapAdmission.confirmed(message.payload.map,message.payload.verified)){this.rejectMap(message.payload.map);return}
      this.mapReady=true
      useSession.setState({status:'connected',mapContractStatus:'verified',serverMap:this.mapAdmission.serverMap})
      const queued=this.beforeMap;this.beforeMap=[]
      this.enterPreferredChannel()
      for(const pending of queued)this.message(pending)
      return
    }
    if(message.type!=='CONNECTED'&&!this.mapAdmission.allowed) {
      if(this.mapAdmission.status==='confirming'&&/^(GAME_|TABLE_)/.test(message.type)) {
        if(this.beforeMap.length>=64){this.rejectMap(this.mapAdmission.serverMap);return}
        this.beforeMap.push(message)
      }
      return
    }
    if (message.type === 'WORLD_BALLOON_STATE') {
      if (!BALLOON_RIDE_ENABLED) return
      const { roomId, sessionId } = useSession.getState()
      if (message.payload.channelId === roomId && message.payload.pilotId === sessionId
        && message.payload.flight === null && message.requestId === null) notifyOwnBalloonEnd()
      receiveRemoteBalloon(message.payload, roomId, sessionId)
      return
    }
    if(message.type==='CONNECTED') {
      rentalCapability.available = message.payload.mobilityAvailable === true
      clearTimeout(this.timer)
      if(message.payload.map===undefined&&message.payload.mapVerificationRequired===true){this.rejectMap(undefined);return}
      if(!this.mapAdmission.connected(message.payload.map)){this.rejectMap(message.payload.map);return}
      useSession.setState({mapContractStatus:this.mapAdmission.status,serverMap:this.mapAdmission.serverMap})
    }
    if(message.type==='WORLD_STATE'&&this.mapAdmission.status==='verified'
      &&message.payload.channelId===useSession.getState().roomId
      &&message.payload.mapVersion!==this.mapAdmission.expected.mapVersion) {
      this.rejectMap({...this.mapAdmission.serverMap,mapVersion:message.payload.mapVersion})
      return
    }
    if (this.holdInitialState(message)) return
    if (message.type === 'NOTES_CHANGED') {
      const session = useSession.getState()
      if (this.mapReady && this.mapAdmission.allowed && session.status === 'connected'
        && session.mapCompatible && session.roomId && !session.pending)
        this.notesChanges.accept(message)
      return
    }
    if (message.type === 'WORLD_MOBILITY_STATE') {
      const { receipt } = message.payload
      acceptRental(message.payload)
      if (typeof receipt === 'string') {
        refreshWalletAfterSettlement(useSession.getState().sessionId, 'mobility:' + receipt)
      }
      return
    }
    if (routeCoopMessage(message)) {
      if (message.type === 'GAME_CONNECTION_STATE' && String(message.payload.gameId ?? '').startsWith('skewer-coop-') && !useGame.getState().game)
        useGame.setState({ recovery: 'LOBBY' })
      return
    }
    if (this.oneCardDefense.accept(message)) return
    if (this.oneCardPranks.accept(message)) return
    if (message.type === 'ERROR' && message.requestId && this.alkkagiSocialRequests.delete(message.requestId)) return
    if (message.type === 'ALKKAGI_SPECTATOR_EVENT') {
      const state = useGame.getState(), session = useSession.getState()
      this.alkkagiSocialRequests.delete(message.requestId ?? '')
      const g = state.game
      const eligible = this.active && session.status === 'connected' && session.mapCompatible && !!session.roomId
        && g?.alkkagi?.status === 'PLAYING' && !state.lastResult
        && (g.role === 'PLAYER' ? state.recovery === 'RESTORED' && state.permittedGameId === g.gameId
          : this.spectator.accepts(g.gameId) && state.watchedGameId === g.gameId)
      acceptAlkkagiSocial(message, eligible ? g!.gameId : '', g?.version)
      return
    }
    if (this.ledgerPings.accept(message)) return
    if (this.omokEvents.accept(message)) return
    if (this.worldTime.ownsError(message) || message.type === 'WORLD_TIME_STATE') return
    if (message.type === 'ERROR' && message.requestId && this.forfeitRequests.has(message.requestId)
      && this.forfeitRequests.get(message.requestId) !== JSON.stringify([useSession.getState().sessionId, useGame.getState().permittedGameId])) return
    if (this.follow.ownsError(message)) return
    if (message.type === 'WORLD_FOLLOW_STATE') { if (followService.mode === 'server') this.follow.accept(message); return }
    if (message.type === 'ERROR' && message.requestId && this.obsoleteGameWatchRequests.has(message.requestId)) return
    // An automatic result recovery is not a user action; its rejection stays silent.
    if (message.type === 'ERROR' && message.requestId && this.quietResultChecks.has(message.requestId)) return
    if (message.type === 'GAME_STATE' && message.payload.role === 'SPECTATOR'
      && (!this.spectator.accepts(message.payload.gameId) || message.requestId !== null && message.requestId !== this.gameWatchRequestId
        && this.spectatorChecks.get(message.requestId) !== this.gameWatchRequestId)) return
    if (serverFacilities && this.facilities.ownsError(message)) return
    if (message.type === 'ERROR' && message.requestId && this.obsoleteWatchRequests.has(message.requestId)) return
    if (message.type === 'TABLE_WATCH_STATE') {
      const q = useTableLobby.getState()
      if (!['loading', 'ready'].includes(q.status) || message.payload.tableId !== q.tableId ||
        (message.requestId !== null && message.requestId !== this.tableWatchRequestId)) return
    }
    // Only the originating stone round owns its in-flight input errors.
    const stoneRound = message.requestId && this.stoneControlRequests.get(message.requestId)
    if (message.type === 'ERROR' && stoneRound) {
      if (message.payload.code === 'GAME_ACTION_GAME_FINISHED') return
      if (message.payload.code === 'GAME_RECOVERY_REQUIRED') {
        const state = useGame.getState()
        if (state.permittedGameId !== stoneRound || state.game?.stone?.status === 'FINISHED'
          || state.result?.gameSessionId === stoneRound || state.lastResult?.gameSessionId === stoneRound) return
        useGame.setState({ recovery: 'PENDING', uncertain: true })
        this.stoneRecoveryGameId = stoneRound
        void this.recoverStoneInput(stoneRound).catch(() => { /* The scoped retry remains available in the UI. */ })
        return
      }
    }
    receive(message,this.mapAdmission.expected.mapVersion)
    if (message.type === 'ERROR') this.expireActionError()
    if (serverFacilities) {
      if (message.type === 'WORLD_FACILITY_STATE') this.facilities.accept(message)
      if (message.type === 'WORLD_STATE') {
        if (message.payload.channelId === useSession.getState().roomId && !useSession.getState().mapCompatible) {
          if (!this.facilityMapInvalid) this.facilities.reset()
          this.facilityMapInvalid = true
        } else {
          if (this.facilityMapInvalid && useSession.getState().mapCompatible) {
            this.facilityMapInvalid = false
            void this.facilities.begin().catch(() => {})
          }
          this.facilities.world(message.payload)
        }
      }
    }
    const session = useSession.getState()
    try {
      receiveGame(message, session.sessionId, session.tableId)
      const recoveringStone = this.stoneRecoveryGameId
      if (recoveringStone && this.stoneSettledInLobby(recoveringStone)) {
        // Both authorities must agree: the own result is settled and this table is WAITING.
        // This clears only our earlier input-recovery wait, never an unsettled/new round.
        useGame.setState({ recovery: 'LOBBY', uncertain: false, error: '' })
        this.stoneRecoveryGameId = ''
      }
      receiveWalletSettlement(message, session.sessionId)
      const alkkagi = useGame.getState().game?.alkkagi
      syncAlkkagiSocial(alkkagi?.gameId ?? '', alkkagi?.version ?? -1, alkkagi?.stage === 'AIMING')
      this.omokEvents.sync()
      this.ledgerPings.sync()
      this.oneCardPranks.sync()
      this.oneCardDefense.sync()
    } catch (error) {
      useGame.setState({
        uncertain: true,
        error: '경기 응답 형식을 확인하지 못해 입력을 중지했습니다.',
      })
      throw error
    }
    if (TABLET_ENABLED) this.tablet.accept(message)
    const watched = useGame.getState().game
    if (this.spectatorIntent && watched?.role === 'SPECTATOR' && gameState(watched).status === 'FINISHED') {
      this.closeTable()
    }
    if (this.spectatorIntent && message.type === 'GAME_WATCH_LEFT' && message.requestId === null) this.closeTable()
    if (message.type === 'TABLE_LEFT') keepTabGame(session.sessionId, '')
    this.discoverResult()
    if ((message.type === 'ERROR' && message.requestId === null || message.type === 'GAME_WATCH_LEFT' && message.requestId === null)
      && this.spectatorIntent && !useGame.getState().watchedGameId && useTableLobby.getState().spectatorStatus === 'watching')
      this.spectator.revoked('경기 관전 권한이 종료됐어요. 다시 연결해주세요.')
    if (['TABLE_STATE', 'TABLE_WATCH_STATE', 'TABLE_WATCH_LEFT', 'WORLD_STATE', 'WORLD_FACILITY_STATE'].includes(message.type)) this.syncSpectator()
    if (!session.roomId || !session.mapCompatible || session.tableId || useGame.getState().watchedGameId || tableBusy() || !avatars.has(session.sessionId))
      this.movement.clear(false)
    if (message.type === 'CONNECTED') {
      if (useForfeit.getState().attempt?.userId !== message.payload.userId) resetForfeit()
      const profile = this.ownProfile
      if (!profile || profile.userId !== message.payload.userId) {
        this.authEnded()
        return
      }
      this.worldTime.begin(message.payload.time)
      setDisplayProfiles(
        {
          [profile.userId]: {
            nickname: profile.nickname,
            character: profile.character,
          },
        },
        { nickname: profile.nickname, balance: null },
      )
      this.inputSequence = 0
      if(this.mapAdmission.status==='confirming') {
        useSession.setState({status:'joining'})
        void this.confirmMap()
      } else {this.mapReady=true;this.enterPreferredChannel()}
    }
  }
  private enterPreferredChannel() {
    if(this.mapAdmission.allowed)void this.enterRecommendedChannel()
  }
  private async confirmMap() {
    const generation=this.generation
    try {
      await this.socket.request('WORLD_MAP_CONFIRM',{...this.mapAdmission.expected},['WORLD_MAP_STATE'],id=>{this.mapConfirmationId=id})
    } catch {
      if(this.active&&generation===this.generation&&this.mapAdmission.status!=='mismatch')this.rejectMap(this.mapAdmission.serverMap)
    }
  }
  private rejectMap(serverMap:unknown) {
    this.mapReady=false
    this.mapAdmission.reject(serverMap)
    this.beforeMap=[]
    if (TABLET_ENABLED) this.tablet.reset(true)
    this.worldTime.reset()
    interruptForfeit()
    this.follow.reset()
    this.resetSpectator()
    ++this.generation
    this.resetStoneRecovery()
    this.bootAbort?.abort()
    clearTimeout(this.timer)
    this.facilities.reset()
    this.movement.clear()
    resetWorld('error',MAP_UPDATE_MESSAGE)
    useSession.setState({mapContractStatus:'mismatch',serverMap:this.mapAdmission.serverMap})
    // No automatic retry loop with the same stale bundle. The user chooses refresh/reconnect.
    void this.socket.disconnect()
  }
  private async action(job: () => Promise<unknown>, { blockControls = true } = {}) {
    if (!this.active || this.actionBusy || !this.mapAdmission.allowed) return false
    this.actionBusy = true
    useSession.setState(blockControls ? { pending: true, error: '' } : { error: '' })
    const generation = this.generation
    try {
      await job()
      return true
    } catch (error) {
      if (generation === this.generation) {
        this.report(error)
      }
      return false
    } finally {
      if (generation === this.generation) {
        this.actionBusy = false
        if (blockControls) useSession.setState({ pending: false })
      }
    }
  }
  private async joinChannel(channelId: string) {
      if (!this.mapReady) throw new Error('서버 맵 버전 확인을 먼저 완료해주세요.')
      const state = useSession.getState()
      if (inputState.minigameOpen) throw new Error('먼저 미니게임을 마쳐주세요.')
      if (benchBusy(state.sessionId)) throw new Error('먼저 벤치에서 일어나주세요.')
      if (fitnessBusy(state.sessionId)) throw new Error('먼저 운동기구에서 내려와주세요.')
      if (telescopeBusy(state.sessionId)) throw new Error('먼저 망원경에서 나와주세요.')
      if (tableBusy())
        throw new Error('경기 진행·복구·정산 중에는 채널을 바꿀 수 없습니다.')
      if (state.tableId) throw new Error('먼저 테이블에서 일어나주세요.')
      if (state.roomId === channelId) return
      this.notesChanges.reset()
      this.follow.reset()
      this.facilities.reset()
      this.facilityMapInvalid = false
      this.movement.clear()
      if (!state.channels.some((c) => c.channelId === channelId))
        throw new Error('서버 채널 목록을 확인해주세요.')
      if (state.roomId)
        await this.socket.request('CHANNEL_LEAVE', {}, ['CHANNEL_LEFT'])
      const feedback = useFeedbackState.getState()
      const notes = useNotesState.getState()
      clearChannel(!state.roomId && feedback.ownerId === state.sessionId && feedback.channelId === channelId,
        !state.roomId && notes.ownerId === state.sessionId && notes.channelId === channelId)
      this.inputSequence = 0
      const generation = this.generation
      try {
        await this.socket.request('CHANNEL_JOIN', { channelId }, ['CHANNEL_STATE'])
        useSession.setState({ error: '' })
        this.preferredChannel = channelId
        rememberChannel(state.sessionId, channelId)
        this.retryCount = 0
        if (followService.mode === 'server') void this.follow.begin().catch(() => {})
        // Initial world messages keep their existing order. Facilities explicitly query after CHANNEL_JOIN.
        if (serverFacilities) void this.facilities.begin().catch(() => {})
        const body = await this.getJSON(
          `/api/v1/tables?channelId=${encodeURIComponent(channelId)}`,
          { signal: this.bootAbort?.signal },
        )
        if (
          generation !== this.generation ||
          useSession.getState().roomId !== channelId
        )
          return
        if (!record(body) || !Array.isArray(body.tables))
          throw new Error('테이블 목록을 확인할 수 없습니다.')
        const tables = body.tables.map(tableSummary)
        const liveBindings = body.tables.length && body.tables.every(item => record(item) && typeof item.tableId === 'string'
          && typeof item.anchorId === 'string')
          ? parseBindings(body.tables.map(item => ({ channelId, tableId: item.tableId, anchorId: item.anchorId })))
          : null
        useSession.setState(current => ({ tables, bindings: liveBindings
          ? [...current.bindings.filter(binding => binding.channelId !== channelId), ...liveBindings]
          : current.bindings }))
      } finally {
        // With or without the list, held seat states are read once now through the normal handlers.
        this.applyInitialStates(generation)
      }
  }
  selectChannel = (channelId: string) =>
    this.action(async () => {
      try {
        await this.joinChannel(channelId)
      } catch (error) {
        try { await this.loadChannels() } catch { /* Keep the original join error. */ }
        throw error
      }
    })
  enterRecommendedChannel = () => this.action(async () => {
    const state = useSession.getState()
    if (state.roomId) return
    const preferred = this.preferredChannel || rememberedChannel(state.sessionId)
    const selected = recommendedChannel(state.channels, preferred)
    if (!selected) throw new Error('지금 입장할 수 있는 공원이 없습니다. 잠시 후 다시 시도해주세요.')
    try {
      await this.joinChannel(selected.channelId)
      return
    } catch (error) {
      if (!(error instanceof ServerError) || !['CHANNEL_FULL', 'CHANNEL_NOT_FOUND'].includes(error.code)) throw error
      const refreshed = await this.loadChannels()
      const alternative = recommendedChannel(refreshed, preferred, selected.channelId)
        ?? recommendedChannel(refreshed, preferred)
      if (!alternative) throw new Error('입장 가능한 공원이 바뀌었습니다. 채널을 직접 선택해주세요.')
      await this.joinChannel(alternative.channelId)
    }
  })
  /** Existing handlers drop seat states that precede the table list; hold them, in arrival order, until it exists. */
  private holdInitialState(message: Envelope) {
    const held = this.initialStates
    if (!held || message.requestId !== null || held.length >= 64) return false
    const seat = message.type === 'TABLE_STATE' || message.type === 'TABLE_HOST_WAIT_STATE'
      || message.type === 'GAME_START_STATE' && message.payload.tableId !== null
    // Recovery can precede the seat itself. Applying it now would block the
    // initial channel join as an active game, leaving the board without a seat.
    const game = ['GAME_START_STATE', 'GAME_CONNECTION_STATE', 'GAME_STATE', 'GAME_RESULT'].includes(message.type)
    if (!seat && !game) return false
    held.push(message)
    return true
  }
  private applyInitialStates(generation: number) {
    const held = this.initialStates
    if (generation !== this.generation || !held) return
    this.initialStates = null
    // A table-scoped start state needs the seat first; otherwise arrival order (and every version check) is kept.
    for (const message of [...held.filter(m => m.type === 'TABLE_STATE'), ...held.filter(m => m.type !== 'TABLE_STATE')]) {
      try { this.message(message) } catch (error) { this.report(error) }
    }
  }
  sendTyping = async (typing: boolean) => {
    const own=useSession.getState()
    if(!this.active || own.status!=='connected' || !own.roomId || !own.mapCompatible)return false
    try {
      await this.socket.request('WORLD_CHAT_TYPING_SET',{typing},['WORLD_CHAT_TYPING_STATE'])
      return true
    } catch { return false }
  }
  setMyRoomOpen = async (open: boolean) => {
    const own = useSession.getState()
    if (!this.active || own.status !== 'connected' || !own.roomId || !own.mapCompatible) return false
    try {
      await this.socket.request('WORLD_MYROOM_SET', { open }, ['WORLD_STATE'])
      return true
    } catch { return false }
  }
  sendChat = (value: string) =>
    gameChatScope() ? this.sendSpectatorChat(value) :
    this.action(async () => {
      const text = validateChat(value)
      if (!useSession.getState().roomId)
        throw new Error('먼저 채널에 입장해주세요.')
      await this.socket.request('WORLD_CHAT_SEND', { text }, [
        'WORLD_CHAT_MESSAGE',
      ])
      // Only server echoes enter the message list. No optimistic duplicate or automatic replay.
    }, { blockControls: !parkXRView.active && !avatars.get(useSession.getState().sessionId)?.carry })
  move = (dx: number, dz: number, run: boolean, jump = false) => {
    const intent = normalizedMove(dx, dz, run, jump)
    if (!intent || !this.canSendMovement(intent)) return
    localMovement.intend(intent)
    if (!stoppedIntent(intent)) cancelAvatarEmote(useSession.getState().sessionId, 'movement')
    this.movement.enqueue(intent, this.movementScope())
  }
  startBalloon = async (ticketId: string, position: BalloonPoint, boarding: BalloonBoarding) => {
    const { roomId, sessionId } = useSession.getState()
    const { payload } = await this.socket.request('WORLD_BALLOON_START', { ticketId, ...position, ...boarding }, ['WORLD_BALLOON_STATE'])
    const leader = 'leaderId' in boarding ? boarding.leaderId : sessionId
    if (payload.channelId !== roomId || payload.pilotId !== leader || !payload.flight) {
      throw new Error('열기구 탑승 상태를 확인해주세요.')
    }
    return payload.party != null
  }
  launchBalloon = async (ticketId: string, solo: boolean) => {
    await this.socket.request('WORLD_BALLOON_LAUNCH', { ticketId, solo }, ['WORLD_BALLOON_STATE'])
  }
  controlBalloon = async (ticketId: string, action: ControlAction) => {
    await this.socket.request('WORLD_BALLOON_CONTROL', { ticketId, ...action }, ['WORLD_BALLOON_STATE'])
  }
  sendBalloonPose = (ticketId: string, position: BalloonPoint, aboard: boolean, cabin: CabinPose, input: BalloonInput) => {
    if (!this.socket.connected) return
    try { this.socket.send('WORLD_BALLOON_POSE', { ticketId, ...position, aboard, cabin, input }) }
    catch { /* The next update or the flight expiry handles a transport interruption. */ }
  }
  endBalloon = (ticketId: string) => {
    if (!this.socket.connected) return
    try { this.socket.send('WORLD_BALLOON_END', { ticketId }) }
    catch { /* The server also removes the balloon when the connection closes or expires. */ }
  }
  stopMovement = () => {
    this.movement.clear(false)
    this.move(0, 0, false)
  }
  sendEmote = async (id: EmoteId): Promise<boolean> => {
    const reason = emoteUnavailable(id)
    if (reason || !this.active || !this.socket.connected) {
      useEmoteState.setState({ error: reason || '공원 연결을 확인해주세요.' })
      return false
    }
    const state = useEmoteState.getState(), session = useSession.getState()
    const epoch = state.epoch, scope = this.movementScope(), source = emoteSource(id)
    const current = () => useEmoteState.getState().epoch === epoch && this.movementScope() === scope && this.active
    useEmoteState.setState({ pending: true, requestId: '', requested: id, cancelled: false, error: '', notice: '' })
    this.stopMovement()
    try {
      if (source === 'server') {
        const response = await this.socket.request('WORLD_EMOTE_SEND', { emoteCode: state.bindings[id]! }, ['WORLD_EMOTE_EVENT'],
          requestId => { if (current()) useEmoteState.setState({ requestId }) })
        if (!current() || useEmoteState.getState().cancelled) return false
        if (response.payload.userId !== session.sessionId || response.payload.channelId !== session.roomId
          || response.payload.emoteCode !== state.bindings[id] || avatars.get(session.sessionId)?.emote !== id
          || avatars.get(session.sessionId)?.emoteAt !== Date.parse(String(response.payload.sentAt)))
          throw new Error('감정표현 승인 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.')
      } else if (import.meta.env.DEV && import.meta.env.MODE === 'facility-preview' && source === 'mock') {
        const event = await mockEmote(id, session.roomId, session.sessionId, emoteSignal())
        if (!current() || useEmoteState.getState().cancelled) return false
        if (!presentEmote({ ...event, emoteCode: 'MOCK' }, id, 'mock')) throw new Error('현재 상태에서는 감정표현을 사용할 수 없습니다.')
      } else throw new Error('감정표현 서버 연결이 아직 준비되지 않았습니다.')
      return true
    } catch (error) {
      if (current() && !useEmoteState.getState().cancelled) useEmoteState.setState({
        error: error instanceof Error ? error.message : '감정표현을 사용하지 못했습니다.',
      })
      return false
    } finally {
      if (current()) useEmoteState.setState({ pending: false, requestId: '', requested: '' })
    }
  }
  private movementScope() {
    const s = useSession.getState()
    return JSON.stringify([this.generation, s.sessionId, s.roomId, localMovement.epoch])
  }
  private interactionStatus = { scope: '', busy: false, vrActive: false, minigame: false, desired: false, desiredMinigame: false, pending: null as Promise<boolean> | null, retryAt: 0, requestId: '' }
  setInteractionBusy = (busy: boolean, confirm = false, minigame?: boolean) => {
    const session = useSession.getState(), scope = JSON.stringify([this.generation, session.sessionId, session.roomId])
    if (!this.active || session.status !== 'connected' || !session.roomId || !session.mapCompatible
      || !this.socket.connected) return Promise.resolve(false)
    if (!session.carrySupported) return Promise.resolve(!confirm)
    // A confirmed seat already blocks carry. Lobby presence requests are rejected during a real game.
    if (session.tableId || tableBusy()) return Promise.resolve(!confirm)
    if (this.interactionStatus.scope !== scope) this.interactionStatus = { scope, busy: false, vrActive: false, minigame: false, desired: false, desiredMinigame: false, pending: null, retryAt: 0, requestId: '' }
    const status = this.interactionStatus
    status.desired = busy
    if (minigame !== undefined) status.desiredMinigame = minigame
    let confirmNeeded = confirm
    const generation = this.generation
    const current = () => this.active && this.generation === generation && this.interactionStatus === status
      && useSession.getState().roomId === session.roomId && useSession.getState().sessionId === session.sessionId
    const sync = (): Promise<boolean> => {
      if (!current()) return Promise.resolve(false)
      if (status.pending) return status.pending.then(ok => ok ? sync() : false)
      const vrActive = vrCarryProtection.active, desired = status.desired || vrActive, playing = status.desiredMinigame
      if (status.busy === desired && status.vrActive === vrActive && status.minigame === playing && !confirmNeeded) return Promise.resolve(true)
      if (performance.now() < status.retryAt) return Promise.resolve(false)
      confirmNeeded = false
      const payload = { busy: desired, ...(vrActive || status.vrActive ? { vrActive } : {}),
        ...(playing || status.minigame ? { minigame: playing } : {}) }
      status.pending = this.socket.request('WORLD_INTERACTION_SET', payload, ['WORLD_INTERACTION_STATE']).then(response => {
        if (response.payload.channelId !== session.roomId || response.payload.busy !== desired
          || (response.payload.vrActive === true) !== vrActive)
          throw new Error('창 점유 응답을 확인해주세요.')
        if (!current()) return false
        status.busy = desired; status.vrActive = vrActive; status.minigame = playing; return true
      }).catch(error => {
        // A presence request sent before seating cannot revoke an already restored game's input.
        if ((useSession.getState().tableId || tableBusy()) && error instanceof ServerError && error.code === 'GAME_RECOVERY_REQUIRED') return false
        if (current()) { status.retryAt = performance.now() + 1000; this.report(error) }
        return false
      }).finally(() => { status.pending = null })
      return status.pending.then(ok => ok ? sync() : false)
    }
    return sync()
  }
  // Carry commands stay in the park: retain mouse look while actionBusy still serializes requests.
  pickupAvatar = (targetId: string) => this.action(async () => {
    await this.socket.request('WORLD_CARRY_PICKUP', { targetId }, ['WORLD_STATE'])
  }, { blockControls: false })
  throwAvatar = (carryId: string, direction: { dx: number; dy: number; dz: number }) => this.action(async () => {
    await this.socket.request('WORLD_CARRY_THROW', { carryId, ...direction }, ['WORLD_STATE'])
  }, { blockControls: false })
  releaseAvatar = (carryId: string) => this.action(async () => {
    await this.socket.request('WORLD_CARRY_RELEASE', { carryId }, ['WORLD_STATE'])
  }, { blockControls: false })
  async rentVehicle(target: RentalTarget, leaseId: string) {
    const payload = { stationId: target.stationId, vehicle: target.vehicle, leaseId }
    try {
      await this.socket.request('WORLD_MOBILITY_START', payload, ['WORLD_MOBILITY_STATE'])
    } catch (error) {
      if (useMobility.getState().leaseId !== leaseId || useMobility.getState().phase !== 'starting') return
      if (!(error instanceof ServerError)) {
        // The server may have committed before the reply timed out. End the same lease.
        await this.endVehicleRental(leaseId)
        if (useMobility.getState().leaseId !== leaseId || this.socket.connected) return
      }
      useMobility.setState({ phase: 'idle', leaseId: '', vehicle: null })
      rentalNotice(error instanceof ServerError ? error.message : '탑승 요청을 확인할 수 없어요.')
    }
  }
  async endVehicleRental(leaseId: string) {
    try {
      await this.socket.request('WORLD_MOBILITY_END', { leaseId }, ['WORLD_MOBILITY_STATE'])
    } catch {
      const state = useMobility.getState()
      if (state.leaseId !== leaseId) return
      useMobility.setState({ phase: 'riding' })
      rentalNotice('하차 요청을 확인할 수 없어요. 다시 시도해 주세요.')
    }
  }

  private canSendMovement(intent: MovementIntent) {
    const s = useSession.getState()
    return this.active && s.status === 'connected' && !!s.roomId && s.mapCompatible && avatars.has(s.sessionId)
      && !facilityMovementBlocked(s.sessionId)
      && (!avatars.get(s.sessionId)?.carry || avatars.get(s.sessionId)?.carry?.role === 'CARRIER')
      && !tableBusy() && !s.tableId && (!useGame.getState().watchedGameId || stoppedIntent(intent))
      && (!(inputState.minigameOpen || inputState.localBalloon) || stoppedIntent(intent))
      && (!useTableLobby.getState().joiningAnchorId || stoppedIntent(intent))
      && (!(benchBusy(s.sessionId) || fitnessBusy(s.sessionId) || telescopeBusy(s.sessionId)) || stoppedIntent(intent)) && this.socket.connected
  }
  private movementRejectedAfterSeating(requestId: string, code: unknown) {
    const s = useSession.getState()
    return code === 'TABLE_BUSY' && this.movementRequests.has(requestId) && s.seatIndex >= 0
      && !!s.tableStates[s.tableId]?.seats.some(seat => seat.userId === s.sessionId)
  }
  private async sendMovement(intent: MovementIntent, scope: string) {
    if (scope !== this.movementScope() || !this.canSendMovement(intent)) return
    const riding = !!avatars.get(useSession.getState().sessionId)?.vehicle
    if (!riding && localMovement.positionUnavailable) {
      const message = '이동 엔진을 준비하지 못했습니다. 새로고침 후 다시 접속해주세요.'
      if (useSession.getState().error !== message) this.report(message)
      return
    }
    const fallback = riding ? null : localMovement.positionFallback()
    if (fallback) {
      try { await this.socket.request('WORLD_POSITION_FALLBACK', fallback, ['WORLD_STATE']) }
      catch (error) { if (scope === this.movementScope() && this.active) this.report(error) }
      return
    }
    if (!riding && localMovement.positionPreparing) return
    const sequence = ++this.inputSequence
    localMovement.sentInput(sequence, performance.now(), intent)
    let requestId = ''
    try {
      const report = riding ? null : localMovement.positionReport(sequence, intent)
      const reportedSequence = report?.seq ?? sequence
      await this.socket.request(report ? 'WORLD_POSITION' : 'WORLD_MOVE', report ?? {
        seq: sequence,
        ...intent,
      }, ['WORLD_STATE'], id => { requestId = id; this.movementRequests.set(id, reportedSequence) })
      if (scope === this.movementScope() && this.active) clearMovementNotice(sequence)
    } catch (error) {
      if (scope !== this.movementScope() || !this.active) return
      localMovement.reject(sequence)
      // The server may reject a movement sent just before the approved seat.
      // That old movement error does not describe the current tablet action.
      if (error instanceof ServerError && this.movementRejectedAfterSeating(requestId, error.code)) return
      // Do not cancel a newer direction/jump already waiting in the queue.
      // The failed input itself was consumed by flush and is never replayed.
      if (error instanceof ServerError && error.code === 'MOVE_TOO_FREQUENT')
        showMovementNotice(error.message, sequence)
      else this.report(error)
    } finally {
      this.movementRequests.delete(requestId)
    }
  }
  inspectTable = (anchorId: string, watch = false) => {
    useTableLobby.setState({ entryNotice: null })
    void this.watchTable(anchorId, !watch).then(approved => {
      if (!approved || !watch || useSession.getState().focusedAnchorId !== anchorId) return
      const session = useSession.getState()
      const reference = publicMatchService.find({ channelId: session.roomId, tableId: session.watchedTableId })
      if (reference) void this.watchGame(reference.gameId)
      else {
        this.spectatorIntent = { userId: session.sessionId, channelId: session.roomId,
          tableId: session.watchedTableId, benchScope: '', awaitingStart: true }
        useTableLobby.setState({ spectatorRequested: true, spectatorStatus: 'waiting',
          entryNotice: { anchorId, text: '관전 대기 중 · 게임이 시작되면 자동으로 들어가요. Esc로 취소' } })
      }
    })
  }
  private async watchTable(anchorId: string, panelOpen: boolean): Promise<boolean> {
    const own = useSession.getState(), facilities = useFacilityState.getState()
    const benchRead = own.status === 'connected' && own.mapCompatible && benchTable(own.benchId)?.id === anchorId
      && !useBenchState.getState().pending && !facilities.pending && !facilities.awaitingWorld && !facilities.uncertain
    if (facilityMovementBlocked(own.sessionId) && !benchRead) return false
    if (inputState.minigameOpen) return false
    if (this.actionBusy || own.pending) return false
    if (benchBusy(own.sessionId) && !benchRead || fitnessBusy(own.sessionId) || telescopeBusy(own.sessionId)) return false
    rememberRoamingView(useSession.getState().sessionId, useSession.getState().roomId)
    useSession.setState({ focusedAnchorId: anchorId })
    useTableLobby.setState({ panelOpen })
    const s = useSession.getState(),
      tableId = bindAnchor(
        s.bindings,
        s.roomId,
        anchorId,
        s.tables.map((t) => t.tableId),
      )
    if (!tableId) {
      this.report('이 테이블의 서버 배치 연결이 아직 설정되지 않았습니다.')
      return false
    }
    if (s.tableId || tableBusy()) return false
    if (s.watchedTableId === tableId && useTableLobby.getState().status === 'ready') {
      useTableLobby.setState({ panelOpen }); return true
    }
    const inspection = ++this.inspection, generation = this.generation, channelId = s.roomId
    const current = () => this.active && this.generation === generation && this.inspection === inspection
      && useSession.getState().roomId === channelId && useSession.getState().focusedAnchorId === anchorId
    useTableLobby.setState({ tableId, status: 'loading', error: '', requestId: '', panelOpen })
    const ok = await this.action(async () => {
      try {
        if (this.tableClosing && !await this.tableClosing) throw new Error('이전 테이블 구독 종료를 먼저 확인해주세요.')
        if (s.watchedTableId && s.watchedTableId !== tableId && !await this.unwatchGame(true)) throw new Error('기존 경기 관전 종료를 확인해주세요.')
        const list = await this.getJSON(`/api/v1/tables?channelId=${encodeURIComponent(channelId)}`, { signal: this.bootAbort?.signal })
        if (!current()) return
        if (!record(list) || !Array.isArray(list.tables)) throw new Error('테이블 목록을 확인할 수 없습니다.')
        const tables = list.tables.map(tableSummary)
        if (!tables.some(table => table.tableId === tableId)) throw new Error('현재 채널의 테이블 목록을 다시 확인해주세요.')
        useSession.setState({ tables })
        if (s.watchedTableId && s.watchedTableId !== tableId)
          await this.socket.request('TABLE_UNWATCH', {}, ['TABLE_WATCH_LEFT'])
        if (!current()) return
        await this.socket.request('TABLE_WATCH', { tableId }, ['TABLE_WATCH_STATE'], requestId => {
          this.tableWatchRequestId = requestId
          useTableLobby.setState({ requestId })
        })
        if (current()) useTableLobby.setState({ status: 'ready' })
        else if (this.active && this.generation === generation && useSession.getState().roomId === channelId)
          await this.socket.request('TABLE_UNWATCH', {}, ['TABLE_WATCH_LEFT'])
      } catch (error) {
        if (!current()) return
        useTableLobby.setState({ status: 'error', error: error instanceof Error ? error.message : '테이블 조회에 실패했습니다.' })
        throw error
      }
    })
    return ok && current() && useTableLobby.getState().status === 'ready'
  }
  setSecretDoors = (open: boolean) =>
    this.action(() => this.socket.request('WORLD_SECRET_DOORS_SET', { open }, ['WORLD_STATE']), { blockControls: false })
  useInteriorAccess = (access: string) =>
    this.action(() => this.socket.request('WORLD_INTERIOR_ACCESS', { access }, ['WORLD_STATE']), { blockControls: false })
  joinTable = (anchorId?: string) => {
    // The pending action releases pointer lock before the join checks run.
    const mouseLook = useMouseLook.getState().active
    return this.action(async () => {
      const joinGeneration = this.generation
      if (facilityMovementBlocked(useSession.getState().sessionId)) throw new FacilityUseBlockedError()
      if (inputState.minigameOpen) throw new Error('먼저 미니게임을 마쳐주세요.')
      if (benchBusy(useSession.getState().sessionId)) throw new Error('먼저 벤치에서 일어나주세요.')
      if (fitnessBusy(useSession.getState().sessionId)) throw new Error('먼저 운동기구에서 내려와주세요.')
      if (telescopeBusy(useSession.getState().sessionId)) throw new Error('먼저 망원경에서 나와주세요.')
      if (tableBusy())
        throw new Error('먼저 진행 중인 경기 상태를 확인해주세요.')
      const s = useSession.getState()
      if (!s.mapCompatible) throw new Error('서버 맵 버전을 먼저 확인해주세요.')
      const tableId = bindAnchor(
        s.bindings,
        s.roomId,
        anchorId ?? s.focusedAnchorId,
        s.tables.map((t) => t.tableId),
      )
      if (!tableId)
        throw new Error('서버 테이블과 공원 배치 연결이 필요합니다.')
      if (s.tableId === tableId) return
      if (s.tableId) throw new Error('먼저 현재 테이블에서 일어나주세요.')
      if (anchorId !== undefined) {
        if (!canReachTable(avatars.get(s.sessionId)?.current, anchorId)) throw new Error('테이블 의자 가까이에서 앉기를 눌러주세요.')
        rememberRoamingView(s.sessionId, s.roomId, mouseLook)
        useTableLobby.setState({ panelOpen: false, joiningAnchorId: anchorId })
        useSession.setState({ focusedAnchorId: '' })
        clearRoamingInput()
      }
      this.stopMovement()
      try {
        if (this.tableClosing && !await this.tableClosing) throw new Error('이전 테이블 구독 종료를 먼저 확인해주세요.')
        await this.socket.request('TABLE_JOIN', { tableId }, ['TABLE_STATE'])
        // Only TABLE_STATE assigns a seat. Never send a userId, seatNumber or final position.
        const current = useSession.getState()
        if (this.generation !== joinGeneration || current.sessionId !== s.sessionId || current.roomId !== s.roomId || current.tableId !== tableId
          || !current.tableStates[tableId]?.seats.some(seat => seat.userId === current.sessionId))
          throw new Error('서버의 착석 상태를 확인하지 못했습니다. 테이블 상태를 다시 확인해주세요.')
      } finally {
        if (this.generation === joinGeneration && anchorId !== undefined && useTableLobby.getState().joiningAnchorId === anchorId) {
          useTableLobby.setState({ joiningAnchorId: '' })
          clearRoamingInput()
        }
      }
    })
  }
  leaveTable = () =>
    this.action(async () => {
      // Only a naturally eliminated HALLI_GALLI player sends the same TABLE_LEAVE mid-game; the server re-checks the engine.
      if (tableBusy() && !canLeaveEliminatedHalli(useSession.getState().sessionId))
        throw new Error('경기 진행·복구·정산 중에는 일어날 수 없습니다.')
      await this.socket.request('TABLE_LEAVE', {}, ['TABLE_LEFT'])
    })
  selectOmok = () => this.selectGame('OMOK', useSession.getState().tableStates[useSession.getState().tableId]?.betAmountPerPlayer ?? NaN)
  selectGame = (code: TableGameCode, betAmountPerPlayer: number, targetScore?: number) =>
    this.action(async () => {
      const s = useSession.getState(),
        table = s.tableStates[s.tableId]
      if (tableBusy() || !table || table.selectorUserId !== s.sessionId)
        throw new Error(
          '대기 중인 테이블의 게임 선택 담당자만 선택할 수 있습니다.',
        )
      const payload = gameSelection(code, betAmountPerPlayer, targetScore)
      await this.socket.request('GAME_SELECT', payload, [
        'TABLE_STATE',
      ])
    })
  setReady = (ready: boolean) =>
    this.action(async () => {
      const s = useSession.getState()
      if (tableBusy() || !['OMOK', 'DICE', 'ONE_CARD', 'LIAR_BRIDGE', 'DICE_LEDGER', 'ALKKAGI', 'HALLI_GALLI', 'STONE_RUMBLE'].includes(s.tableStates[s.tableId]?.gameCode ?? ''))
        throw new Error('플레이 가능한 게임을 선택한 대기 테이블에서 준비해주세요.')
      const table = s.tableStates[s.tableId]
      if (ready && !isTableGamePlayable(table.gameCode)) throw new Error(GAME_CONSTRUCTION_NOTICE)
      if (ready && (table.betAmountPerPlayer == null || table.betAmountPerPlayer < 0)) throw new Error('확정 참가비를 먼저 확인해주세요.')
      await this.socket.request('READY_SET', ready
        ? { ready, betAmountPerPlayer: table.betAmountPerPlayer, expectedVersion: table.version }
        : { ready }, ['TABLE_STATE'])
    })
  checkStart = () =>
    this.action(() =>
      this.socket.request('GAME_START_CHECK', {}, ['GAME_START_STATE']),
    )
  private stoneSettledInLobby(gameId: string) {
    const state = useGame.getState(), session = useSession.getState()
    return !!session.tableId && waitingForRound(state.start, session.tableId)
      && !state.permittedGameId && state.completedGameId === gameId
      && [state.result, state.lastResult].some(result => result?.gameSessionId === gameId && result.settlementStatus === 'SETTLED')
  }
  private recoverStoneInput(gameId: string): Promise<Envelope> {
    if (this.stoneRecoveryFlight?.gameId === gameId) return this.stoneRecoveryFlight.promise
    let requestId = ''
    const request = this.socket.request('GAME_RECONNECT_CHECK', {}, ['GAME_CONNECTION_STATE'], id => {
      requestId = id; this.stoneRecoveryRequests.set(id, gameId)
    })
    const flight = { gameId, promise: request.finally(() => {
      this.stoneRecoveryRequests.delete(requestId)
      if (this.stoneRecoveryFlight === flight) this.stoneRecoveryFlight = null
    }) }
    this.stoneRecoveryFlight = flight
    return flight.promise
  }
  checkRecovery = () => this.action(() => {
    const gameId = this.stoneRecoveryGameId, state = useGame.getState()
    return gameId && (state.permittedGameId || state.completedGameId) === gameId
      ? this.recoverStoneInput(gameId)
      : this.socket.request('GAME_RECONNECT_CHECK', {}, ['GAME_CONNECTION_STATE'])
  })
  checkGame = () =>
    this.action(async () => {
      const s = useGame.getState(),
        gameId = s.game?.gameId ?? s.permittedGameId
      if (!gameId) throw new Error('서버에서 확인한 경기 ID가 없습니다.')
      let id = ''
      const spectator = s.game?.role === 'SPECTATOR', owner = this.gameWatchRequestId
      if (spectator && !this.spectator.accepts(gameId)) throw new Error('현재 관전 상태를 다시 확인해주세요.')
      try {
        await this.socket.request('GAME_STATE_CHECK', { gameId }, ['GAME_STATE'], requestId => {
          id = requestId
          if (spectator) this.spectatorChecks.set(id, owner)
        })
      } finally { this.spectatorChecks.delete(id) }
    })
  checkResult = () =>
    this.action(async () => {
      const s = useGame.getState()
      const own = useSession.getState(), gameId = s.permittedGameId || s.completedGameId
      if (
        !gameId || !own.sessionId || !own.tableId ||
        !own.tableStates[own.tableId]?.seats.some(seat => seat.userId === own.sessionId) ||
        s.watchedGameId || s.game?.role === 'SPECTATOR' ||
        (s.start?.tableId && s.start.tableId !== own.tableId)
      )
        throw new Error('본인이 참가한 종료 경기만 확인할 수 있습니다.')
      await this.socket.request(
        'GAME_RESULT_CHECK',
        { gameSessionId: gameId },
        ['GAME_RESULT'],
      )
    })
  /** Seated in a lobby again with nothing active: the tab's game ID survived only in sessionStorage. */
  private resultRecoverable(owner: string, gameId: string) {
    const s = useSession.getState(), g = useGame.getState()
    return !!owner && s.sessionId === owner && this.ownProfile?.userId === owner && s.status === 'connected'
      && this.mapReady && this.socket.connected && !!s.tableId && !!s.tableStates[s.tableId]?.seats.some(seat => seat.userId === owner)
      // The server's WAITING for this table: the restored result can close into the next round. Without it
      // (the seat's start state precedes CHANNEL_JOIN) a restored result would hold the tablet lobby.
      && waitingForRound(g.start, s.tableId)
      // RESTORED/ELIMINATED keep the active game first; UNKNOWN/PENDING/EXPIRED/UNAVAILABLE are not a lobby.
      && ['LOBBY', 'FINISHED'].includes(g.recovery)
      && !g.permittedGameId && !g.watchedGameId && !g.game && !g.result && !g.lastResult
      && (!g.completedGameId || g.completedGameId === gameId)
  }
  /** History REST names the latest own ended game; only this tab's own game is re-read with GAME_RESULT_CHECK. */
  private discoverResult() {
    const owner = useSession.getState().sessionId, gameId = readTabGame(owner), start = useGame.getState().start
    // One attempt per connection and start revision: the table's return to WAITING retries a game that
    // history did not list yet (DB receipt still pending), without a request per message.
    const scope = JSON.stringify([this.generation, start?.tableId ?? null, start?.revision ?? -1])
    if (!this.active || this.resultDiscovering === this.generation || this.resultDiscovery === scope
      || !gameId || !this.resultRecoverable(owner, gameId)) return
    const generation = this.resultDiscovering = this.generation
    this.resultDiscovery = scope
    const current = () => this.active && generation === this.generation
      && readTabGame(owner) === gameId && this.resultRecoverable(owner, gameId)
    void (async () => {
      let requestId = ''
      try {
        const latest = latestEndedGame(await this.getJSON('/api/v1/users/me/games?size=1', { signal: this.bootAbort?.signal }))
        // A newer game from another tab or device, or an older one, is left to an explicit history view.
        if (latest !== gameId || !current()) return
        useGame.setState({ resultCandidateGameId: gameId })
        await this.socket.request('GAME_RESULT_CHECK', { gameSessionId: gameId }, ['GAME_RESULT'], id => {
          requestId = id
          this.quietResultChecks.add(id)
        })
      } catch { /* Best effort: pushes for the seat and explicit checks still work without it. */ } finally {
        this.quietResultChecks.delete(requestId)
        if (this.resultDiscovering === generation) this.resultDiscovering = -1
        if (generation === this.generation && useGame.getState().resultCandidateGameId === gameId)
          useGame.setState({ resultCandidateGameId: '' })
      }
    })()
  }
  forfeitGame = (gameId: string, retry = false) => this.action(async () => {
    const own = useSession.getState(), state = useGame.getState()
    if (own.status !== 'connected' || own.sessionId === '' || state.permittedGameId !== gameId
      || !(retry ? canRetryForfeit(own.sessionId, state) : canStartForfeit(own.sessionId, state)))
      throw new Error('현재 본인의 경기와 복구 상태를 확인해주세요.')
    const previous = useForfeit.getState().attempt
    const attempt = { userId: own.sessionId, gameId,
      actionId: previous?.userId === own.sessionId && previous.gameId === gameId ? previous.actionId : crypto.randomUUID(),
      status: 'pending' as const, error: '' }
    const generation = this.generation
    useForfeit.setState({ attempt }); useGame.setState({ pending: true, error: '' })
    // WAITING may arrive before the correlated receipt and retire the active game.
    const sameGame = () => { const s = useGame.getState(); return s.permittedGameId === gameId
      || (!s.permittedGameId && s.completedGameId === gameId) }
    const current = () => this.active && generation === this.generation && useSession.getState().sessionId === attempt.userId
      && sameGame() && useForfeit.getState().attempt === attempt
    try {
      const reply = await this.socket.request('GAME_FORFEIT', { gameId, actionId: attempt.actionId }, ['GAME_FORFEIT_RESULT'], id => {
        this.forfeitRequests.set(id, JSON.stringify([own.sessionId, gameId]))
        if (this.forfeitRequests.size > 64) this.forfeitRequests.delete(this.forfeitRequests.keys().next().value!)
      })
      if (!current()) return
      const receipt = parseForfeitResult(reply.payload, attempt)
      useForfeit.setState({ attempt: { ...attempt, status: 'approved' } })
      useGame.setState(s => ({ awaitingVersion: Math.max(s.awaitingVersion, receipt.version) }))
    } catch (cause) {
      if (current()) {
        const code = cause instanceof ServerError ? cause.code : ''
        useForfeit.setState({ attempt: { ...attempt, status: definiteForfeitRejection(code) ? 'rejected' : 'uncertain', error: forfeitError(code) } })
        throw cause
      }
    } finally {
      if (generation === this.generation && sameGame()) useGame.setState({ pending: false })
    }
  })
  placeOmok = (x: number, y: number) =>
    this.action(async () => {
      const own = useSession.getState(),
        s = useGame.getState()
      if (own.status !== 'connected' || !canPlace(own.sessionId, x, y))
        throw new Error('본인 차례와 최신 경기 상태를 확인해주세요.')
      const game = s.game!
      const generation = this.generation
      useGame.setState({ pending: true, error: '' })
      try {
        await this.socket.request(
          'GAME_ACTION_SEND',
          {
            gameId: game.gameId,
            actionId: crypto.randomUUID(),
            expectedVersion: game.version,
            input: { x, y },
          },
          ['GAME_ACTION_RESULT'],
        )
      } catch (error) {
        const explicitRejection =
          error instanceof ServerError &&
          [
            'GAME_ACTION_FORBIDDEN_MOVE',
            'GAME_ACTION_INVALID_ACTION',
            'GAME_ACTION_NOT_YOUR_TURN',
          ].includes(error.code)
        if (
          generation === this.generation &&
          useGame.getState().permittedGameId === game.gameId
        )
          useGame.setState({
            uncertain: !explicitRejection,
            error:
              error instanceof ServerError && error.code === 'GAME_ACTION_FORBIDDEN_MOVE'
                ? '흑은 삼삼·사사·장목 금수에 놓을 수 없어요. 빨간 표시를 확인해주세요.'
                : error instanceof Error
                ? error.message
                : '착수 결과를 확인해주세요.',
          })
        throw error
      } finally {
        if (generation === this.generation) useGame.setState({ pending: false })
      }
    })
  actOmokUndo = (input: OmokUndoInput) => this.action(async () => {
    const own = useSession.getState(), game = useGame.getState().game
    if (own.status !== 'connected' || !game?.omok || !canUndoAction(own.sessionId, input))
      throw new Error('무르기 요청·응답 권한과 최신 상태를 확인해주세요.')
    const generation = this.generation
    useGame.setState({ pending: true, error: '' })
    try {
      await this.socket.request('GAME_ACTION_SEND', { gameId: game.gameId, actionId: crypto.randomUUID(),
        expectedVersion: game.version, input: { ...input } }, ['GAME_ACTION_RESULT'])
    } catch (cause) {
      if (generation === this.generation && useGame.getState().permittedGameId === game.gameId)
        useGame.setState({ uncertain: !(cause instanceof ServerError && ['GAME_ACTION_INVALID_ACTION', 'GAME_ACTION_NOT_YOUR_TURN'].includes(cause.code)) })
      throw cause
    } finally {
      if (generation === this.generation) useGame.setState({ pending: false })
    }
  })
  actOmokDraw = (input: OmokDrawInput) => this.action(async () => {
    const own = useSession.getState(), game = useGame.getState().game
    if (own.status !== 'connected' || !game?.omok || !canDrawAction(own.sessionId, input))
      throw new Error('무승부 요청·응답 권한과 최신 상태를 확인해주세요.')
    const generation = this.generation
    useGame.setState({ pending: true, error: '' })
    try {
      await this.socket.request('GAME_ACTION_SEND', { gameId: game.gameId, actionId: crypto.randomUUID(),
        expectedVersion: game.version, input: { ...input } }, ['GAME_ACTION_RESULT'])
    } catch (cause) {
      if (generation === this.generation && useGame.getState().permittedGameId === game.gameId)
        useGame.setState({ uncertain: !(cause instanceof ServerError && ['GAME_ACTION_INVALID_ACTION', 'GAME_ACTION_NOT_YOUR_TURN'].includes(cause.code)) })
      throw cause
    } finally {
      if (generation === this.generation) useGame.setState({ pending: false })
    }
  })
  actDice = (kind: 'roll' | 'bank', selectedIds: readonly number[]) => this.action(async () => {
    const own = useSession.getState(), g = useGame.getState().game
    if (own.status !== 'connected' || !g?.dice || !canPlayDice(own.sessionId) || !validDiceAction(g.dice, kind, selectedIds))
      throw new Error('본인 차례·득점 선택·최신 주사위 상태를 확인해주세요.')
    const generation = this.generation
    useGame.setState({ pending: true, error: '' })
    try {
      await this.socket.request('GAME_ACTION_SEND', { gameId: g.gameId, actionId: crypto.randomUUID(),
        expectedVersion: g.version, input: { kind, selectedIds: [...selectedIds] } }, ['GAME_ACTION_RESULT'])
    } catch (error) {
      if (generation === this.generation && useGame.getState().permittedGameId === g.gameId)
        useGame.setState({ uncertain: !(error instanceof ServerError && ['GAME_ACTION_INVALID_ACTION', 'GAME_ACTION_NOT_YOUR_TURN'].includes(error.code)),
          error: error instanceof Error ? error.message : '주사위 처리 결과를 확인해주세요.' })
      throw error
    } finally { if (generation === this.generation) useGame.setState({ pending: false }) }
  })
  actOneCard = (input: OneCardInput) => this.action(async () => {
    const own = useSession.getState(), g = useGame.getState().game
    if (own.status !== 'connected' || !g?.onecard || !canActOneCard(own.sessionId, input))
      throw new Error('본인 손패·차례·반응 시간·최신 경기 상태를 확인해주세요.')
    const generation = this.generation
    useGame.setState({ pending: true, error: '' })
    try {
      await this.socket.request('GAME_ACTION_SEND', { gameId: g.gameId, actionId: crypto.randomUUID(),
        expectedVersion: g.version, input: { ...input } }, ['GAME_ACTION_RESULT'])
    } catch (error) {
      if (generation === this.generation && useGame.getState().permittedGameId === g.gameId)
        useGame.setState({ uncertain: !(error instanceof ServerError && ['GAME_ACTION_INVALID_ACTION', 'GAME_ACTION_NOT_YOUR_TURN'].includes(error.code)),
          error: error instanceof Error ? error.message : '원카드 처리 결과를 확인해주세요.' })
      throw error
    } finally { if (generation === this.generation) useGame.setState({ pending: false }) }
  })
  private alkkagiSocialRequests = new Set<string>()
  private alkkagiCursorAt = -Infinity
  private alkkagiCursorPending = false
  sendAlkkagiSpectator = async (input: Record<string, unknown>): Promise<boolean> => {
    const session = useSession.getState(), state = useGame.getState(), g = state.game
    if (!this.active || !this.socket.connected || session.status !== 'connected' || !session.mapCompatible || !session.roomId
      || !g?.alkkagi || g.role !== 'SPECTATOR' || g.alkkagi.stage !== 'AIMING'
      || state.watchedGameId !== g.gameId || !this.spectator.accepts(g.gameId) || state.lastResult) return false
    const cursor = input.kind === 'CURSOR', at = performance.now()
    if (cursor && (this.alkkagiCursorPending || at - this.alkkagiCursorAt < 90)) return false
    if (cursor) { this.alkkagiCursorAt = at; this.alkkagiCursorPending = true }
    let requestId = ''
    try {
      await this.socket.request('ALKKAGI_SPECTATOR_SEND', { ...input, gameId: g.gameId, eventId: crypto.randomUUID(), basedOnVersion: g.version },
        ['ALKKAGI_SPECTATOR_EVENT'], id => { requestId = id; this.alkkagiSocialRequests.add(id) })
      return true
    } catch { return false }
    finally { this.alkkagiSocialRequests.delete(requestId); if (cursor) this.alkkagiCursorPending = false }
  }
  actStoneRumble = (input: import('../../game/stone-rumble/protocol').StoneAction, clearQueuedActions = false): Promise<boolean> => {
    if (input.kind !== 'control') return this.sendStoneAction(input)
    const state = useGame.getState(), game = state.game
    if (!game?.stone || game.role !== 'PLAYER' || useSession.getState().status !== 'connected'
      || game.gameId !== state.permittedGameId || state.recovery !== 'RESTORED'
      || game.stone.status !== 'PLAYING' || game.stone.phase === 'LOADING'
      || !game.stone.players.find(player => player.userId === useSession.getState().sessionId)?.alive) {
      this.stoneControls.reset()
      return Promise.resolve(false)
    }
    return this.stoneControls.send(game.gameId, input, clearQueuedActions)
  }
  private sendStoneAction = async (input: import('../../game/stone-rumble/protocol').StoneAction): Promise<boolean> => {
    const session = useSession.getState(), state = useGame.getState(), game = state.game
    if (!game?.stone || game.role !== 'PLAYER' || session.status !== 'connected'
      || game.gameId !== state.permittedGameId || state.recovery !== 'RESTORED' || game.stone.status !== 'PLAYING') return false
    if (input.kind === 'control' && (game.stone.phase === 'LOADING'
      || !game.stone.players.find(player => player.userId === session.sessionId)?.alive)
      || input.kind === 'scene_ready' && game.stone.phase !== 'LOADING') return false
    let requestId = ''
    try {
      await this.socket.request('GAME_ACTION_SEND', { gameId: game.gameId, actionId: crypto.randomUUID(), expectedVersion: game.version, input: { ...input } }, ['GAME_ACTION_RESULT'],
        id => { requestId = id; this.stoneControlRequests.set(id, game.gameId) })
      return true
    } catch { return false }
    finally { this.stoneControlRequests.delete(requestId) }
  }
  actAlkkagi = (input: Record<string, unknown>) => this.action(async () => {
    const own = useSession.getState(), s = useGame.getState(), g = s.game
    if (own.status !== 'connected' || !g?.alkkagi || g.role !== 'PLAYER' || g.gameId !== s.permittedGameId
      || s.recovery !== 'RESTORED' || s.pending || s.uncertain || g.version < s.awaitingVersion
      || g.alkkagi.status !== 'PLAYING' || (input.type !== 'CARD_CHOOSE' && g.alkkagi.turnUserId !== own.sessionId))
      throw new Error('본인 차례와 최신 알까기 상태를 확인해주세요.')
    const generation = this.generation
    useGame.setState({ pending: true, error: '' })
    try {
      await this.socket.request('GAME_ACTION_SEND', { gameId: g.gameId, actionId: crypto.randomUUID(), expectedVersion: g.version, input }, ['GAME_ACTION_RESULT'])
    } catch (error) {
      if (generation === this.generation && useGame.getState().permittedGameId === g.gameId)
        useGame.setState({ uncertain: !(error instanceof ServerError), error: error instanceof Error ? error.message : '알까기 처리 결과를 확인해주세요.' })
      throw error
    } finally { if (generation === this.generation) useGame.setState({ pending: false }) }
  })
  actBridge = (input: BridgeInput) => this.action(async () => {
    const own = useSession.getState(), g = useGame.getState().game
    if (own.status !== 'connected' || !g?.bridge || !canActBridge(own.sessionId, input))
      throw new Error('본인 차례·현재 판단자·비공개 눈·최신 경기 상태를 확인해주세요.')
    const generation = this.generation
    useGame.setState({ pending: true, error: '' })
    try {
      await this.socket.request('GAME_ACTION_SEND', { gameId: g.gameId, actionId: crypto.randomUUID(), expectedVersion: g.version, input: { ...input } }, ['GAME_ACTION_RESULT'])
    } catch (error) {
      if (generation === this.generation && useGame.getState().permittedGameId === g.gameId)
        useGame.setState({ uncertain: !(error instanceof ServerError && ['GAME_ACTION_INVALID_ACTION', 'GAME_ACTION_NOT_YOUR_TURN'].includes(error.code)),
          error: error instanceof Error ? error.message : '다리 경기 처리 결과를 확인해주세요.' })
      throw error
    } finally { if (generation === this.generation) useGame.setState({ pending: false }) }
  })
  actLedger = (input: LedgerInput) => this.action(async () => {
    const own = useSession.getState(), g = useGame.getState().game
    if (own.status !== 'connected' || !g?.ledger || !canActLedger(own.sessionId, input))
      throw new Error('본인 차례·남은 굴림·빈 칸·최신 장부 상태를 확인해주세요.')
    const generation = this.generation
    useGame.setState({ pending: true, error: '' })
    try {
      await this.socket.request('GAME_ACTION_SEND', { gameId: g.gameId, actionId: crypto.randomUUID(), expectedVersion: g.version,
        input: input.kind === 'roll' ? { kind: 'roll', keepIds: [...input.keepIds] } : { kind: 'score', category: input.category } },
      ['GAME_ACTION_RESULT'])
    } catch (error) {
      if (generation === this.generation && useGame.getState().permittedGameId === g.gameId)
        useGame.setState({ uncertain: !(error instanceof ServerError && ['GAME_ACTION_INVALID_ACTION', 'GAME_ACTION_NOT_YOUR_TURN'].includes(error.code)),
          error: error instanceof Error ? error.message : '주사위 장부 처리 결과를 확인해주세요.' })
      throw error
    } finally { if (generation === this.generation) useGame.setState({ pending: false }) }
  })
  /**
   * HALLI_GALLI. The server accepts one game action per socket, so a bell pressed while this tab's own flip or ring
   * is in flight waits in a single slot with the window the player saw. It is sent inside the same action() job
   * after that request is answered: no second lock, no window swap, dropped on any unanswered request or reconnect.
   */
  private halliJob: object | null = null
  private halliQueued: { gameId: string; bellWindowId: number; expectedVersion: number } | null = null
  flipHalli = () => {
    const own = useSession.getState(), g = useGame.getState().game
    if (own.status !== 'connected' || !g?.halli || !canFlipHalli(own.sessionId, estimatedServerTime())) return Promise.resolve(false)
    return this.action(() => this.runHalli(g.gameId, { kind: 'flip' }, g.version))
  }
  ringHalli = (bellWindowId: number, expectedVersion: number) => {
    const own = useSession.getState(), g = useGame.getState().game
    if (own.status !== 'connected' || !g?.halli || !canRingHalli(own.sessionId, bellWindowId)) return Promise.resolve(false)
    if (this.halliJob) {
      if (this.halliQueued) return Promise.resolve(false)
      this.halliQueued = { gameId: g.gameId, bellWindowId, expectedVersion }
      markHalliRing(g.gameId, bellWindowId, 'queued')
      return Promise.resolve(true)
    }
    if (this.actionBusy) { halliNotice('다른 요청을 처리하는 중이라 종을 보내지 못했어요.'); return Promise.resolve(false) }
    return this.action(() => this.runHalli(g.gameId, { kind: 'ring', bellWindowId }, expectedVersion))
  }
  private async runHalli(gameId: string, input: HalliInput, expectedVersion: number) {
    const job = {}, generation = this.generation
    this.halliJob = job
    try {
      let answered = await this.sendHalli(gameId, input, expectedVersion, generation)
      while (answered && this.halliQueued && this.halliJob === job && generation === this.generation) {
        const ring = this.halliQueued, s = useGame.getState()
        this.halliQueued = null
        if (s.permittedGameId !== ring.gameId || s.game?.gameId !== ring.gameId || s.game.halli?.status !== 'PLAYING') {
          markHalliRing(ring.gameId, ring.bellWindowId, null); break
        }
        answered = await this.sendHalli(ring.gameId, { kind: 'ring', bellWindowId: ring.bellWindowId }, ring.expectedVersion, generation)
      }
    } finally {
      if (this.halliJob === job) {
        const left = this.halliQueued
        this.halliJob = null; this.halliQueued = null
        if (left) markHalliRing(left.gameId, left.bellWindowId, null)
      }
    }
  }
  /** Returns whether the server answered; only an unknown outcome is uncertain and rethrown. */
  private async sendHalli(gameId: string, input: HalliInput, expectedVersion: number, generation: number) {
    if (input.kind === 'ring') markHalliRing(gameId, input.bellWindowId, 'sent')
    useGame.setState({ pending: true, error: '' })
    try {
      await this.socket.request('GAME_ACTION_SEND', { gameId, actionId: crypto.randomUUID(), expectedVersion,
        input: input.kind === 'ring' ? { kind: 'ring', bellWindowId: input.bellWindowId } : { kind: 'flip' } }, ['GAME_ACTION_RESULT'])
      return true
    } catch (error) {
      const outcome = classifyHalliError(input.kind, error instanceof ServerError ? error.code : null)
      // A definite rejection frees the window again; an unknown result may have been charged, so it stays blocked.
      if (input.kind === 'ring' && outcome.kind !== 'uncertain') markHalliRing(gameId, input.bellWindowId, null)
      if (generation === this.generation && useGame.getState().permittedGameId === gameId) {
        if (outcome.kind === 'uncertain') useGame.setState({ uncertain: true, error: outcome.message })
        else halliNotice(outcome.message)
      }
      if (outcome.kind === 'uncertain') throw error
      return true
    } finally { if (generation === this.generation) useGame.setState({ pending: false }) }
  }
  /** gameId must come from an approved public game reference; no guessed table→game IDs. */
  watchGame = async (gameId: string): Promise<boolean> => {
      const session = useSession.getState()
      const reference = publicMatchService.find({ channelId: session.roomId, tableId: session.watchedTableId })
      if (
        !gameId.trim() ||
        gameId.length > 120 ||
        tableBusy() ||
        session.tableId || !session.watchedTableId || session.status !== 'connected' || !session.mapCompatible ||
        !reference || reference.gameId !== gameId || reference.tableId !== session.watchedTableId || reference.channelId !== session.roomId
      )
      { this.report('관전 가능한 경기 정보를 확인해주세요.'); return false }
      this.spectatorIntent = { userId: session.sessionId, channelId: session.roomId, tableId: session.watchedTableId, benchScope: benchViewScope(session) }
      useTableLobby.setState({ spectatorRequested: true, spectatorError: '', panelOpen: false })
      return this.spectator.set({ gameId, scope: JSON.stringify([this.generation, session.sessionId, session.roomId, session.watchedTableId, benchViewScope(session)]) }, true)
  }
  watchBench = async (anchorId: string, observeOnly = false): Promise<boolean> => {
    const attempt=++this.npcWatchAttempt
    const s = useSession.getState(), scope = benchViewScope(s)
    if (!scope || benchTable(s.benchId)?.id !== anchorId) return false
    if (!await this.watchTable(anchorId, false)) return false
    const current = useSession.getState()
    if (scope !== benchViewScope(current)) { this.closeTable(); return false }
    if (observeOnly) return true
    const ref = publicMatchService.find({ channelId: s.roomId, tableId: current.watchedTableId })
    if (!ref) {
      if (!residentsEnabled()) return false
      const generation=this.generation, inspection=this.inspection
      try {
        const value=await this.requestJSON(companionPath('status'))
        const latest=useSession.getState()
        if (!this.active || attempt!==this.npcWatchAttempt || generation!==this.generation || inspection!==this.inspection
          || scope!==benchViewScope(latest) || latest.watchedTableId!==current.watchedTableId) return false
        if (!acceptCompanions(value) || !observedNpcPractice()) return false
        this.spectatorIntent={userId:s.sessionId,channelId:s.roomId,tableId:current.watchedTableId,benchScope:scope,npcPractice:true}
        useTableLobby.setState({spectatorRequested:true,spectatorError:''})
        syncPracticeSpectator()
        return true
      } catch (error) { this.report(error); return false }
    }
    this.spectatorIntent = { userId: s.sessionId, channelId: s.roomId, tableId: current.watchedTableId, benchScope: scope }
    useTableLobby.setState({ spectatorRequested: true, spectatorError: '' })
    return this.spectator.set({ gameId: ref.gameId, scope: JSON.stringify([this.generation, s.sessionId, s.roomId, current.watchedTableId, scope]) }, true)
  }
  unwatchGame = async (preserveInspection = false): Promise<boolean> => {
    ++this.npcWatchAttempt
    if (this.spectatorIntent?.npcPractice) {
      this.spectatorIntent=null
      useTableLobby.setState({spectatorRequested:false,spectatorStatus:'idle',spectatorError:''})
      resetBenchSpectator()
      if (!preserveInspection) focusParkCanvas()
      return true
    }
    if (this.spectatorIntent?.awaitingStart) { this.closeTable(); return true }
    const ending = useSession.getState(), generation = this.generation, inspection = this.inspection
    this.spectatorIntent = null
    useTableLobby.setState({ spectatorRequested: false })
    const approved = await this.spectator.set(null, true)
    const current = useSession.getState()
    if (approved && generation === this.generation && inspection === this.inspection
      && current.sessionId === ending.sessionId && current.roomId === ending.roomId
      && current.focusedAnchorId === ending.focusedAnchorId && !this.spectatorIntent && !useGame.getState().watchedGameId) {
      resetBenchSpectator()
      // A standing spectator has no table panel after leaving the match.
      // Retaining focusedAnchorId silently disables G and other park controls.
      if (!preserveInspection && !current.benchId && !current.tableId) this.closeTable()
      if (!preserveInspection) focusParkCanvas()
    }
    return approved
  }
  closeTable = () => {
    ++this.npcWatchAttempt
    this.spectatorIntent = null
    resetBenchSpectator()
    useTableLobby.setState({ spectatorRequested: false, panelOpen: false, entryNotice: null })
    const cleanup = this.spectator.set(null, true)
    const tableId = useSession.getState().watchedTableId
    ++this.inspection
    if (this.tableWatchRequestId) this.obsoleteWatchRequests.add(this.tableWatchRequestId)
    if (this.obsoleteWatchRequests.size > 64) this.obsoleteWatchRequests.delete(this.obsoleteWatchRequests.values().next().value!)
    this.tableWatchRequestId = ''
    useTableLobby.setState({ tableId: '', status: 'idle', error: '', requestId: '' })
    resetSeatedLook()
    useSession.setState({ focusedAnchorId: '' })
    if (!tableId || this.tableClosing) return
    const generation = this.generation
    const task = cleanup.then(async ok => {
      if (!ok || generation !== this.generation || !this.active) return false
      if (useSession.getState().watchedTableId !== tableId) return true
      try { await this.socket.request('TABLE_UNWATCH', {}, ['TABLE_WATCH_LEFT']); return true }
      catch (error) {
        if (error instanceof ServerError && error.code === 'NOT_WATCHING') return true
        this.report(error); return false
      }
    }).finally(() => { if (this.tableClosing === task) this.tableClosing = null })
    this.tableClosing = task
  }
}

export { ServerError, avatars }
