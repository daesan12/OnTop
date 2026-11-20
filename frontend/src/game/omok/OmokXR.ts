import { Raycaster, Vector3, type Object3D } from 'three'
import { useSession } from '../../network/worldClient'
import { parkRuntime } from '../../park/runtime/runtime'
import { XRCanvas } from '../../features/parkXR/XRCanvas'
import { drawWebPanel, loadPanelArt, loadPanelFont, panelButton } from '../../features/parkXR/webPanelArt'
import { canRetryForfeit, canStartForfeit, useForfeit } from '../forfeit'
import { canPlace, useGame } from '../store'
import { omokCell, stonePoint } from '../omokPresentation'
import { useOmokEvents } from './spectatorEvents'

type Cell = { x: number; y: number }
type Action = 'forfeit' | 'confirm' | 'cancel' | 'check' | 'retry' | 'panel'
type Target = Cell | Action
type Button = { action: Action; label: string; x: number; width: number }
const buttonY = 152, buttonHeight = 60

export function ownOmokGame() {
  const { game, permittedGameId } = useGame.getState()
  return game?.omok && game.role === 'PLAYER' && game.gameId === permittedGameId ? game : null
}

/** Aim at the same pavilion board and cell grid the desktop player sees. */
export class OmokXR {
  private readonly panel = new XRCanvas(960, 240, .88)
  private readonly ray = new Raycaster()
  private readonly local = new Vector3()
  private readonly paper = loadPanelArt('/art/tablet/hanji.webp', () => { this.signature = '' })
  private board?: Object3D
  private pickSurface?: Object3D
  private preview?: Object3D
  private signature = ''
  private confirmForfeit = false
  private buttons: Button[] = []
  private hover: Action | null = null
  private gameId = ''

  constructor(parent: Object3D, private readonly scene: Object3D) {
    this.panel.mesh.name = 'park-xr-omok'
    this.panel.mesh.position.set(0, .39, -1.4)
    parent.add(this.panel.mesh)
    loadPanelFont(() => { this.signature = '' })
  }

  hide() {
    this.panel.mesh.visible = false
    if (this.preview) this.preview.visible = false
    this.board = this.pickSurface = this.preview = undefined
    this.confirmForfeit = false; this.buttons = []; this.hover = null
    this.gameId = ''; this.signature = ''
  }
  dispose() { this.hide(); this.paper.onload = null; this.panel.dispose() }

