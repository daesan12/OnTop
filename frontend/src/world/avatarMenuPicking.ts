import type { Intersection, Object3D, Raycaster } from 'three'

type PickEvent = { type: string; button?: number; ctrlKey?: boolean; pointerType?: string } | null | undefined

function intersectVisible(object: Object3D, raycaster: Raycaster, hits: Intersection[]) {
  if (!object.visible) return
  if (object.layers.test(raycaster.layers)) {
    const result: unknown = object.raycast(raycaster, hits)
    if (result === false) return
  }
  for (const child of object.children) intersectVisible(child, raycaster, hits)
}

/** Keep exact posed-mesh picking, but only for the avatar's context-menu gesture. */
export function avatarMenuRaycast(event: () => PickEvent, inputRaycaster: Raycaster): Object3D['raycast'] {
  return function (this: Object3D, raycaster, hits) {
    // Scene queries (including held-card visibility) keep normal Three picking.
    if (raycaster !== inputRaycaster) return
    const current = event()
    // R3F requires the same event object in pointer-down initialHits before it
    // delivers onContextMenu. Keep right press, control-click and touch/pen
    // long-press targets; ordinary mouse presses need no skin intersections.
    if (this.visible && (current?.type === 'contextmenu'
      || current?.type === 'pointerdown' && (current.button === 2 || current.ctrlKey
        || current.pointerType === 'touch' || current.pointerType === 'pen'))) {
      for (const child of this.children) intersectVisible(child, raycaster, hits)
    }
    // Three supports false to stop its default recursive pass. Otherwise it
    // would visit both hidden LODs and visible skins again after this pass.
    return false
  }
}
