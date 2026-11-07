import { HallPreview, type HallView } from '../serviceHall/previewModel'
import type { Point } from '../serviceHall/plan'
import { ChefPreview, type ChefAction, type ChefView } from '../chef/model'
import type { CoopClient } from './client'
import { PositionPlayback } from '../serviceHall/rendering/PositionPlayback'

export type HallDriver = Pick<HallPreview, 'view' | 'step' | 'navigate' | 'nearest' | 'blockedReason' | 'actionLabel' | 'press' | 'secondaryLabel' | 'secondaryBlockedReason' | 'pressSecondary' | 'closeStorage' | 'takeStored' | 'release'> & { online?: boolean }
export type ChefDriver = Pick<ChefPreview, 'view' | 'step' | 'action'> & { online?: boolean }

class TimedFeedback {
  private key = ''
  private at = 0
  read(message: string, round: number) {
    const now = performance.now(), key = `${round}:${message}`
    if (key !== this.key) { this.key = key; this.at = now }
    return now - this.at < 3500 ? message : ''
  }
}

export class OnlineHall implements HallDriver {
  private feedback = new TimedFeedback()
  readonly online = true
  private helper = new HallPreview()
  private playback = new PositionPlayback()
  private storageOpen = false
  private movementAt = 0
  private lastMove = '0.00:0.00'
  private lastVersion = -1
  private sendingMove = false
  private cleaningPressed = false
  private lastView?: HallView
  private round = -1
  constructor(private client: CoopClient) {}
  view(): HallView {
    const snapshot = this.client.snapshot!, pub = snapshot.publicState, hall = snapshot.privateState.hall!
    // 역할 변경 직후 React가 이전 장면을 해제하기 전 마지막 프레임을 보존한다.
    if (!hall && this.lastView) return this.lastView
    return this.lastView = { ...hall, position: this.helper.position, storageOpen: this.storageOpen && !pub.paused && pub.phase === 'PLAYING', elapsed: pub.elapsed, remaining: pub.remaining, message: this.feedback.read(pub.message, pub.round ?? 0), score: pub.score, served: pub.served, finished: pub.phase === 'FINISHED', revision: snapshot.version }
  }
  private sync() {
    const snapshot = this.client.snapshot, hall = snapshot?.privateState.hall
    if (!snapshot || !hall) return
    if (this.round !== (snapshot.publicState.round ?? 0)) {
      this.round = snapshot.publicState.round ?? 0
      this.helper.position = { ...hall.position }; this.storageOpen = false
      this.playback.reset(hall.position)
      this.cleaningPressed = false; this.lastMove = '0.00:0.00'; this.movementAt = 0
    }
    if (snapshot.version !== this.lastVersion) {
      this.lastVersion = snapshot.version
      // 확인되지 않은 입력을 누적하면 100ms 서버 틱마다 뒤로 보정되어 시선도 반전된다.
      // 충돌·위치는 서버값을 따르고 프레임 사이의 부드러운 표시는 HallMotion이 담당한다.
      this.playback.push(hall.position)
    }
    this.helper.tables = hall.tables; this.helper.carry = hall.carry; this.helper.pass = hall.pass
    this.helper.stored = hall.stored; this.helper.sake = hall.sake; this.helper.dirtyDishes = hall.dirtyDishes
    this.helper.washer = hall.washer; this.helper.held = hall.held; this.helper.elapsed = snapshot.publicState.elapsed
    if (snapshot.publicState.phase === 'FINISHED' || snapshot.publicState.paused) this.storageOpen = false
  }
  step(_dt: number, dx = 0, dz = 0) {
    this.sync()
    const position = this.client.snapshot?.privateState.hall?.position
    if (!this.client.playable && position) this.playback.reset(position)
    this.helper.position = this.playback.step(_dt)
    if (!this.client.playable || this.storageOpen) { dx = 0; dz = 0 }
    const now = performance.now(), value = `${dx.toFixed(2)}:${dz.toFixed(2)}`
    // Direction changes must not wait for the held-input heartbeat.
    if (this.client.playable && !this.sendingMove && (value !== this.lastMove || (dx !== 0 || dz !== 0) && now - this.movementAt > 150)) {
      this.movementAt = now; this.lastMove = value; this.sendingMove = true
      void this.client.act({ type: 'MOVE', dx, dz }, true)?.finally(() => { this.sendingMove = false })
    }
  }
  navigate(_point: Point) { /* 온라인 서빙은 키보드 MOVE만 전송한다. */ }
  private atServer<T>(read: () => T): T {
    this.sync()
    const predicted = this.helper.position
    this.helper.position = this.client.snapshot?.privateState.hall?.position ?? predicted
    try { return read() } finally { this.helper.position = predicted }
  }
  nearest() { return this.atServer(() => this.helper.nearest()) }
  blockedReason() {
    if (this.client.playable) return this.atServer(() => this.helper.blockedReason())
    const pub = this.client.snapshot?.publicState
    return pub?.paused ? '친구를 기다리고 있어요' : pub?.greeting.active ? '손님께 먼저 인사해 주세요' : pub?.phase === 'FINISHED' ? '영업이 끝났어요' : '잠시만 기다려 주세요'
  }
  actionLabel() { return this.blockedReason() ?? this.atServer(() => this.helper.actionLabel()) }
  press() {
    if (this.storageOpen || this.blockedReason()) return
    if (this.nearest()?.kind === 'storage' && !this.helper.carry.length) { this.openStorage(); return }
    const at = this.nearest()
    this.cleaningPressed = at?.kind === 'table' && this.helper.tables.find(table => table.id === at.id)?.status === 'dirty'
    void this.client.act({ type: 'MOVE', dx: 0, dz: 0 }, true)
    void this.client.act({ type: 'INTERACT' })
  }
  secondaryLabel() { this.sync(); return this.helper.secondaryLabel() }
  secondaryBlockedReason() { return !this.client.playable ? '영업 상태를 확인해주세요' : this.helper.secondaryBlockedReason() }
  pressSecondary() {
    if (this.storageOpen || this.secondaryBlockedReason()) return
    if (this.nearest()?.kind === 'fridge' && this.helper.sake) void this.client.act({ type: 'RETURN_SAKE' })
    else if (this.nearest()?.kind === 'storage') this.openStorage()
  }
  private openStorage() { if (this.helper.stored.length) { this.storageOpen = true; void this.client.act({ type: 'MOVE', dx: 0, dz: 0 }, true) } }
  closeStorage() { this.storageOpen = false }
  takeStored(id: string) { if (!this.storageOpen || this.secondaryBlockedReason()) return; this.storageOpen = false; void this.client.act({ type: 'TAKE_STORED', id }) }
  release() {
    if (this.cleaningPressed || this.client.snapshot?.privateState.hall?.clean) void this.client.act({ type: 'CLEAN_CANCEL' }, true)
    this.cleaningPressed = false
  }
}

