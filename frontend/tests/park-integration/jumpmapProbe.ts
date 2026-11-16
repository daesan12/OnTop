import { _roots } from '@react-three/fiber'
import { useJumpmap } from '../../src/features/jumpmap/state'
import { useWalletSettlement } from '../../src/features/wallet/settlementRefresh'
import { useSession } from '../../src/network/worldClient'
import { COURSE } from '../../src/features/jumpmap/course'
import { COURSE as ACTIVE_COURSE } from '../../src/features/jumpmap/activeCourse'
import { jumpArt } from '../../src/layout-preview/jumpGeometry'
import type { InstancedMesh } from 'three'

export function movingPadFrame(block: number) {
  const scene = _roots.get(document.querySelector('canvas')!)?.store.getState().scene
  const pad = ACTIVE_COURSE[block]!
  const index = ACTIVE_COURSE.filter(p => p.theme === pad.theme).indexOf(pad)
  const mesh = scene?.getObjectByName(`service-jump-${pad.theme}`)?.children[0] as InstancedMesh | undefined
  const avatar = scene?.getObjectByName('avatar-' + useSession.getState().sessionId)
  return mesh && avatar ? { padY: mesh.instanceMatrix.array[index * 16 + 13]!, avatarY: avatar.position.y } : null
}

export function jumpmapProbe() {
  const scene = _roots.get(document.querySelector('canvas')!)?.store.getState().scene
  const course = scene?.getObjectByName('service-jump-course')
  let instances = 0, geometryMatches = 0, padsDrawn = 0
  for (const theme of new Set(COURSE.map(p => p.theme))) {
    const group = course?.getObjectByName(`service-jump-${theme}`)
    if (!group) continue
    if (!group.children.some(child => child.visible)) continue
    padsDrawn += (group.children[0] as InstancedMesh)?.count ?? 0
    const expected = Object.values(jumpArt[theme]).map(g => g.uuid)
    group.children.forEach(node => { const m = node as InstancedMesh; if (m.isInstancedMesh) { instances += m.count; if (expected.includes(m.geometry.userData.jumpSource)) geometryMatches++ } })
  }
  return { state: useJumpmap.getState(), wallet: useWalletSettlement.getState(), session: useSession.getState(), instances, geometryMatches, padsDrawn,
    identity: scene?.getObjectByName('park-service-map')?.userData,
    ownPosition: scene?.getObjectByName('avatar-' + useSession.getState().sessionId)?.position.toArray(),
    camera: _roots.get(document.querySelector('canvas')!)?.store.getState().camera.position.toArray() }
}
