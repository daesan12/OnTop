import type { Object3D, Vector3 } from 'three'
import { avatars, sampleAvatar, useSession } from '../../network/worldClient'
import { displayNickname } from '../gameMaster/displayName'
import { OVERHEAD } from '../../park/mapConfig'
import { XRCanvas } from './XRCanvas'

const NICKNAME_HEAD_CLEARANCE = .24
const HIDDEN_PANEL_TTL_MS = 10_000

export class XRNames {
  private readonly names = new Map<string, { panel: XRCanvas; text: string; lastVisibleAt: number }>()
  private readonly pose = { x: 0, y: 0, z: 0, yaw: 0 }

  constructor(private readonly scene: Object3D) {}

  update(now: number, eye: Vector3) {
    const session = useSession.getState()
    const maxDistance = OVERHEAD.maxDistance
    for (const [id, avatar] of avatars.entries()) {
      if (id === session.sessionId || !avatar.connected) continue
      const { x, y, z } = sampleAvatar(avatar, now, this.pose)
      const headHeight = y + 1.05
      const distance = Math.hypot(eye.x - x, eye.y - headHeight, eye.z - z)
      const existing = this.names.get(id)
      if (distance > maxDistance || distance < .25) {
        if (existing) existing.panel.mesh.visible = false
        continue
      }
      const name = existing ?? { panel: new XRCanvas(512, 112, .7, false), text: '', lastVisibleAt: now }
      if (!existing) { this.names.set(id, name); this.scene.add(name.panel.mesh); name.panel.mesh.name = 'park-xr-nickname' }
      const text = displayNickname(session.profiles[id], avatar.nickname || `산책자 ${id.slice(-6)}`)
      if (text !== name.text) {
        name.text = text
        const ctx = name.panel.canvas.getContext('2d')!
        ctx.clearRect(0, 0, 512, 112)
        ctx.fillStyle = 'rgba(18, 38, 25, .92)'; ctx.beginPath(); ctx.roundRect(0, 0, 512, 112, 38); ctx.fill()
        ctx.fillStyle = '#fff8e6'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 56px sans-serif'
        ctx.fillText(text, 256, 58, 470)
        name.panel.texture.needsUpdate = true
      }
      const { mesh } = name.panel
      const scale = Math.max(.85, Math.min(3.2, distance / 5))
      const halfHeight = mesh.geometry.parameters.height * scale / 2
      mesh.position.set(x, headHeight + NICKNAME_HEAD_CLEARANCE + halfHeight, z)
      mesh.lookAt(eye)
      mesh.scale.setScalar(scale)
      mesh.visible = true
      name.lastVisibleAt = now
    }
    this.prune(now, session.sessionId)
  }

  private prune(now: number, selfId: string) {
    for (const [id, name] of this.names) {
      if (avatars.get(id)?.connected && id !== selfId && now - name.lastVisibleAt < HIDDEN_PANEL_TTL_MS) continue
      name.panel.dispose()
      this.names.delete(id)
    }
  }

  hide(now = performance.now()) {
    this.names.forEach(({ panel }) => { panel.mesh.visible = false })
    this.prune(now, useSession.getState().sessionId)
  }
  dispose() { this.names.forEach(({ panel }) => panel.dispose()); this.names.clear() }
}
