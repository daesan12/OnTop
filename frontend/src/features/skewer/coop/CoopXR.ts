import type { Object3D, Quaternion, Vector3, WebGLRenderer } from 'three'
import { XRCanvas } from '../../parkXR/XRCanvas'
import { composeHangul } from '../../parkXR/hangul'
import { paintGuideButton, paintGuidePaper, TOUCH_GUIDE_COLORS } from '../../vrGuide/touchControllerGuide'
import { parkXRView } from '../../../world/xrView'
import { CoopClient } from './client'
import type { CoopRoom, CoopTransport } from './contracts'
import type { ChefScene } from '../chef/ChefScene'
import type { ChefAction } from '../chef/model'
import { cooperativeSkewerGameplayActive, setCooperativeSkewerActivity } from '../activity'
import cover from '../../vrZone/art/skewer-cover-lowpoly.png'

const width = 1536, height = 1024, pageSize = 4
const defaultName = '함께 여는 꼬치집'
const roomName = (keys: string[]) => composeHangul(keys).trim() || defaultName
const korean = ['ㅂㅈㄷㄱㅅㅛㅕㅑㅐㅔ', 'ㅁㄴㅇㄹㅎㅗㅓㅏㅣ', 'ㅋㅌㅊㅍㅠㅜㅡ']
const shifted = ['ㅃㅉㄸㄲㅆㅛㅕㅑㅒㅖ', korean[1]!, korean[2]!]
const latin = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm']
type Button = { label: string; x: number; y: number; w: number; h: number; action(): void }
type Text = { label: string; y: number; size: number }
type Viewer = { position: Vector3; rotation: Quaternion }

export class CoopXR {
  private readonly panel = new XRCanvas(width, height, 1.42)
  private readonly paper = new Image()
  private readonly cover = new Image()
  private client: CoopClient | null = null
  private kitchen: ChefScene | null = null
  private busy = false
  private screen: 'home' | 'rooms' | 'create' | 'password' = 'home'
  private page = 0
  private selected: CoopRoom | null = null
  private keys: string[] = []
  private language: 'ko' | 'en' = 'ko'
  private shift = false
  private password = ''
  private locked = false
  private editingPassword = false
  private buttons: Button[] = []
  private text: Text[] = []
  private showCover = false
  private signature = ''
  private hovered = -1
  private activity = false
  private paused = false

  constructor(parent: Object3D, private renderer: WebGLRenderer) {
    this.panel.mesh.name = 'park-xr-skewer-lobby'
    this.panel.mesh.position.set(0, -.08, -1.55)
    parent.add(this.panel.mesh)
    this.paper.onload = this.cover.onload = () => this.paint()
    this.paper.src = '/art/tablet/hanji.webp'
    this.cover.src = cover
  }

  get active() { return this.client !== null }
  get cooking() { return this.kitchen !== null }
  get visible() { return this.panel.mesh.visible }

  open(transport: CoopTransport) {
    if (this.client) return
    this.screen = 'home'; this.page = 0
    this.client = new CoopClient(transport)
    this.client.start()
  }

  hide() { this.panel.mesh.visible = false; this.hovered = -1 }

  private detachKitchen() {
    if (this.kitchen) {
      parkXRView.renderKitchen = null
      this.kitchen.dispose()
      this.kitchen = null
    }
    this.paused = false
  }

  reset(leave = false) {
    this.hide()
    this.detachKitchen()
    const client = this.client
    this.client = null
    this.busy = false
    this.resetForm()
    this.setActivity(false)
    if (leave && client?.snapshot && client.transport.scope().connected) void client.leave().catch(() => undefined).finally(() => client.stop())
    else client?.stop()
  }

  dispose() { this.reset(true); this.paper.onload = this.cover.onload = null; this.panel.dispose() }

  private resetForm() {
    this.selected = null; this.keys = []; this.password = ''; this.locked = this.editingPassword = false
    this.language = 'ko'; this.shift = false
  }

  private setActivity(active: boolean) {
    if (active === this.activity) return
    this.activity = active
    setCooperativeSkewerActivity(active)
  }