export class OnlineChef implements ChefDriver {
  private feedback = new TimedFeedback()
  readonly online = true
  private ingredient: ChefView['ingredient'] = 'tomato'
  private lastView?: ChefView
  private lastCompleted = 0
  private round = -1
  constructor(private client: CoopClient) {}
  view(): ChefView {
    const snapshot = this.client.snapshot!, pub = snapshot.publicState
    if (!snapshot.privateState.chef && this.lastView) return this.lastView
    const chef = snapshot.privateState.chef
    if (chef && ((chef.completed ?? 0) !== this.lastCompleted || this.round !== (pub.round ?? 0))) {
      this.round = pub.round ?? 0
      this.lastCompleted = chef.completed ?? 0
      this.ingredient = chef.pantry?.[0] ?? 'tomato'
    }
    const receipt = this.client.store.getState().result
    return this.lastView = { ...snapshot.privateState.chef!, ingredient: this.ingredient, revision: snapshot.version, seconds: pub.remaining, started: pub.phase === 'PLAYING', message: this.feedback.read(pub.message, pub.round ?? 0),
      cooperative: { round: pub.round ?? 0, restart: pub.restart ? { id: pub.restart.id, own: pub.restart.requestedBy === this.client.transport.scope().userId } : null,
        phase: pub.phase, endReason: pub.endReason, greetingOutcome: pub.greeting.outcome, greetingBonus: pub.greeting.bonus, greeting: pub.greeting.active, answered: pub.greeting.answered, speech: pub.greeting.speech, countdown: pub.countdown, paused: pub.paused, score: pub.score, served: pub.served, rankingEligible: pub.rankingEligible,
        result: pub.phase === 'FINISHED' ? { score: pub.score, reward: receipt?.status === 'SETTLED' ? `받은 엽전 ${receipt.coinsGranted}냥 · 오늘 남은 한도 ${receipt.remainingToday}냥` : receipt?.status === 'UNAVAILABLE' ? '이번 경기의 보상을 확인할 수 없어요' : '개인 보상 확인 중', ranking: receipt?.rankingStatus === 'REGISTERED' ? `${pub.rankingMode ?? (pub.chefVR ? 'VR' : 'PC')} 팀 기록 등록 완료` : pub.rankingEligible ? `${pub.rankingMode ?? (pub.chefVR ? 'VR' : 'PC')} 팀 기록 확인 중` : '팀 랭킹 미등록 · 엽전 보상 가능' } : undefined } }
  }
  step(_dt: number) {}
  action(action: ChefAction) {
    if (action.type === 'restartRequest') { if (this.client.playable) void this.client.act({ type: 'RESTART_REQUEST' }); return }
    if (action.type === 'restartAccept' || action.type === 'restartDecline') {
      const request = this.client.snapshot?.publicState.restart
      if (request && request.requestedBy !== this.client.transport.scope().userId) {
        void this.client.act({ type: 'RESTART_REPLY', requestId: request.id, accept: action.type === 'restartAccept' })
      }
      return
    }
    if (action.type === 'ready') { void this.client.act({ type: 'READY', ready: true }); return }
    if (action.type === 'greet') { if (!this.client.inputBlocked && !this.client.snapshot?.publicState.paused) void this.client.act({ type: 'GREET' }); return }
    if (action.type === 'select') { this.ingredient = action.ingredient; return }
    if (!this.client.playable) return
    if (action.type === 'thread') void this.client.act({ type: 'THREAD', ingredient: action.ingredient ?? this.ingredient })
    if (action.type === 'choose') void this.client.act({ type: 'CHOOSE', id: action.id })
    if (action.type === 'unthread') void this.client.act({ type: 'UNTHREAD' })
    if (action.type === 'submit') void this.client.act({ type: 'SUBMIT' })
  }
}
