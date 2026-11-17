import type { Object3D, Vector3 } from 'three'
import { tableBusy, useGame } from '../../game/store'
import { avatars, useSession, type Pose } from '../../network/worldClient'
import { TABLES } from '../../park/mapConfig'
import { parkRuntime } from '../../park/runtime/runtime'
import { STONE_RUMBLE_ANCHOR_ID } from '../stone-rumble/entrance'
import { parkXRView } from '../../world/xrView'
import { XRCanvas } from '../../features/parkXR/XRCanvas'
import { getGathering, returnToWaiting } from '../../features/tableLobby/gathering'
import { availableForBet, canAffordBet, startFailureNotice, type ReadyBalance } from '../../features/tableLobby/readyBalance'
import { tableEntry } from '../../features/tableLobby/tableEntry'
import { canReachTable } from '../../features/tableLobby/tableReach'
import { manualStartAllowed, preparationContext, usePreparationPort } from '../../features/tableLobby/tabletModel'
import { useTabletStartStatus } from '../../features/tableLobby/TabletLobbyClient'
import { drawWebPanel, loadPanelArt, loadPanelFont, panelBox, panelButton, panelPhoto } from '../../features/parkXR/webPanelArt'
import coinSrc from '../../assets/entry/yeopjeon-icon.webp'
import { ownOmokGame } from './OmokXR'

interface Button {
  x: number
  y: number
  width: number
  height: number
  label: string
  run: () => void
  secondary: boolean
}
type Label = { text: string; y: number; size?: number; x: number; max: number }
type RosterCard = { name: string; ready: boolean; occupied: boolean }
const width = 1536, height = 940
const money = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString('ko-KR') + '냥'

export class OmokLobbyXR {
  private readonly panel = new XRCanvas(width, height, 1.43)
  private readonly paper = new Image()
  private readonly gameArt = loadPanelArt('/art/tablet/games.webp', () => this.draw())
  private readonly coinArt = loadPanelArt(coinSrc, () => this.draw())
  private buttons: Button[] = []
  private labels: Label[] = []
  private roster: RosterCard[] = []
  private display: 'entry' | 'edit' | 'ready' = 'entry'
  private hover = -1
  private signature = ''
  private target: { anchorId: string; tableId: string } | null = null
  private admittedTable = ''
  private wasSeated = false
  private epoch = 0
  private working = false
  private editing = false
  private bet = ''
  private confirmed = false
  private terms = ''
  private error = ''
  private balance: ReadyBalance = { status: 'loading', available: null }
  private balanceKey = ''
  private balanceRequest?: AbortController

  constructor(parent: Object3D) {
    this.panel.mesh.name = 'park-xr-omok-lobby'
    this.panel.mesh.position.set(0, -.12, -1.55)
    parent.add(this.panel.mesh)
    this.paper.onload = () => this.draw()
    this.paper.src = '/art/tablet/hanji.webp'
    loadPanelFont(() => { if (this.visible) this.draw() })
  }

  get seated() {
    const s = useSession.getState()
    return !!this.admittedTable && s.tableId === this.admittedTable
  }

  get ownsSession() {
    const s = useSession.getState()
    return this.seated || (!s.tableId && !!this.admittedTable && (this.working || this.wasSeated))
  }

  get blocking() { return this.ownsSession }
  get visible() { return this.panel.mesh.visible }
  get playing() {
    if (!this.seated) return false
    const g = useGame.getState()
    return ownOmokGame()?.omok?.status === 'PLAYING' && g.recovery === 'RESTORED' && !g.lastResult
  }

  hide() { this.panel.mesh.visible = false; this.setHover(-1) }
  reset() {
    this.hide()
    this.epoch++
    this.admittedTable = ''; this.target = null; this.wasSeated = this.working = false
    this.editing = false; this.bet = ''; this.confirmed = false; this.terms = ''; this.error = ''
    this.balanceKey = ''; this.balanceRequest?.abort()
  }
  dispose() { this.reset(); this.paper.onload = this.gameArt.onload = this.coinArt.onload = null; this.panel.dispose() }

  private async run(job: () => Promise<boolean>) {
    if (this.working || useSession.getState().pending) return
    this.working = true; this.error = ''
    const epoch = this.epoch
    try {
      if (!await job() && this.epoch === epoch) this.error = useSession.getState().error || '요청을 완료하지 못했어요. 다시 시도해 주세요.'
    } catch (cause) {
      if (this.epoch === epoch) this.error = cause instanceof Error ? cause.message : '서버 응답을 확인해 주세요.'
    } finally {
      if (this.epoch === epoch) {
        this.working = false
        if (!this.seated && !this.wasSeated) this.admittedTable = ''
      }
    }
  }

