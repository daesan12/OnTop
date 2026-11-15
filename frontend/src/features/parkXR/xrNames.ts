import type { Object3D, Vector3 } from 'three'
import { avatars, sampleAvatar, useSession } from '../../network/worldClient'
import { displayNickname } from '../gameMaster/displayName'
import { OVERHEAD } from '../../park/mapConfig'
import { XRCanvas } from './XRCanvas'

export class XRNames {
  private readonly names = new Map<string, { panel: XRCanvas; text: string }>()
  private readonly pose = { x: 0, y: 0, z: 0, yaw: 0 }

  constructor(private readonly scene: Object3D) {}

  update(now: number, eye: Vector3) {
    const session = useSession.getState()
    const maxDistance = OVERHEAD.maxDistance
    for (const [id, avatar] of avatars.entries()) {
      if (id === session.sessionId || !avatar.connected) continue
      const { x, y, z } = sampleAvatar(avatar, now, this.pose)
      const height = y + 1.05
      const distance = Math.hypot(eye.x - x, eye.y - height, eye.z - z)
      const existing = this.names.get(id)
      if (distance > maxDistance || distance < .25) {
        if (existing) existing.panel.mesh.visible = false
        continue
      }
      const name = existing ?? { panel: new XRCanvas(512, 112, .7, false), text: '' }
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
      mesh.position.set(x, height, z); mesh.lookAt(eye)
      mesh.scale.setScalar(Math.max(.85, Math.min(3.2, distance / 5)))
      mesh.visible = true
    }
    for (const [id, name] of this.names) {
      if (avatars.get(id)?.connected && id !== session.sessionId) continue
      name.panel.dispose(); this.names.delete(id)
    }
  }

  hide() { this.names.forEach(({ panel }) => { panel.mesh.visible = false }) }
  dispose() { this.names.forEach(({ panel }) => panel.dispose()); this.names.clear() }
}
