import type { Object3D, Vector3 } from 'three'
import { useSession } from '../../network/worldClient'
import { parkRuntime } from '../../park/runtime/runtime'
import { XRCanvas } from '../../features/parkXR/XRCanvas'
import { paintGuidePaper, TOUCH_GUIDE_COLORS } from '../../features/vrGuide/touchControllerGuide'
import { canPlace, useGame } from '../store'

const firstX = 80, firstY = 125, gap = 57
type Cell = { x: number; y: number }

export function ownOmokGame() {
  const { game, permittedGameId } = useGame.getState()
  return game?.omok && game.role === 'PLAYER' && game.gameId === permittedGameId ? game : null
}

/** The player's board uses the live table store and the same move command as the desktop board. */
export class OmokXR {
  private readonly panel = new XRCanvas(960, 1024, .89)
  private hover: Cell | null = null
  private signature = ''

  constructor(parent: Object3D) {
    this.panel.mesh.name = 'park-xr-omok'
    this.panel.mesh.position.set(0, 0, -1.4)
    parent.add(this.panel.mesh)
  }

  hide() { this.panel.mesh.visible = false; this.hover = null }
  dispose() { this.panel.dispose() }

  update() {
    const game = ownOmokGame(), own = useSession.getState().sessionId
    const state = useGame.getState(), model = game?.omok
    this.panel.mesh.visible = !!model
    if (!model) return
    const deadline = model.turnDeadline ? Math.max(0, Math.ceil((Date.parse(model.turnDeadline) - Date.now()) / 1000)) : 0
    const hovered = this.hover && canPlace(own, this.hover.x, this.hover.y) ? this.hover : null
    const turn = model.status === 'FINISHED' ? model.winnerUserId ? model.winnerUserId === own ? '승리' : '패배' : '무승부'
      : state.pending ? '착수 확인 중' : state.uncertain || state.recovery !== 'RESTORED' ? '경기 상태 확인 중'
        : model.undo || model.draw ? '요청 확인은 B로 일반 화면에서' : `${model.turnUserId === own ? '내 차례' : '상대 차례'} · ${deadline}초`
    const signature = JSON.stringify([game.gameId, game.version, turn, hovered, state.error])
    if (this.signature === signature) return
    this.signature = signature
    const ctx = this.panel.canvas.getContext('2d')!
    ctx.save(); ctx.scale(960 / 1536, 1); paintGuidePaper(ctx, 1024); ctx.restore()
    ctx.fillStyle = TOUCH_GUIDE_COLORS.ink; ctx.textAlign = 'center'; ctx.font = 'bold 42px sans-serif'
    ctx.fillText(`오목 · ${model.blackUserId === own ? '흑돌' : '백돌'} · ${turn}`, 480, 78, 860)
    ctx.fillStyle = '#e5ba80'; ctx.fillRect(48, 94, 864, 860)
    ctx.strokeStyle = '#51351b'; ctx.lineWidth = 2; ctx.beginPath()
    for (let index = 0; index < 15; index++) {
      const x = firstX + index * gap, y = firstY + index * gap
      ctx.moveTo(x, firstY); ctx.lineTo(x, firstY + 14 * gap)
      ctx.moveTo(firstX, y); ctx.lineTo(firstX + 14 * gap, y)
    }
    ctx.stroke()
    const dot = (col: number, row: number, fill: string, radius: number) => {
      ctx.beginPath(); ctx.arc(firstX + col * gap, firstY + row * gap, radius, 0, Math.PI * 2)
      ctx.fillStyle = fill; ctx.fill(); ctx.stroke()
    }
    for (const x of [3, 7, 11]) for (const y of [3, 7, 11]) dot(x, y, '#51351b', 4)
    model.board.forEach((row, y) => row.forEach((stone, x) => { if (stone) dot(x, y, stone === 1 ? '#222522' : '#fff8e7', 23) }))
    if (model.lastMove) dot(model.lastMove.x, model.lastMove.y, '#c46932', 6)
    if (model.blackUserId === own) for (const point of model.forbiddenMoves ?? []) dot(point.x, point.y, '#ad4d35', 5)
    if (hovered) dot(hovered.x, hovered.y, '#4c885b', 15)
    ctx.fillStyle = TOUCH_GUIDE_COLORS.ink; ctx.font = '30px sans-serif'
    ctx.fillText(state.error || '교차점을 검지 트리거로 선택 · B 일반 화면', 480, 1000, 860)
    this.panel.texture.needsUpdate = true
  }

  hit(origin: Vector3, direction: Vector3): Cell | null {
    const hit = this.panel.point(origin, direction)
    if (!hit) return null
    const x = Math.round((hit.x - firstX) / gap), y = Math.round((hit.y - firstY) / gap)
    return x >= 0 && x < 15 && y >= 0 && y < 15 ? { x, y } : null
  }

  setHover(cell: Cell | null) { this.hover = cell }

  select(cell: Cell) {
    const session = useSession.getState()
    if (!session.pending && canPlace(session.sessionId, cell.x, cell.y)) void parkRuntime.placeOmok(cell.x, cell.y)
  }
}