  private join() {
    const target = this.target, s = useSession.getState(), avatar = avatars.get(s.sessionId)
    if (!target || this.working || s.pending || s.tableId || !avatar?.connected || avatar.carry || avatar.vehicle || avatar.swimming
      || !canReachTable(avatar.current, target.anchorId) || tableEntry(target.anchorId) !== 'sit') return
    this.admittedTable = target.tableId
    void this.run(() => parkRuntime.joinTable(target.anchorId))
  }

  private async refreshBalance() {
    this.balanceRequest?.abort()
    const request = new AbortController()
    this.balanceRequest = request
    this.balance = { status: 'loading', available: null }
    try {
      const value = await parkRuntime.requestJSON('/api/v1/wallets/me', {
        cache: 'no-store', signal: AbortSignal.any([request.signal, AbortSignal.timeout(5000)]),
      })
      if (!request.signal.aborted) this.balance = { status: 'ready', available: availableForBet(value) }
    } catch {
      if (!request.signal.aborted) this.balance = { status: 'error', available: null }
    }
  }

  update(position: Pick<Pose, 'x' | 'y' | 'z'>, allowEntry: boolean, focusPark: () => void) {
    const s = useSession.getState(), g = useGame.getState()
    if (this.wasSeated && !this.seated) {
      this.reset()
      focusPark()
    }
    this.wasSeated = this.seated
    if (this.playing) { this.hide(); return }
    this.labels = []; this.buttons = []; this.roster = []; this.display = 'entry'
    const text = (text: string, y: number, size?: number, x = width / 2, max = 1360) => this.labels.push({ text, y, size, x, max })
    const button = (label: string, x: number, y: number, width: number, run: () => void, height = 90, secondary = false) =>
      this.buttons.push({ label, x, y, width, height, run, secondary })
    const full = (label: string, y: number, run: () => void) => button(label, 88, y, 1360, run)
    if (!this.seated) {
      this.target = allowEntry ? this.nearbyTable(position) : null
      if (!this.target && !this.ownsSession) { this.hide(); return }
      const number = /^table-(\d+)$/.exec(this.target?.anchorId ?? '')?.[1]
      text(number ? `오목 · ${number}번 테이블` : '오목 테이블', 320, 74)
      text(this.working ? '자리를 확인하고 있어요…' : 'PC 친구와 같은 테이블에 앉아요', 445)
      if (!this.working) full('테이블에 앉기', 535, () => this.join())
      if (this.error) text(this.error, 730, 42)
      this.present()
      return
    }
    const table = s.tableStates[s.tableId], mine = table?.seats.find(seat => seat.userId === s.sessionId)
    const busy = this.working || s.pending || g.pending || g.uncertain
    text('온탑', 82, 48)
    text('오목', 143, 70)
    const gathering = getGathering()
    if (gathering?.finished) {
      text(gathering.headline, 320, 62)
      text(gathering.reason, 425)
      text(gathering.settlement, 535)
      if (gathering.canReturn && !busy) full('대기실로 돌아가기', 710, returnToWaiting)
    } else if (tableBusy(g)) {
      text('경기 상태를 확인하고 있어요…', 430)
      if (!this.working && !s.pending && !g.pending && g.uncertain) full('경기 상태 다시 확인', 710, () =>
        void this.run(g.recovery === 'PENDING' ? parkRuntime.checkRecovery : parkRuntime.checkStart))
    } else if (table && mine) {
      const port = usePreparationPort.getState().port
      const host = table.selectorUserId === s.sessionId
      const count = port?.selectedPlayers(table) ?? null
      const configured = table.gameCode === 'OMOK' && table.betAmountPerPlayer != null && count === 2
      const terms = JSON.stringify([s.tableId, table.selectorUserId, table.gameCode, table.betAmountPerPlayer, count])
      if (terms !== this.terms) {
        this.terms = terms; this.confirmed = false; this.editing = false
        this.bet = configured ? String(table.betAmountPerPlayer) : ''
      }
      const balanceKey = JSON.stringify([s.tableId, s.account?.balance, g.completedGameId])
      if (this.balanceKey !== balanceKey) {
        this.balanceKey = balanceKey
        void this.refreshBalance()
      }
      const start = useTabletStartStatus.getState()
      const uncertain = start.uncertain && start.tableId === table.tableId
      const canAct = !busy && !uncertain
      const savedBet = table.betAmountPerPlayer
      const amount = this.bet === '' ? null : Number(this.bet)
      const occupied = table.seats.filter(seat => seat.userId)
      const hasOtherGame = !!table.gameCode && table.gameCode !== 'OMOK'
      const balanceText = this.balance.status === 'ready' ? '사용 가능 ' + money(this.balance.available)
        : this.balance.status === 'error' ? '잔액을 확인하지 못했어요' : '사용 가능 잔액 확인 중…'
      text(balanceText, 207, 37)
      if (this.balance.status === 'error' && canAct) button('잔액 다시 확인', 1040, 153, 408, () => void this.refreshBalance(), 74, true)
      if (uncertain) {
        text('게임 시작 상태를 확인해 주세요', 415)
        if (!busy && port?.recoverStart) full('시작 상태 확인', 710, () => void this.run(() => port.recoverStart!(preparationContext(table))))
      } else if (hasOtherGame) {
        text('다른 게임이 선택된 테이블이에요', 415)
      } else if (!port) {
        text('오목 준비 화면을 연결하고 있어요', 415)
      } else if (host && (!configured || this.editing)) {
        this.display = 'edit'
        text('다섯 돌을 이어 만드는 한 수', 589, 36, 395, 560)
        text('참가 인원 · 2인', 658, 41, 395, 560)
        text('1인 참가 판돈  ' + money(amount), 309, 51, 1140, 545)
        for (let key = 1; key <= 12; key++) {
          const label = key <= 9 ? String(key) : key === 10 ? '지우기' : key === 11 ? '0' : '모두 지우기'
          if (canAct) button(label, 780 + ((key - 1) % 3) * 224, 348 + Math.floor((key - 1) / 3) * 90, 212, () => {
            if (key === 10) this.bet = this.bet.slice(0, -1)
            else if (key === 12) this.bet = ''
            else if (this.bet.length < 15) this.bet = (this.bet === '0' ? '' : this.bet) + label
          }, 82, true)
        }
        if (canAct && occupied.length <= 2 && amount != null && canAffordBet(this.balance, amount))
          button('선택하고 준비하기', 770, 720, 678, () => void this.run(async () => {
            const epoch = this.epoch
            const ok = await port.configure(preparationContext(table), { gameCode: 'OMOK', playerCount: 2, betAmountPerPlayer: amount })
            if (ok && this.epoch === epoch) { this.editing = false; this.confirmed = false }
            return ok
          }))
        else if (amount != null && this.balance.available != null && amount > this.balance.available) text('사용 가능 잔액이 부족해요', 775, 40)
        if (canAct && configured) button('수정 취소', 424, 720, 320, () => {
          this.editing = false; this.bet = String(savedBet)
        })
      } else if (!configured) {
        text('방장이 1인 참가 판돈을 정하고 있어요', 415)
      } else {
        this.display = 'ready'
        text('1인 참가 판돈', 439, 36, 768, 465)
        text(money(savedBet), 501, 63, 768, 340)
        this.roster = table.seats.slice(0, 2).map(seat => {
          const name = seat.userId === s.sessionId ? '나' : seat.userId ? s.profiles[seat.userId]?.nickname ?? '상대' : '빈자리'
          return { name: name + (seat.userId && seat.userId === table.selectorUserId ? ' · 방장' : ''), ready: seat.ready, occupied: !!seat.userId }
        })
        if (canAct && !mine.ready && canAffordBet(this.balance, savedBet)) {
          if (!this.confirmed) button('□ 참가 금액을 확인했어요', 88, 548, 1360, () => { this.confirmed = true }, 90, true)
          else full('준비 완료', 548, () => {
            const current = useSession.getState().tableStates[table.tableId]
            if (current?.gameCode === 'OMOK' && current.betAmountPerPlayer === savedBet && current.selectorUserId === table.selectorUserId
              && port.selectedPlayers(current) === count) void this.run(() => parkRuntime.setReady(true))
          })
        }
        if (!mine.ready && savedBet != null && this.balance.available != null && savedBet > this.balance.available)
          text('사용 가능 잔액이 부족해요', 611, 40)
        if (canAct && mine.ready) button('준비 취소', 88, 548, 650, () => void this.run(() => parkRuntime.setReady(false)))
        if (canAct && host && !mine.ready) button('판돈 변경', 770, 720, 678, () => {
          this.editing = true; this.confirmed = false
        })
        if (canAct && manualStartAllowed(table, s.sessionId, count))
          button('게임 시작', 770, 548, 678, () => void this.run(() => port.start(preparationContext(table))))
        else if (!host && table.allReady) text('방장이 게임을 시작해요', 682, 40)
      }
      if (canAct) button('일어나기', 88, 720, 310, () => void this.run(parkRuntime.leaveTable), 90, true)
      text(this.working ? '서버 응답을 기다리고 있어요…' : this.error || startFailureNotice(g.start), 882, 38)
    }
    this.present()
  }

