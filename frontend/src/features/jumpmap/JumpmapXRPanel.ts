import * as THREE from 'three'
import { parkRuntime } from '../../park/runtime/runtime'
import { closeJumpCompletion, useJumpmap } from './state'
import { jumpmapXRView, xrTime, type JumpmapXRAction, type JumpmapXRView } from './xrModel'
import { parseJumpmapRankings, type JumpmapRankings } from './ranking'
import { paintJumpmapXRGuide } from './xrGuide'
import { parkGuideArt, paintParkXRGuide } from '../parkXR/guide'
import { paintGuideButton, paintGuideNotePaper, paintGuidePaper, TOUCH_GUIDE_COLORS } from '../vrGuide/touchControllerGuide'
import { requestXRHeightReset, setXRComfort, turnLabel, useXRComfort, XR_EYE_HEIGHTS } from '../parkXR/comfort'

const WIDTH = 1536, HEIGHT = 1024
interface Button { id: JumpmapXRAction; x: number; y: number; width: number; height: number }

/** In-world UI shares the normal jumpmap store. It never starts runs or grants coins. */
export class JumpmapXRPanel {
  inCourse = true
  readonly anchor = new THREE.Group()
  readonly statusAnchor = new THREE.Group()
  private readonly canvas = document.createElement('canvas')
  private readonly texture = new THREE.CanvasTexture(this.canvas)
  private readonly material = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false })
  private readonly mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.38, .92), this.material)
  private readonly statusCanvas = document.createElement('canvas')
  private readonly statusTexture = new THREE.CanvasTexture(this.statusCanvas)
  private readonly statusMaterial = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false })
  private readonly statusMesh = new THREE.Mesh(new THREE.PlaneGeometry(.90, .17), this.statusMaterial)
  private readonly raycaster = new THREE.Raycaster()
  private readonly hits: THREE.Intersection[] = []
  private view: JumpmapXRView = jumpmapXRView(useJumpmap.getState(), 0, false)
  private buttons: Button[] = []
  private hover: JumpmapXRAction | null = null
  private lastPaint = -Infinity
  private previousKey = ''
  private signature = ''
  private readonly body = new THREE.Vector3()
  private readonly bodyDelta = new THREE.Vector3()
  private guide = false
  private parkGuide = false
  private comfort = false
  private ranking = false
  private rankingAbort?: AbortController
  private rankings?: JumpmapRankings
  private rankingError = false
  private rankingPage = 0
  private readonly guideArt = new Image()
  private readonly paperArt = new Image()
  private readonly parkArt = new Image()

  constructor(scene: THREE.Scene, headAnchor: THREE.Group) {
    this.canvas.width = WIDTH; this.canvas.height = HEIGHT
    this.statusCanvas.width = WIDTH; this.statusCanvas.height = 290
    this.texture.colorSpace = this.statusTexture.colorSpace = THREE.SRGBColorSpace
    this.material.map = this.texture; this.statusMaterial.map = this.statusTexture
    // Use the transparent render queue so lake/particle passes cannot draw over UI.
    this.mesh.name = 'jumpmap-xr-dialog'; this.mesh.renderOrder = 10010
    this.statusMesh.name = 'jumpmap-xr-status'; this.statusMesh.renderOrder = 10000
    this.statusMesh.position.set(0, -.42, -1.35)
    this.anchor.add(this.mesh); this.statusAnchor.add(this.statusMesh)
    this.anchor.visible = this.statusAnchor.visible = false
    scene.add(this.anchor); headAnchor.add(this.statusAnchor)
    for (const [image, src] of [[this.guideArt, '/art/jumpmap/guide-3.webp'], [this.paperArt, '/art/tablet/hanji.webp'], [this.parkArt, parkGuideArt]] as const) {
      image.onload = () => { this.signature = ''; this.lastPaint = -Infinity }
      image.src = src
    }
  }

  get blocking() { return this.view.buttons.length > 0 }
  get key() { return this.view.key }
  get hovered() { return this.hover }
  toggleGuide(park = false) {
    if (useJumpmap.getState().completion) return
    if (this.parkGuide || this.guide || this.comfort) { this.parkGuide = this.guide = this.comfort = false; return }
    this.parkGuide = park; this.guide = !park
  }
  showParkGuide() {
    if (useJumpmap.getState().completion) return
    this.parkGuide = true; this.guide = false
  }
  showComfort() {
    if (useJumpmap.getState().completion) return
    if (!this.guide && !this.parkGuide) { this.parkGuide = !this.inCourse; this.guide = this.inCourse }
    this.comfort = true
  }

  private comfortView(): JumpmapXRView {
    const { settings: s, heightNotice } = useXRComfort.getState()
    return { key: 'comfort', title: 'VR 편안함 설정', lines: [
      '고개 움직임은 그대로 · 큰 방향 전환은 오른쪽 스틱',
      heightNotice || '자세를 바꿨다면 멈춘 뒤 눈높이를 재설정하세요.',
    ], buttons: [
      { id: 'turn-mode', label: `회전 방식: ${turnLabel(s)}` },
      { id: 'turn-value', label: s.turnMode === 'smooth' ? `회전 속도: ${s.turnSpeed}도/초` : `스냅 각도: ${s.snapAngle}도` },
      { id: 'posture', label: `자세: ${s.posture === 'standing' ? '서서' : '앉아서'}` },
      { id: 'eye-height', label: `앉기 기준: ${s.seatedEyeHeight}m` },
      { id: 'reset-height', label: '현재 자세로 눈높이 재설정' },
      { id: 'comfort-back', label: '안내로 돌아가기 · A' },
    ] }
  }

  /** Repaint at 5Hz; geometry/texture objects remain stable across all XR frames. */
  update(now: number, eye: THREE.Vector3, yaw: number, body: THREE.Vector3) {
    const state = useJumpmap.getState()
    const base = jumpmapXRView(state, now, this.guide, this.inCourse)
    if (state.completion) this.parkGuide = this.comfort = false
    if (!base.key.startsWith('result:') && this.ranking) this.cancelRanking()
    this.view = this.comfort ? this.comfortView() : this.ranking ? this.rankingView(base.key) : this.parkGuide ? {
      key: 'park-guide', title: '공원 · VR 조작 안내',
      lines: ['왼쪽 스틱 이동 · 왼손 그립 달리기 · 오른손 A 점프', '오른쪽 스틱 회전 · 왼손 X 안내 · 오른손 B VR 종료', '편안함 설정에서 회전 방식·속도와 눈높이를 바꿔요.'],
      buttons: [{ id: 'jump-guide', label: '돌탑 놀이 방법' }, { id: 'comfort', label: '편안함 설정' }, { id: 'continue', label: '안내 닫기 · A' }],
    } : base
    if (this.previousKey !== this.view.key) {
      this.previousKey = this.view.key; this.lastPaint = -Infinity; this.hover = null
      if (this.blocking) {
        this.anchor.rotation.set(0, yaw, 0)
        this.anchor.position.set(eye.x - Math.sin(yaw) * 1.55, eye.y - .06, eye.z - Math.cos(yaw) * 1.55)
        this.anchor.updateMatrixWorld(true)
      }
    } else if (this.blocking) {
      // A server correction/fall can continue behind an open guide. Follow the
      // body translation so controls remain reachable, without locking to head rotation.
      this.anchor.position.add(this.bodyDelta.copy(body).sub(this.body))
      this.anchor.updateMatrixWorld(true)
    }
    this.body.copy(body)
    this.anchor.visible = this.blocking
    // Playing never attaches a persistent tip board to the viewer's head.
    this.statusAnchor.visible = false
    if (now - this.lastPaint >= 200) {
      this.lastPaint = now
      if (this.signature !== JSON.stringify(this.view)) this.paint()
    }
  }

  setVisible(visible: boolean) {
    this.anchor.visible = visible && this.blocking
    this.statusAnchor.visible = false
  }

  /** Ray is in world coordinates, from the current XRFrame targetRaySpace. */
  hit(origin: THREE.Vector3, direction: THREE.Vector3): JumpmapXRAction | null {
    if (!this.anchor.visible) return null
    this.raycaster.set(origin, direction); this.hits.length = 0
    this.raycaster.intersectObject(this.mesh, false, this.hits)
    const uv = this.hits[0]?.uv
    if (!uv) return null
    const x = uv.x * WIDTH, y = (1 - uv.y) * HEIGHT
    return this.buttons.find(b => x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height)?.id ?? null
  }

  setHover(action: JumpmapXRAction | null) {
    if (action === this.hover) return
    this.hover = action; this.paint()
  }

  activate(action: JumpmapXRAction) {
    if (!this.buttons.some(button => button.id === action)) return
    const s = useXRComfort.getState().settings
    if (action === 'comfort') this.showComfort()
    if (action === 'comfort-back') this.comfort = false
    if (action === 'turn-mode') setXRComfort({ turnMode: s.turnMode === 'smooth' ? 'snap' : 'smooth' })
    if (action === 'turn-value') setXRComfort(s.turnMode === 'smooth'
      ? { turnSpeed: s.turnSpeed === 60 ? 90 : s.turnSpeed === 90 ? 120 : 60 }
      : { snapAngle: s.snapAngle === 30 ? 45 : 30 })
    if (action === 'posture') setXRComfort({ posture: s.posture === 'standing' ? 'seated' : 'standing' })
    if (action === 'eye-height') {
      const next = (XR_EYE_HEIGHTS.indexOf(s.seatedEyeHeight) + 1) % XR_EYE_HEIGHTS.length
      setXRComfort({ seatedEyeHeight: XR_EYE_HEIGHTS[next] })
    }
    if (action === 'reset-height') requestXRHeightReset()
    if (action === 'continue') { this.guide = this.parkGuide = false; this.cancelRanking(); closeJumpCompletion() }
    if (action === 'park-guide') this.showParkGuide()
    if (action === 'jump-guide') { this.parkGuide = false; this.guide = true }
    if (action === 'ranking' || action === 'retry') { this.ranking = true; void this.loadRankings() }
    if (action === 'back') this.cancelRanking()
    if (action === 'previous') this.rankingPage = Math.max(0, this.rankingPage - 1)
    if (action === 'next') this.rankingPage = Math.min(Math.ceil((this.rankings?.items.length ?? 0) / 5) - 1, this.rankingPage + 1)
    this.lastPaint = -Infinity
  }

  primary() { this.activate(this.comfort ? 'comfort-back' : this.ranking ? 'back' : 'continue') }

  private async loadRankings() {
    this.rankingAbort?.abort()
    const abort = new AbortController(); this.rankingAbort = abort
    this.rankings = undefined; this.rankingError = false; this.rankingPage = 0
    try {
      const response = await parkRuntime.requestJSON('/api/v1/minigames/jumpmap/rankings', {
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]),
      })
      if (!abort.signal.aborted) this.rankings = parseJumpmapRankings(response)
    } catch { if (!abort.signal.aborted) this.rankingError = true }
    this.lastPaint = -Infinity
  }

  private rankingView(key: string): JumpmapXRView {
    const data = this.rankings, page = this.rankingPage
    return { key: `ranking:${key}`, title: '돌탑 타임어택 랭킹', lines: this.rankingError ? ['랭킹을 불러오지 못했어요. 다시 확인해 주세요.']
      : !data ? ['랭킹 확인 중…'] : [
        data.me ? `내 최고 기록  ${data.me.rank}위 · ${xrTime(data.me.finishMs)}` : '아직 등록된 내 완주 기록이 없어요.',
        ...data.items.slice(page * 5, page * 5 + 5).map(item => `${item.rank}위  ${Array.from(item.nickname).slice(0, 12).join('')}  ${xrTime(item.finishMs)}`),
        data.items.length ? `${page + 1} / ${Math.ceil(data.items.length / 5)}쪽 · 개인 최고 기록 기준` : '첫 완주 기록을 기다리고 있어요.',
      ], buttons: [
        ...(this.rankingError ? [{ id: 'retry' as const, label: '다시 확인' }] : []),
        ...(page > 0 ? [{ id: 'previous' as const, label: '이전' }] : []),
        ...(data && (page + 1) * 5 < data.items.length ? [{ id: 'next' as const, label: '다음' }] : []),
        { id: 'back', label: '결과로 · A' },
      ] }
  }

  private cancelRanking() { this.rankingAbort?.abort(); this.rankingAbort = undefined; this.ranking = false; this.rankings = undefined }

  private paint() {
    this.anchor.userData.view = this.statusAnchor.userData.view = this.view
    if (!this.blocking) {
      this.buttons = []; this.signature = JSON.stringify(this.view)
      return
    }
    const ctx = (this.blocking ? this.canvas : this.statusCanvas).getContext('2d')
    if (!ctx) return
    this.signature = JSON.stringify(this.view)
    const height = this.blocking ? HEIGHT : 290
    const guide = this.view.key === 'guide' || this.view.key === 'park-guide'
    if (this.view.key === 'park-guide') paintParkXRGuide(ctx, this.parkArt, this.paperArt)
    else if (guide) paintJumpmapXRGuide(ctx, this.guideArt, this.paperArt)
    else if (this.blocking) {
      paintGuidePaper(ctx, HEIGHT, this.paperArt)
      ctx.textAlign = 'center'; ctx.fillStyle = TOUCH_GUIDE_COLORS.ink
      ctx.font = '700 72px "BusanDandiMyeongjo", "Malgun Gothic", serif'
      ctx.fillText(this.view.title, WIDTH / 2, 122, WIDTH - 112)
      ctx.strokeStyle = '#d4c5a5'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(80, 157); ctx.lineTo(WIDTH - 80, 157); ctx.stroke()
      const ranking = this.view.key.startsWith('ranking:')
      this.view.lines.forEach((line, i) => {
        const emphasis = !ranking && (i === 1 || i === 2)
        ctx.fillStyle = i === 0 || i >= 4 && !ranking ? TOUCH_GUIDE_COLORS.muted : TOUCH_GUIDE_COLORS.ink
        ctx.font = `${emphasis ? '700 50' : '400 40'}px "Malgun Gothic", sans-serif`
        ctx.fillText(line, WIDTH / 2, 240 + i * 74, WIDTH - 128)
      })
      ctx.textAlign = 'left'
    }
    else {
      ctx.fillStyle = '#203c32'; ctx.fillRect(0, 0, WIDTH, height)
      ctx.strokeStyle = '#d9ba76'; ctx.lineWidth = 5; ctx.strokeRect(8, 8, WIDTH - 16, height - 16)
      ctx.fillStyle = '#fff4dc'; ctx.font = 'bold 60px "Malgun Gothic", sans-serif'
      ctx.fillText(this.view.title, 56, this.blocking ? 105 : 78, WIDTH - 112)
      ctx.font = `${this.blocking ? 42 : 45}px "Malgun Gothic", sans-serif`
      this.view.lines.forEach((line, i) => ctx.fillText(line, 56, (this.blocking ? 210 : 163) + i * (this.blocking ? 74 : 70), WIDTH - 112))
    }
    this.buttons = []
    if (this.blocking) {
      const count = this.view.key === 'comfort' ? 2 : this.view.buttons.length
      const width = (WIDTH - 112 - (count - 1) * 24) / count
      this.buttons = this.view.buttons.map((button, i) => ({ id: button.id,
        x: 56 + (i % count) * (width + 24), y: this.view.key === 'comfort' ? 370 + Math.floor(i / count) * 142 : 810,
        width, height: 112 }))
      this.mesh.userData.buttons = this.buttons
      this.buttons.forEach((button, i) => {
        paintGuideButton(ctx, button.x, button.y, button.width, button.height, this.view.buttons[i]!.label, this.hover === button.id)
      })
      paintGuideNotePaper(ctx, 946)
      ctx.textAlign = 'left'; ctx.fillStyle = TOUCH_GUIDE_COLORS.muted; ctx.font = '35px "Malgun Gothic", sans-serif'
      ctx.fillText(this.view.key === 'comfort' ? '레이저 + 트리거로 선택 · A 안내로 · X 닫기 · B VR 종료'
        : guide ? '레이저 + 트리거 선택 · A 안내 닫기 · 실제로 뛰지 않아요' : '레이저 + 트리거 선택 · A 계속 / 뒤로 · B VR 종료', 56, 985, WIDTH - 112)
      this.texture.needsUpdate = true
    } else this.statusTexture.needsUpdate = true
    this.anchor.userData.view = this.statusAnchor.userData.view = this.view
  }

  reset() {
    this.cancelRanking(); this.guide = this.parkGuide = this.comfort = false; this.previousKey = ''; this.hover = null; this.signature = ''
    this.view = jumpmapXRView(useJumpmap.getState(), performance.now(), false)
    this.anchor.visible = this.statusAnchor.visible = false
  }

  recenter() { this.previousKey = ''; this.signature = '' }

  dispose() {
    this.guideArt.onload = this.paperArt.onload = this.parkArt.onload = null
    this.reset(); this.anchor.removeFromParent(); this.statusAnchor.removeFromParent()
    this.mesh.geometry.dispose(); this.statusMesh.geometry.dispose()
    this.material.dispose(); this.statusMaterial.dispose(); this.texture.dispose(); this.statusTexture.dispose()
  }
}
