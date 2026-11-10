import * as THREE from 'three'

import { pickGuestGreeting, type GuestGreeting } from './guestGreetings'
export type { GuestGreeting } from './guestGreetings'
export const GUEST_GREETING_SECONDS = 2.4

/** Textures are cached by phrase per visit; each speaker owns its fading material. */
export class GuestSpeechArt {
  private textures = new Map<string, THREE.CanvasTexture>()
  texture(text: string) {
    let texture = this.textures.get(text)
    if (texture) return texture
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 160
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff9ec'; ctx.strokeStyle = '#b98f5d'; ctx.lineWidth = 4
    ctx.beginPath(); ctx.roundRect(5, 5, 502, 126, 28); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(230, 129); ctx.lineTo(247, 154); ctx.lineTo(267, 129); ctx.fill()
    ctx.beginPath(); ctx.moveTo(230, 130); ctx.lineTo(247, 154); ctx.lineTo(267, 130); ctx.stroke()
    ctx.fillStyle = '#50351f'; ctx.font = '700 64px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(text, 256, 69, 450)
    texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace
    this.textures.set(text, texture); return texture
  }
  dispose() { this.textures.forEach(texture => texture.dispose()); this.textures.clear() }
}

export class GuestSpeech {
  readonly root: THREE.Sprite
  private remaining = 0
  private delay = 0
  private previous: Partial<Record<GuestGreeting, string>> = {}
  private material = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, toneMapped: false })
  constructor(private art: GuestSpeechArt, private variant = 0) {
    this.root = new THREE.Sprite(this.material); this.root.visible = false
    this.root.scale.set(2.5, .78125, 1); this.root.name = 'guest-greeting'; this.root.renderOrder = 50
  }
  get visible() { return this.remaining > 0 }
  show(kind: GuestGreeting) {
    const text = pickGuestGreeting(this.variant, kind, this.previous[kind]); this.previous[kind] = text
    this.material.map = this.art.texture(text); this.material.needsUpdate = true
    this.remaining = GUEST_GREETING_SECONDS; this.material.opacity = 1
    this.delay = kind === 'departure' ? .65 : 0
    this.root.userData.text = text
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
