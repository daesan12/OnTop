// Dev-server test helper only; never imported by production code.
import { _roots } from '@react-three/fiber'
import { Box3, Mesh, Vector3 } from 'three'
import { avatars, useSession } from '../../src/network/worldClient'
import { TABLES } from '../../src/config/world'

function root() { return _roots.get(document.querySelector('canvas')!)!.store }
let release: (() => void) | undefined
export function furnitureView(id = 'table-6') {
  release?.()
  const [x, y, z] = TABLES.find(t => t.id === id)!.position
  const store = root()
  release = store.getState().internal.subscribe({ current: ({ camera }) => {
    camera.position.set(x + 2.2, y + 2.43, z + 2.8)
    camera.lookAt(x, y + 0.66, z)
    camera.updateMatrixWorld()
  } }, 0.5, store)
}
export function releaseFurnitureView() { release?.(); release = undefined }
export function furnitureProbe(id = 'table-6') {
  const { scene, gl } = root().getState()
  const table = scene.getObjectByName(id)
  const furniture = table?.getObjectByName('pavilion-wood-table')
  const meshes: { name: string; count: number }[] = []
  furniture?.traverse(o => { if (o instanceof Mesh) meshes.push({ name: o.name, count: 'count' in o ? Number(o.count) : 1 }) })
  return {
    furnitureCount: (() => { let n = 0; scene.traverse(o => { if (o.name === 'pavilion-wood-table') n++ }); return n })(),
    furniturePosition: furniture?.getWorldPosition(new Vector3()).toArray(), meshes,
    bounds: furniture ? (() => { const b = new Box3().setFromObject(furniture); return { min: b.min.toArray(), max: b.max.toArray() } })() : null,
    legacyTables: (() => { let n = 0; scene.traverse(o => { if (o.name === 'wooden-table-and-chairs') n++ }); return n })(),
    tablePosition: table?.position.toArray(),
    ordinary: TABLES.filter(t => t.pavilionId && t.pavilionId !== 'P0').map(t => ({
      id: t.id, position: scene.getObjectByName(t.id)?.position.toArray(),
      hasFurniture: !!scene.getObjectByName(t.id)?.getObjectByName('pavilion-wood-table'),
    })),
    centralOriginal: !!scene.getObjectByName('table-5')?.getObjectByName('main-octagonal-game-table'),
    centralNewFurniture: !!scene.getObjectByName('table-5')?.getObjectByName('pavilion-wood-table'),
    nonPavilionNewFurniture: TABLES.filter(t => !t.pavilionId).some(t =>
      !!scene.getObjectByName(t.id)?.getObjectByName('pavilion-wood-table')),
    tableBounds: (() => {
      const object = table?.getObjectByName('pavilion-table-body')
      if (!object) return null
      const b = new Box3().setFromObject(object)
      return { min: b.min.toArray(), max: b.max.toArray() }
    })(),
    focused: useSession.getState().focusedAnchorId,
    seated: useSession.getState().tableId,
    seatIndex: useSession.getState().seatIndex,
    own: (() => { const a = avatars.get(useSession.getState().sessionId); return a ? {
      tableId: a.tableId, seatIndex: a.seatIndex, position: { ...a.current },
    } : null })(),
    remote: (() => { const a = avatars.get('102'); return a ? { tableId: a.tableId, seatIndex: a.seatIndex } : null })(),
    calls: gl.info.render.calls,
  }
}