  private nearbyTable(position: Pick<Pose, 'x' | 'y' | 'z'>) {
    const s = useSession.getState()
    if (!usePreparationPort.getState().port || s.pending || s.tableId) return null
    let nearest = null, best = Infinity
    for (const anchor of TABLES) {
      if (anchor.id === STONE_RUMBLE_ANCHOR_ID || !canReachTable(position, anchor.id)) continue
      const binding = s.bindings.find(b => b.channelId === s.roomId && b.anchorId === anchor.id)
      if (!binding || !s.tables.some(t => t.tableId === binding.tableId) || tableEntry(anchor.id) !== 'sit') continue
      const code = s.tableStates[binding.tableId]?.gameCode ?? s.tables.find(t => t.tableId === binding.tableId)?.gameCode
      if (code && code !== 'OMOK') continue
      const distance = Math.hypot(position.x - anchor.position[0], position.z - anchor.position[2])
      if (distance < best) { best = distance; nearest = binding }
    }
    return nearest
  }

  hit(origin: Vector3, direction: Vector3) {
    const point = this.panel.point(origin, direction)
    if (!point) return -1
    return this.buttons.findIndex(b => point.x >= b.x && point.x <= b.x + b.width && point.y >= b.y && point.y <= b.y + b.height)
  }
  select(index: number) {
    if (parkXRView.active && this.visible) this.buttons[index]?.run()
  }
  setHover(index: number) {
    if (index === this.hover) return
    this.hover = index; this.draw()
  }
  private present() {
    this.panel.mesh.visible = true
    this.panel.mesh.scale.setScalar(this.seated ? 1 : .65)
    this.panel.mesh.position.y = this.seated ? -.12 : -.37
    const signature = JSON.stringify([this.target?.tableId, this.display, this.roster, this.labels, this.buttons.map(b => b.label)])
    if (signature === this.signature) return
    this.signature = signature
    this.hover = -1; this.draw()
  }
  private draw() {
    const ctx = this.panel.canvas.getContext('2d')!
    drawWebPanel(ctx, this.paper)
    if (this.display === 'edit') {
      panelBox(ctx, 88, 244, 610, 454, '#fff6db', '#d2ab5c')
      panelPhoto(ctx, this.gameArt, 109, 267, 568, 267, .5, true)
      panelBox(ctx, 780, 244, 668, 93, '#fff8e8', '#b7a17b', 11)
    } else if (this.display === 'ready') {
      panelBox(ctx, 493, 244, 550, 279, '#fff3cb', '#cfaa58')
      panelPhoto(ctx, this.gameArt, 519, 261, 498, 132, .5, true)
      this.roster.forEach(({ name, ready, occupied }, i) => {
        const x = i === 0 ? 88 : 1062
        panelBox(ctx, x, 244, 386, 279, '#fff8e8', '#c4af80')
        panelBox(ctx, x + 18, 278, 350, 81, '#263e2f', '#263e2f', 12)
        ctx.textAlign = 'center'; ctx.fillStyle = '#fff8e7'; ctx.font = '700 39px "Malgun Gothic", sans-serif'
        ctx.fillText(name, x + 193, 333, 328)
        panelBox(ctx, x + 40, 400, 306, 69, ready ? '#dbe7bc' : '#ede8d4', '#b9c49b', 28)
        ctx.fillStyle = '#205536'; ctx.font = '700 36px "Malgun Gothic", sans-serif'
        ctx.fillText(ready ? '✓ 준비 완료' : occupied ? '준비 대기' : '참가 대기', x + 193, 447, 275)
      })
    }
    if (this.display !== 'entry' && this.coinArt.complete && this.coinArt.naturalWidth)
      ctx.drawImage(this.coinArt, this.display === 'edit' ? 803 : 557, this.display === 'edit' ? 267 : 451, 50, 50)
    for (const { text, y, size = 49, x, max } of this.labels) {
      ctx.textAlign = 'center'; ctx.fillStyle = '#123b2a'
      ctx.font = `700 ${size}px ${size >= 48 ? 'BusanDandiMyeongjo, serif' : '"Malgun Gothic", sans-serif'}`
      ctx.fillText(text, x, y, max)
    }
    this.buttons.forEach((b, index) => panelButton(ctx, b.x, b.y, b.width, b.height, b.label, this.hover === index, b.secondary ? 'secondary' : 'primary'))
    this.panel.texture.needsUpdate = true
  }
}
