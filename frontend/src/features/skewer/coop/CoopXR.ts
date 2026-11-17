import type { Object3D, Quaternion, Vector3, WebGLRenderer } from 'three'
import { XRCanvas } from '../../parkXR/XRCanvas'
import { composeHangul } from '../../parkXR/hangul'
import { drawWebPanel, loadPanelArt, loadPanelFont, panelBox, panelButton, panelPhoto } from '../../parkXR/webPanelArt'
import { parkXRView } from '../../../world/xrView'
import { CoopClient } from './client'
import type { CoopRoom, CoopTransport } from './contracts'
import type { ChefScene } from '../chef/ChefScene'
import type { ChefAction } from '../chef/model'
import { cooperativeSkewerGameplayActive, setCooperativeSkewerActivity } from '../activity'
import cover from '../../vrZone/art/skewer-cover-lowpoly.png'
import chefRole from './art/chef-role-illustration.png'
import serverRole from './art/server-role-illustration.png'
import { roomArtwork } from './roomArtwork'

const width = 1536, height = 1024, pageSize = 4
const defaultName = '함께 여는 꼬치집'
const roomName = (keys: string[]) => composeHangul(keys).trim() || defaultName
const korean = ['ㅂㅈㄷㄱㅅㅛㅕㅑㅐㅔ', 'ㅁㄴㅇㄹㅎㅗㅓㅏㅣ', 'ㅋㅌㅊㅍㅠㅜㅡ']
const shifted = ['ㅃㅉㄸㄲㅆㅛㅕㅑㅒㅖ', korean[1]!, korean[2]!]
const latin = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm']
type Button = { label: string; x: number; y: number; w: number; h: number; action(): void; variant: 'primary' | 'secondary' | 'room' }
type Text = { label: string; y: number; size: number; x: number; w: number }
type Photo = { src: string; x: number; y: number; w: number; h: number; crop?: number }
type Viewer = { position: Vector3; rotation: Quaternion }

export class CoopXR {
  private readonly panel = new XRCanvas(width, height, 1.42)
  private readonly paper = new Image()
  private readonly artwork = new Map<string, HTMLImageElement>()
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
  private photos: Photo[] = []
  private cards: { x: number; y: number; w: number; h: number }[] = []
  private signature = ''
  private hovered = -1
  private activity = false
  private paused = false