  private async command(job: (client: CoopClient) => Promise<unknown>) {
    const client = this.client
    if (this.busy || !client || !client.transport.scope().connected) return
    this.busy = true
    try { await job(client) }
    catch { if (this.client === client) client.store.setState({ error: '요청을 완료하지 못했어요. 다시 시도해 주세요.' }) }
    finally { if (this.client === client) this.busy = false }
  }

  back() {
    const client = this.client
    if (!client || this.busy || client.store.getState().pending) return
    const snapshot = client.snapshot
    if (this.kitchen && snapshot?.publicState.phase === 'WAITING') {
      void this.command(async client => {
        if (snapshot.publicState.players.some(player => player.userId === client.transport.scope().userId && player.ready))
          await client.act({ type: 'READY', ready: false })
        if (client.snapshot?.publicState.phase !== 'WAITING') return
        await client.act({ type: 'CHEF_MODE', vr: false })
        if (this.client === client && client.snapshot?.publicState.phase === 'WAITING' && !client.snapshot.publicState.chefVR)
          this.detachKitchen()
      })
    } else if (this.kitchen) return
    else if (snapshot) this.leave()
    else if (this.screen === 'home') this.reset()
    else {
      this.screen = this.screen === 'password' ? 'rooms' : 'home'; this.resetForm()
      client.store.setState({ error: '' })
    }
  }

  private leave() {
    void this.command(async client => {
      await client.leave()
      if (this.client !== client) return
      if (!client.snapshot) { this.detachKitchen(); this.screen = 'rooms' }
      else this.reset()
    })
  }

  private async kitchenAction(client: CoopClient, driver: import('./drivers').OnlineChef, action: ChefAction) {
    if (this.client !== client || !this.kitchen) return
    const state = client.snapshot?.publicState
    if (!state) return
    if (action.type === 'exit' || action.type === 'leave') { this.leave(); return }
    if (action.type === 'pause' || action.type === 'pauseRetry' || action.type === 'resume') {
      const pause = action.type !== 'resume'
      this.paused = true; client.inputBlocked = true
      await this.command(async client => {
        await client.act({ type: 'PAUSE', paused: pause })
        if (!pause && !client.snapshot?.publicState.pausedBy?.includes(client.transport.scope().userId)) {
          this.paused = false; client.inputBlocked = false
        }
      })
      return
    }
    if (action.type === 'ready') {
      const self = state.players.find(p => p.userId === client.transport.scope().userId)
      if (state.phase === 'WAITING' && state.chefVR && state.players.length === 2 && state.players.every(p => p.role && p.connected))
        await this.command(client => client.act({ type: 'READY', ready: !self?.ready }))
      return
    }
    driver.action(action)
  }

  private enterKitchen(session: XRSession, viewer: Viewer) {
    void this.command(async client => {
      const id = client.snapshot?.gameId
      const [{ ChefScene }, { OnlineChef }] = await Promise.all([import('../chef/ChefScene'), import('./drivers')])
      if (this.client !== client || client.snapshot?.gameId !== id || client.snapshot?.privateState.role !== 'chef'
        || this.renderer.xr.getSession() !== session || session.visibilityState !== 'visible') return
      const driver = new OnlineChef(client)
      const scene = new ChefScene(document.createElement('div'), driver.view(), 'vr', () => driver.view(),
        action => void this.kitchenAction(client, driver, action), () => {}, () => {}, undefined, this.renderer)
      this.kitchen = scene
      scene.attachXR(session, viewer)
      this.hide()
      parkXRView.renderKitchen = (frame) => {
        if (this.client !== client || client.snapshot?.gameId !== id || client.snapshot?.privateState.role !== 'chef') {
          this.detachKitchen()
          return false
        }
        const pub = client.snapshot.publicState
        this.setActivity(cooperativeSkewerGameplayActive(pub.phase))
        if (pub.phase === 'FINISHED') { this.paused = false; client.inputBlocked = false }
        const confirmed = !!pub.pausedBy?.includes(client.transport.scope().userId)
        scene.setPauseState({ open: this.paused || confirmed, busy: this.busy, confirmed, error: client.store.getState().error })
        scene.render(undefined, frame)
        return true
      }
      if (client.snapshot.publicState.phase !== 'FINISHED') await client.act({ type: 'CHEF_MODE', vr: true })
      if (this.client === client && client.snapshot?.publicState.phase === 'WAITING' && !client.snapshot.publicState.chefVR)
        this.detachKitchen()
    })
  }

