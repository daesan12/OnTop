import * as THREE from 'three'

export type GuestGreeting = 'arrival' | 'departure'
export const GUEST_GREETINGS = { arrival: '안녕하세요!', departure: '잘 먹었습니다!' } as const
export const GUEST_GREETING_SECONDS = 2.4

/** Two shared text textures per visit; each speaker owns only its fading material. */
export class GuestSpeechArt {
  private textures = new Map<GuestGreeting, THREE.CanvasTexture>()
  texture(kind: GuestGreeting) {
    let texture = this.textures.get(kind)
    if (texture) return texture
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 160
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff9ec'; ctx.strokeStyle = '#b98f5d'; ctx.lineWidth = 4
    ctx.beginPath(); ctx.roundRect(5, 5, 502, 126, 28); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(230, 129); ctx.lineTo(247, 154); ctx.lineTo(267, 129); ctx.fill()
    ctx.beginPath(); ctx.moveTo(230, 130); ctx.lineTo(247, 154); ctx.lineTo(267, 130); ctx.stroke()
    ctx.fillStyle = '#50351f'; ctx.font = '700 64px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(GUEST_GREETINGS[kind], 256, 69, 450)
    texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace
    this.textures.set(kind, texture); return texture
  }
  dispose() { this.textures.forEach(texture => texture.dispose()); this.textures.clear() }
}

export class GuestSpeech {
  readonly root: THREE.Sprite
  private remaining = 0
  private delay = 0
  private material = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, toneMapped: false })
  constructor(private art: GuestSpeechArt) {
    this.root = new THREE.Sprite(this.material); this.root.visible = false
    this.root.scale.set(3.15, .985, 1); this.root.name = 'guest-greeting'
  }
  get visible() { return this.remaining > 0 }
  show(kind: GuestGreeting) {
    this.material.map = this.art.texture(kind); this.material.needsUpdate = true
    this.remaining = GUEST_GREETING_SECONDS; this.material.opacity = 1
    this.delay = kind === 'departure' ? .65 : 0
    this.root.userData.text = GUEST_GREETINGS[kind]
  }
  update(dt: number, height: number, reduced: boolean) {
    let step = Math.max(0, dt)
    if (reduced) this.delay = 0
    if (this.delay > 0) { const wait = Math.min(step, this.delay); this.delay -= wait; step -= wait }
    this.remaining = Math.max(0, this.remaining - step)
    if (this.delay > 0) { this.root.visible = false; return }
    this.root.visible = this.visible; this.root.position.set(0, height + .48, 0)
    this.material.opacity = reduced ? 1 : Math.min(1, this.remaining / .3)
  }
  dispose() { this.root.removeFromParent(); this.material.dispose() }
}
