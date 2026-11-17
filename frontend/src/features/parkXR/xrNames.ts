import type { Object3D, Vector3 } from 'three'
import { avatars, sampleAvatar, useSession } from '../../network/worldClient'
import { displayNickname } from '../gameMaster/displayName'
import { OVERHEAD } from '../../park/mapConfig'
import { PARK_XR_CROWD_THRESHOLD } from '../../world/xrView'
import { XRCanvas } from './XRCanvas'

const NICKNAME_HEAD_CLEARANCE = .24
const HIDDEN_PANEL_TTL_MS = 10_000
const CROWDED_NAME_LIMIT = 8
const CROWD_REFRESH_MS = 125

export class XRNames {
  private readonly names = new Map<string, { panel: XRCanvas; text: string; lastVisibleAt: number }>()
  private readonly pose = { x: 0, y: 0, z: 0, yaw: 0 }
  private readonly nearby = new Set<string>()
  private nextCrowdRefresh = -Infinity

  constructor(private readonly scene: Object3D) {}

  update(now: number, eye: Vector3) {
    const session = useSession.getState()
    const maxDistance = OVERHEAD.maxDistance
    const crowded = avatars.size >= PARK_XR_CROWD_THRESHOLD
    if (crowded) this.refreshNearby(now, eye, session.sessionId)
    else this.nextCrowdRefresh = -Infinity
    for (const [id, avatar] of avatars.entries()) {
      if (id === session.sessionId || !avatar.connected) continue
      const existing = this.names.get(id)
      if (crowded && !this.nearby.has(id)) {
        if (existing) existing.panel.mesh.visible = false
        continue
      }
      const { x, y, z } = sampleAvatar(avatar, now, this.pose)
      const headHeight = y + 1.05
      const distance = Math.hypot(eye.x - x, eye.y - headHeight, eye.z - z)
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

  private refreshNearby(now: number, eye: Vector3, selfId: string) {
    if (now < this.nextCrowdRefresh) return
    this.nextCrowdRefresh = now + CROWD_REFRESH_MS
    const candidates: { id: string; distance: number }[] = []
    for (const [id, avatar] of avatars) {
      if (!avatar.connected || id === selfId) continue
      const { x, y, z } = avatar.current
      const distance = (eye.x - x) ** 2 + (eye.y - y - 1.05) ** 2 + (eye.z - z) ** 2
      if (distance <= OVERHEAD.maxDistance ** 2 && distance >= .25 ** 2) candidates.push({ id, distance })
    }
    candidates.sort((a, b) => a.distance - b.distance)
    this.nearby.clear()
    for (const { id } of candidates.slice(0, CROWDED_NAME_LIMIT)) this.nearby.add(id)
  }

  private prune(now: number, selfId: string) {
    for (const [id, name] of this.names) {
      if (avatars.get(id)?.connected && id !== selfId && now - name.lastVisibleAt < HIDDEN_PANEL_TTL_MS) continue
      name.panel.dispose()
      this.names.delete(id)
    }
  }

  hide(now = performance.now()) {
    this.nextCrowdRefresh = -Infinity
    this.names.forEach(({ panel }) => { panel.mesh.visible = false })
    this.prune(now, useSession.getState().sessionId)
  }
  dispose() {
    this.names.forEach(({ panel }) => panel.dispose())
    this.names.clear()
    this.nearby.clear()
    this.nextCrowdRefresh = -Infinity
  }
}