  update(session: XRSession, position: Vector3, rotation: Quaternion) {
    const client = this.client
    if (!client || this.kitchen) { this.hide(); return }
    const state = client.store.getState(), snapshot = state.snapshot, pub = snapshot?.publicState
    const connected = state.connected && client.transport.scope().connected
    const busy = this.busy || state.pending
    const enabled = connected && !busy
    this.buttons = []; this.text = []; this.showCover = false
    const text = (label: string, y: number, size = 45) => this.text.push({ label, y, size })
    const button = (label: string, x: number, y: number, w: number, action: () => void, h = 86) => this.buttons.push({ label, x, y, w, h, action })
    const main = (label: string, y: number, action: () => void) => button(label, 200, y, 1136, action)
    const go = (screen: typeof this.screen) => {
      this.screen = screen; this.resetForm(); client.store.setState({ error: '' })
      if (screen === 'rooms') { this.page = 0; void client.refresh() }
    }
    if (pub) {
      text(pub.roomName ?? defaultName, 108, 70)
      const self = pub.players.find(player => player.userId === client.transport.scope().userId)
      const friend = pub.players.find(player => player !== self)
      text(`참가 ${pub.players.length} / 2명 · 무료 협동`, 245)
      if (!friend) text('PC 친구가 같은 공원에서 이 방에 참가하면 돼요', 405)
      else text(friend.role === 'chef' ? '친구가 요리사를 선택했어요' : friend.ready ? '친구가 준비했어요' : '친구가 역할을 준비하고 있어요', 405)
      if (enabled && friend && friend.role !== 'chef' && snapshot?.privateState.role !== 'chef' && pub.phase === 'WAITING')
        main('VR 요리사 선택', 510, () => void this.command(client => client.act({ type: 'ROLE', role: 'chef' })))
      if (enabled && snapshot?.privateState.role === 'chef') main('VR 주방으로 들어가기', 510, () => this.enterKitchen(session, { position, rotation }))
      if (enabled && pub.phase === 'WAITING') main('방 나가기', 710, () => this.leave())
    } else if (this.screen === 'home') {
      this.showCover = true
      text('온탑 꼬치왕', 110, 75)
      text('VR 요리사와 PC 서빙 담당이 함께 운영하는 가게', 647)
      if (enabled) {
        button('방 만들기', 92, 710, 665, () => go('create'))
        button('친구 방 참가하기', 779, 710, 665, () => go('rooms'))
      }
    } else if (this.screen === 'rooms') {
      text('친구의 가게 찾기', 110, 65)
      const pages = Math.max(1, Math.ceil(state.rooms.length / pageSize))
      this.page = Math.min(this.page, pages - 1)
      text(state.rooms.length ? `${this.page + 1} / ${pages} 페이지` : '아직 문을 연 가게가 없어요', 220)
      state.rooms.slice(this.page * pageSize, (this.page + 1) * pageSize).forEach((room, i) => {
        const label = `${room.roomName} · ${room.hostNickname} · ${room.players}/2${room.locked ? ' · 비밀번호' : ''}`
        if (!enabled || room.players === 2 && !room.mine) text(label, 330 + i * 105, 40)
        else main(label, 270 + i * 105, () => {
          if (room.locked && !room.mine) {
            this.selected = room; this.screen = 'password'; this.editingPassword = true
          } else void this.command(client => client.enter(room.gameId))
        })
      })
      if (enabled && this.page > 0) button('이전', 92, 730, 310, () => { this.page-- })
      if (enabled && this.page + 1 < pages) button('다음', 1134, 730, 310, () => { this.page++ })
      if (enabled) button('방 만들기', 504, 730, 528, () => go('create'))
    } else {
      const creating = this.screen === 'create'
      text(creating ? '우리 가게를 열어요' : this.selected?.roomName ?? '친구 방 참가', 110, 65)
      text(this.editingPassword ? `비밀번호  ${'●'.repeat(this.password.length)}` : `가게 이름  ${roomName(this.keys)}`, 200, 49)
      if (enabled) {
        const english = this.editingPassword || this.language === 'en'
        const rows = english ? (this.shift ? latin.map(row => row.toUpperCase()) : latin) : this.shift ? shifted : korean
        rows.forEach((row, i) => [...row].forEach((key, j) =>
          button(key, (width - row.length * 126) / 2 + j * 126, 246 + i * 89, 116, () => {
            if (this.editingPassword) { if (this.password.length < 20) this.password += key }
            else if (this.keys.length < 72 && roomName([...this.keys, key]).length <= 24) this.keys.push(key)
          }, 76)))
        button('지우기', 1080, 604, 350, () => { if (this.editingPassword) this.password = this.password.slice(0, -1); else this.keys.pop() })
        if (!this.editingPassword) {
          button(this.language === 'ko' ? '영문' : '한글', 92, 604, 310, () => {
            this.language = this.language === 'ko' ? 'en' : 'ko'; this.shift = false
          })
          button('띄우기', 750, 604, 310, () => { if (this.keys.length < 72) this.keys.push(' ') })
        }
        button(english ? this.shift ? '소문자' : '대문자' : this.shift ? '기본' : '쌍자음', 420, 604, 310, () => { this.shift = !this.shift })
        if (creating) button(this.editingPassword ? '이름 편집' : this.locked ? '비밀번호 편집' : '비밀번호 설정', 92, 720, 420, () => {
          this.locked = true; this.editingPassword = !this.editingPassword; this.shift = false
        })
        if (creating && this.locked) button('공개 방으로', 530, 720, 382, () => { this.locked = this.editingPassword = false; this.password = '' })
        if ((!this.locked && creating) || /^[A-Za-z0-9]{4,20}$/.test(this.password))
          button(creating ? '방 만들기' : '참가하기', 932, 720, 512, () => void this.command(async client => {
            if (await client.enter(this.selected?.gameId, { roomName: roomName(this.keys), password: this.password })) this.resetForm()
          }))
      }
    }
    if (!pub && this.screen !== 'home' && !busy) button('돌아가기', 92, 851, 342, () => this.back())
    if (!pub && this.screen === 'home' && !busy) button('공원으로 돌아가기', 92, 851, 480, () => this.back())
    text(busy ? '서버 응답을 기다리고 있어요…' : !connected ? '공원 연결을 확인하고 있어요…' : state.error, 982, 36)
    this.panel.mesh.visible = true
    const next = JSON.stringify([this.showCover, this.text, this.buttons.map(({ label, x, y }) => [label, x, y])])
    if (next !== this.signature) { this.signature = next; this.hovered = -1; this.paint() }
  }

  hit(origin: Vector3, direction: Vector3) {
    const point = this.panel.point(origin, direction)
    return point ? this.buttons.findIndex(b => point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h) : -1
  }
  select(index: number) { if (this.visible && !this.busy) this.buttons[index]?.action() }
  hover(index: number) { if (index !== this.hovered) { this.hovered = index; this.paint() } }

  private paint() {
    const ctx = this.panel.canvas.getContext('2d')!
    paintGuidePaper(ctx, height, this.paper)
    if (this.showCover && this.cover.complete && this.cover.naturalWidth) ctx.drawImage(this.cover, 550, 162, 436, 436)
    for (const { label, y, size } of this.text) {
      ctx.fillStyle = TOUCH_GUIDE_COLORS.ink; ctx.textAlign = 'center'; ctx.font = `700 ${size}px "Malgun Gothic", sans-serif`
      ctx.fillText(label, width / 2, y, 1370)
    }
    this.buttons.forEach((b, index) => paintGuideButton(ctx, b.x, b.y, b.w, b.h, b.label, index === this.hovered))
    this.panel.texture.needsUpdate = true
  }
}