  constructor(parent: Object3D, private renderer: WebGLRenderer) {
    this.panel.mesh.name = 'park-xr-skewer-lobby'
    this.panel.mesh.position.set(0, -.08, -1.55)
    parent.add(this.panel.mesh)
    this.paper.onload = () => this.paint()
    this.paper.src = '/art/tablet/hanji.webp'
    loadPanelFont(() => { if (this.active) this.paint() })
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

  dispose() {
    this.reset(true); this.paper.onload = null
    this.artwork.forEach(image => { image.onload = null })
    this.artwork.clear(); this.panel.dispose()
  }

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
    this.buttons = []; this.text = []; this.photos = []; this.cards = []
    const text = (label: string, y: number, size = 45, x = width / 2, w = 1370) => this.text.push({ label, y, size, x, w })
    const button = (label: string, x: number, y: number, w: number, action: () => void, h = 86, variant: Button['variant'] = 'primary') =>
      this.buttons.push({ label, x, y, w, h, action, variant })
    const go = (screen: typeof this.screen) => {
      this.screen = screen; this.resetForm(); client.store.setState({ error: '' })
      if (screen === 'rooms') { this.page = 0; void client.refresh() }
    }
    if (pub) {
      text(pub.roomName ?? defaultName, 108, 70)
      const self = pub.players.find(player => player.userId === client.transport.scope().userId)
      const friend = pub.players.find(player => player !== self)
      text(`참가 ${pub.players.length} / 2명 · 무료 협동`, 180)
      if (!friend) {
        this.photos.push({ src: cover, x: 412, y: 238, w: 712, h: 379 })
        text('PC 친구가 같은 공원에서 이 방에 참가하면 돼요', 679)
      } else {
        this.photos.push({ src: chefRole, x: 102, y: 235, w: 625, h: 360 }, { src: serverRole, x: 809, y: 235, w: 625, h: 360 })
        text('요리사 · VR', 652, 49, 414, 625)
        text(friend.ready ? '서빙 담당 · 준비 완료' : '서빙 담당 · PC', 652, 49, 1121, 625)
      }
      if (enabled && friend && friend.role !== 'chef' && snapshot?.privateState.role !== 'chef' && pub.phase === 'WAITING')
        button('VR 요리사 선택', 102, 690, 625, () => void this.command(client => client.act({ type: 'ROLE', role: 'chef' })))
      if (enabled && snapshot?.privateState.role === 'chef')
        button('VR 주방으로 들어가기', 102, 690, 625, () => this.enterKitchen(session, { position, rotation }))
      if (enabled && pub.phase === 'WAITING') button('방 나가기', 92, 851, 342, () => this.leave(), 86, 'secondary')
    } else if (this.screen === 'home') {
      text('온탑 꼬치왕', 110, 75)
      text('한 명은 요리사, 한 명은 서빙 담당', 183, 42)
      this.photos.push({ src: cover, x: 90, y: 246, w: 697, h: 485 })
      text('2인 협동 · 무료 플레이', 342, 42, 1122, 620)
      text('함께 운영할 가게를 골라보세요', 430, 49, 1122, 620)
      if (enabled) {
        button('방 만들기 ＋', 823, 500, 610, () => go('create'))
        button('친구 방 참가하기 →', 823, 614, 610, () => go('rooms'), 86, 'secondary')
      }
    } else if (this.screen === 'rooms') {
      text('친구의 가게 찾기', 110, 65)
      const pages = Math.max(1, Math.ceil(state.rooms.length / pageSize))
      this.page = Math.min(this.page, pages - 1)
      text(state.rooms.length ? `${this.page + 1} / ${pages} 페이지` : '아직 문을 연 가게가 없어요', 176)
      state.rooms.slice(this.page * pageSize, (this.page + 1) * pageSize).forEach((room, i) => {
        const x = 82 + i % 2 * 705, y = 206 + Math.floor(i / 2) * 278
        const art = roomArtwork(room.gameId)
        this.cards.push({ x, y, w: 668, h: 259 })
        this.photos.push({ src: art.src, x: x + 12, y: y + 10, w: 644, h: 122, crop: Number(art.position.split(' ')[1]!.replace('%', '')) / 100 })
        text(room.roomName, y + 179, 42, x + 334, 620)
        text(`방장 ${room.hostNickname} · ${room.players}/2${room.locked ? ' · 비밀 가게' : ''}`, y + 227, 30, x + 222, 415)
        if (enabled && (room.players < 2 || room.mine)) button(room.mine ? '돌아가기' : '참가하기', x + 434, y + 195, 210, () => {
          if (room.locked && !room.mine) {
            this.selected = room; this.screen = 'password'; this.editingPassword = true
          } else void this.command(client => client.enter(room.gameId))
        }, 52, 'room')
      })
      if (enabled && this.page > 0) button('이전', 470, 851, 205, () => { this.page-- }, 86, 'secondary')
      if (enabled && this.page + 1 < pages) button('다음', 694, 851, 205, () => { this.page++ }, 86, 'secondary')
      if (enabled) button('방 만들기', 1010, 851, 434, () => go('create'))
    } else {
      const creating = this.screen === 'create'
      text(creating ? '우리 가게를 열어요' : this.selected?.roomName ?? '친구 방 참가', 110, 65)
      this.cards.push({ x: 170, y: 136, w: 1196, h: 88 })
      text(this.editingPassword ? `비밀번호  ${'●'.repeat(this.password.length)}` : `가게 이름  ${roomName(this.keys)}`, 200, 49)
      if (enabled) {
        const english = this.editingPassword || this.language === 'en'
        const rows = english ? (this.shift ? latin.map(row => row.toUpperCase()) : latin) : this.shift ? shifted : korean
        rows.forEach((row, i) => [...row].forEach((key, j) =>
          button(key, (width - row.length * 126) / 2 + j * 126, 246 + i * 89, 116, () => {
            if (this.editingPassword) { if (this.password.length < 20) this.password += key }
            else if (this.keys.length < 72 && roomName([...this.keys, key]).length <= 24) this.keys.push(key)
          }, 76, 'secondary')))
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
    if (!pub && this.screen !== 'home' && !busy) button('돌아가기', 92, 851, 342, () => this.back(), 86, 'secondary')
    if (!pub && this.screen === 'home' && !busy) button('공원으로 돌아가기', 92, 851, 480, () => this.back(), 86, 'secondary')
    text(busy ? '서버 응답을 기다리고 있어요…' : !connected ? '공원 연결을 확인하고 있어요…' : state.error, 982, 36)
    this.panel.mesh.visible = true
    const next = JSON.stringify([this.photos, this.cards, this.text, this.buttons.map(({ label, x, y }) => [label, x, y])])
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
    drawWebPanel(ctx, this.paper)
    this.cards.forEach(({ x, y, w, h }) => panelBox(ctx, x, y, w, h, '#fffaf0', '#d6b992'))
    for (const { src, x, y, w, h, crop } of this.photos) {
      let image = this.artwork.get(src)
      if (!image) { image = loadPanelArt(src, () => this.paint()); this.artwork.set(src, image) }
      panelPhoto(ctx, image, x, y, w, h, crop)
    }
    for (const { label, y, size, x, w } of this.text) {
      ctx.fillStyle = '#4c2d1c'; ctx.textAlign = 'center'
      ctx.font = `700 ${size}px ${size >= 49 ? 'BusanDandiMyeongjo, serif' : '"Malgun Gothic", sans-serif'}`
      ctx.fillText(label, x, y, w)
    }
    this.buttons.forEach((b, index) => panelButton(ctx, b.x, b.y, b.w, b.h, b.label, index === this.hovered, b.variant))
    this.panel.texture.needsUpdate = true
  }
}
