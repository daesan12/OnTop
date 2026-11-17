import { Raycaster, Vector3, type Object3D } from 'three'
import { useSession } from '../../network/worldClient'
import { parkRuntime } from '../../park/runtime/runtime'
import { XRCanvas } from '../../features/parkXR/XRCanvas'
import { drawWebPanel, loadPanelArt, loadPanelFont } from '../../features/parkXR/webPanelArt'
import { canPlace, useGame } from '../store'
import { omokCell, stonePoint } from '../omokPresentation'

type Cell = { x: number; y: number }

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
  }
  dispose() { this.hide(); this.paper.onload = null; this.panel.dispose() }

  update() {
    const game = ownOmokGame(), session = useSession.getState()
    const state = useGame.getState(), model = game?.omok
    if (!game || !model) { this.hide(); return }
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
    const deadline = model.turnDeadline ? Math.max(0, Math.ceil((Date.parse(model.turnDeadline) - Date.now()) / 1000)) : 0
    const turn = model.status === 'FINISHED' ? model.winnerUserId ? model.winnerUserId === own ? '승리' : '패배' : '무승부'
      : state.pending ? '착수 확인 중' : state.uncertain || state.recovery !== 'RESTORED' ? '경기 상태 확인 중'
        : model.undo || model.draw ? '요청 확인은 B로 일반 화면에서' : `${model.turnUserId === own ? '내 차례' : '상대 차례'} · ${deadline}초`
    const help = state.error || (this.board ? '탁자 위 교차점 · 검지 트리거' : '탁자 위 오목판을 불러오고 있어요')
    const signature = JSON.stringify([turn, model.blackUserId === own, help])
    if (this.signature === signature) return
    this.signature = signature
    const ctx = this.panel.canvas.getContext('2d')!
    drawWebPanel(ctx, this.paper)
    ctx.fillStyle = '#123b2a'; ctx.textAlign = 'center'; ctx.font = '700 57px BusanDandiMyeongjo, serif'
    ctx.fillText(turn, 480, 105, 860)
    ctx.font = '500 37px "Malgun Gothic", sans-serif'
    ctx.fillText(`${model.blackUserId === own ? '흑돌' : '백돌'} · ${help}`, 480, 175, 860)
    this.panel.texture.needsUpdate = true
  }

  hit(origin: Vector3, direction: Vector3): Cell | null {
    if (!this.board || !this.pickSurface) return null
    this.pickSurface.updateWorldMatrix(true, false)
    this.ray.set(origin, direction)
    const hit = this.ray.intersectObject(this.pickSurface, false)[0]
    if (!hit) return null
    const p = this.board.worldToLocal(this.local.copy(hit.point))
    return omokCell(p.x, p.z)
  }

  setHover(cell: Cell | null) {
    if (!this.preview) return
    const valid = cell && canPlace(useSession.getState().sessionId, cell.x, cell.y)
    this.preview.visible = !!valid
    if (cell && valid) this.preview.position.set(...stonePoint(cell.x, cell.y))
  }

  select(cell: Cell) {
    const session = useSession.getState()
    if (!session.pending && canPlace(session.sessionId, cell.x, cell.y)) void parkRuntime.placeOmok(cell.x, cell.y)
  }
}
