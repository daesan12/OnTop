import type { Object3D, Vector3 } from 'three'
import { useSession } from '../../network/worldClient'
import { parkRuntime } from '../../park/runtime/runtime'
import { displayNickname } from '../gameMaster/displayName'
import { paintGuideButton, paintGuidePaper, TOUCH_GUIDE_COLORS } from '../vrGuide/touchControllerGuide'
import { composeHangul } from './hangul'
import { XRCanvas } from './XRCanvas'

const korean = ['ㅂㅈㄷㄱㅅㅛㅕㅑㅐㅔ', 'ㅁㄴㅇㄹㅎㅗㅓㅏㅣ', 'ㅋㅌㅊㅍㅠㅜㅡ']
const shifted = ['ㅃㅉㄸㄲㅆㅛㅕㅑㅒㅖ', korean[1]!, korean[2]!]
const latin = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm,.!?']
type Button = { x: number; y: number; width: number; height: number; label: string; action: string }

export class XRChat {
  private readonly panel = new XRCanvas(1536, 1024, 1.36)
  private keys: string[] = []
  private buttons: Button[] = []
  private english = false
  private shift = false
  private sending = false
  private notice = ''
  private signature = ''
  private hover: string | null = null
  private generation = 0
  open = false

  constructor(parent: Object3D) {
    this.panel.mesh.name = 'park-xr-chat'
    this.panel.mesh.position.set(0, -.025, -1.38)
    parent.add(this.panel.mesh)
  }

  toggle() { this.open = !this.open; this.hover = null }
  hide() { this.panel.mesh.visible = false }
  reset() { this.generation++; this.open = this.sending = false; this.keys = []; this.notice = ''; this.hide() }

  update(visible: boolean) {
    this.panel.mesh.visible = visible && this.open
    if (!this.panel.mesh.visible) return
    const { messages, profiles } = useSession.getState()
    const feed = messages.slice(-4).map(row => `${row.displayName ?? displayNickname(profiles[row.userId], '산책자')}  ${row.text}`)
    const draft = composeHangul(this.keys)
    const signature = JSON.stringify([feed, draft, this.english, this.shift, this.sending, this.notice, this.hover])
    if (signature === this.signature) return
    this.signature = signature
    const ctx = this.panel.canvas.getContext('2d')!
    paintGuidePaper(ctx, 1024)
    ctx.fillStyle = TOUCH_GUIDE_COLORS.ink
    ctx.font = 'bold 54px sans-serif'; ctx.fillText('주변 채팅', 64, 101)
    ctx.font = '42px sans-serif'
    feed.forEach((line, index) => ctx.fillText(line, 64, 175 + index * 56, 1400))
    ctx.fillStyle = '#fffaf0'; ctx.fillRect(60, 402, 1416, 78)
    ctx.fillStyle = TOUCH_GUIDE_COLORS.ink
    ctx.fillText(draft.slice(-42) || '검지 트리거로 글자를 선택하세요', 82, 456, 1370)
    this.buttons = []
    const button = (label: string, action: string, x: number, y: number, width: number, height: number) => {
      this.buttons.push({ label, action, x, y, width, height })
      paintGuideButton(ctx, x, y, width, height, label, this.hover === action)
    }
    const rows = this.english ? latin : this.shift ? shifted : korean
    rows.forEach((row, index) => [...row].forEach((key, column) =>
      button(key, key, (1536 - row.length * 126) / 2 + column * 126, 505 + index * 86, 115, 74)))
    button(this.english ? '한글' : '영문', 'language', 64, 862, 200, 86)
    button(this.shift ? '기본' : '쌍자음', 'shift', 278, 862, 210, 86)
    button('띄우기', ' ', 502, 862, 250, 86)
    button('지우기', 'delete', 766, 862, 210, 86)
    button(this.sending ? '전송 중…' : '보내기', 'send', 990, 862, 230, 86)
    button('닫기 · Y', 'close', 1234, 862, 238, 86)
    ctx.fillStyle = TOUCH_GUIDE_COLORS.ink; ctx.font = '30px sans-serif'
    ctx.fillText(this.notice, 66, 989, 1390)
    this.panel.texture.needsUpdate = true
  }

  hit(origin: Vector3, direction: Vector3) {
    const hit = this.panel.point(origin, direction)
    return hit ? this.buttons.find(({ x, y, width, height }) => hit.x >= x && hit.x < x + width && hit.y >= y && hit.y < y + height)?.action ?? null : null
  }

  setHover(action: string | null) { this.hover = action }

  select(action: string) {
    if (action === 'close') { this.toggle(); return }
    if (this.sending) return
    this.notice = ''
    if (action === 'language') { this.english = !this.english; this.shift = false }
    else if (action === 'shift') { this.english = false; this.shift = !this.shift }
    else if (action === 'delete') this.keys.pop()
    else if (action === 'send') void this.send()
    else if (this.keys.length < 400) this.keys.push(action)
  }

  private async send() {
    const value = composeHangul(this.keys).trim()
    if (!value) return
    const generation = this.generation
    this.sending = true
    const sent = await parkRuntime.sendChat(value).catch(() => false)
    if (generation !== this.generation) return
    this.sending = false
    if (sent) this.keys = []
    else this.notice = '전송하지 못했어요. 내용을 확인하고 다시 보내주세요.'
  }

  dispose() { this.reset(); this.panel.dispose() }
}