  update() {
    const game = ownOmokGame(), session = useSession.getState()
    const state = useGame.getState(), model = game?.omok
    if (!game || !model) { this.hide(); return }
    if (this.gameId !== game.gameId) { this.confirmForfeit = false; this.gameId = game.gameId }
    const anchor = session.bindings.find(b => b.channelId === session.roomId && b.tableId === session.tableId)?.anchorId
    const name = 'omok-board-' + anchor
    if (this.board?.name !== name || !this.board?.parent) {
      if (this.preview) this.preview.visible = false
      this.board = anchor ? this.scene.getObjectByName(name) : undefined
      this.pickSurface = this.board?.getObjectByName('omok-pick-surface')
      this.preview = this.board?.getObjectByName('omok-hover')
    }
    this.panel.mesh.visible = true
    const own = session.sessionId
    const canStart = !session.pending && canStartForfeit(own, state)
    if (!canStart) this.confirmForfeit = false
    const attempt = useForfeit.getState().attempt
    const forfeit = attempt?.gameId === game.gameId && attempt.userId === own ? attempt : null
    const deadline = model.turnDeadline ? Math.max(0, Math.ceil((Date.parse(model.turnDeadline) - Date.now()) / 1000)) : 0
    let title = model.status === 'FINISHED' ? model.winnerUserId ? model.winnerUserId === own ? '승리' : '패배' : '무승부'
      : state.pending ? '착수 확인 중' : state.uncertain || state.recovery !== 'RESTORED' ? '경기 상태 확인 중'
        : model.undo || model.draw ? '요청 확인은 B로 일반 화면에서' : `${model.turnUserId === own ? '내 차례' : '상대 차례'} · ${deadline}초`
    let help = state.error || (this.board ? '탁자 위 교차점 · 검지 트리거' : '오목판을 불러오고 있어요')
    const chat = useOmokEvents.getState().chats.at(-1)
    if (chat?.gameId === game.gameId && chat.until > performance.now() && !state.error) {
      const text = [...chat.text]
      help = `${chat.displayName ?? session.profiles[chat.senderUserId]?.nickname ?? '관전자'} · ${text.slice(0, 34).join('')}${text.length > 34 ? '…' : ''}`
    }
    this.buttons = []
    if (this.confirmForfeit) {
      title = '기권할까요?'
      help = '기권하면 패배로 처리되며 되돌릴 수 없어요.'
      this.buttons = [{ action: 'cancel', label: '계속 플레이', x: 120, width: 340 }, { action: 'confirm', label: '기권 확정', x: 500, width: 340 }]
    } else if (model.status === 'PLAYING' && forfeit?.status === 'uncertain') {
      title = '기권 반영 여부 확인'
      help = forfeit.error
      if (!session.pending && !state.pending) this.buttons.push({ action: 'check', label: '경기 상태 확인', x: 120, width: 340 })
      if (!session.pending && canRetryForfeit(own, state)) this.buttons.push({ action: 'retry', label: '같은 기권 요청 확인', x: 500, width: 340 })
    } else if (model.status === 'PLAYING' && (forfeit?.status === 'pending' || forfeit?.status === 'approved')) {
      title = '기권 처리 확인 중'
      help = '서버의 경기 결과를 기다리고 있어요.'
    } else if (canStart) {
      this.buttons = [{ action: 'forfeit', label: '기권', x: 732, width: 170 }]
    }
    const detail = this.confirmForfeit || forfeit && forfeit.status !== 'rejected'
      ? help : `${model.blackUserId === own ? '흑돌' : '백돌'} · ${help}`
    const signature = JSON.stringify([title, detail, this.buttons, this.hover])
    if (this.signature === signature) return
    this.signature = signature
    const ctx = this.panel.canvas.getContext('2d')!
    drawWebPanel(ctx, this.paper)
    ctx.fillStyle = '#123b2a'; ctx.textAlign = 'center'; ctx.font = '700 57px BusanDandiMyeongjo, serif'
    ctx.fillText(title, 480, this.buttons.length ? 79 : 105, 860)
    ctx.font = '500 37px "Malgun Gothic", sans-serif'
    ctx.fillText(detail, 480, this.buttons.length ? 131 : 175, 860)
    for (const { action, label, x, width } of this.buttons)
      panelButton(ctx, x, buttonY, width, buttonHeight, label, this.hover === action, action === 'confirm' ? 'room' : 'secondary')
    this.panel.texture.needsUpdate = true
  }

  hit(origin: Vector3, direction: Vector3): Target | null {
    const point = this.panel.point(origin, direction)
    if (point) return this.buttons.find(button => point.x >= button.x && point.x <= button.x + button.width
      && point.y >= buttonY && point.y <= buttonY + buttonHeight)?.action ?? 'panel'
    if (this.confirmForfeit) return null
    if (!this.board || !this.pickSurface) return null
    this.pickSurface.updateWorldMatrix(true, false)
    this.ray.set(origin, direction)
    const hit = this.ray.intersectObject(this.pickSurface, false)[0]
    if (!hit) return null
    const p = this.board.worldToLocal(this.local.copy(hit.point))
    return omokCell(p.x, p.z)
  }

  setHover(target: Target | null) {
    this.hover = typeof target === 'string' && target !== 'panel' ? target : null
    if (!this.preview) return
    const cell = typeof target === 'object' ? target : null
    const valid = cell && canPlace(useSession.getState().sessionId, cell.x, cell.y)
    this.preview.visible = !!valid
    if (cell && valid) this.preview.position.set(...stonePoint(cell.x, cell.y))
  }

  select(target: Target) {
    const session = useSession.getState()
    if (typeof target !== 'string') {
      if (!this.confirmForfeit && !session.pending && canPlace(session.sessionId, target.x, target.y)) void parkRuntime.placeOmok(target.x, target.y)
      return
    }
    const state = useGame.getState(), game = ownOmokGame()
    if (!game || session.pending) return
    if (target === 'cancel') this.confirmForfeit = false
    if (target === 'forfeit' && canStartForfeit(session.sessionId, state)) this.confirmForfeit = true
    if (target === 'confirm' && this.confirmForfeit && canStartForfeit(session.sessionId, state)) {
      this.confirmForfeit = false
      void parkRuntime.forfeitGame(game.gameId)
    }
    if (target === 'check' && !state.pending) void parkRuntime.checkRecovery()
    if (target === 'retry' && canRetryForfeit(session.sessionId, state)) void parkRuntime.forfeitGame(game.gameId, true)
  }
}
