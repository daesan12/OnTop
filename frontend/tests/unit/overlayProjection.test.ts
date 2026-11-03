import { expect, it } from 'vitest'
import { Matrix4, PerspectiveCamera, Vector3 } from 'three'
import { OverlayProjection, OverlayView } from '../../src/world/overlayProjection'

it('preserves exact legacy screen coordinates through camera, viewport, bubble, head and clipping changes', () => {
  const camera = new PerspectiveCamera(50, 16 / 9, .1, 100), head = new Matrix4(), view = new OverlayView(), cache = new OverlayProjection()
  camera.position.set(0, 2, 10); camera.lookAt(0, 2, 0)
  let width = 1920, height = 1080, bubbleWidth = 260, bubbleHeight = 40
  for (let frame = 0; frame < 200; frame++) {
    if (frame === 15) head.makeTranslation(1, 0, 0)
    if (frame === 30) camera.position.x = 2
    if (frame === 45) { camera.fov = 70; camera.updateProjectionMatrix() }
    if (frame === 60) { width = 390; height = 844; camera.aspect = width / height; camera.updateProjectionMatrix() }
    if (frame === 75) { bubbleWidth = 330; bubbleHeight = 200 }
    if (frame === 90) head.makeTranslation(0, 0, 50)
    if (frame === 120) head.makeTranslation(0, 2, 0)
    if (frame === 150) { bubbleWidth = 140; bubbleHeight = 40 }
    camera.updateMatrixWorld(); view.update(camera, width, height)
    const offset = frame >= 180 ? .3 : .1
    const p = new Vector3(0, offset, 0).applyMatrix4(head).project(camera)
    const visible = p.z >= -1 && p.z <= 1 && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1
    const actual = cache.project(head, camera, view, bubbleWidth, bubbleHeight, offset)
    expect(actual.visible).toBe(visible)
    if (visible) {
      const x = Math.max(bubbleWidth / 2 + 8, Math.min(width - bubbleWidth / 2 - 8, ((p.x + 1) * width) / 2))
      const y = Math.max(bubbleHeight + 8, ((1 - p.y) * height) / 2)
      expect(actual.x).toBe(x); expect(actual.y).toBe(y)
      expect(actual.transform).toBe(`translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`)
    }
  }
})

it('keeps legacy rounding and clipping exactly at screen edges and decimal ties', () => {
  const camera = new PerspectiveCamera(50, 16 / 9, .1, 100), view = new OverlayView(), cache = new OverlayProjection()
  camera.position.set(2, 3, 10); camera.lookAt(0, 2, 0); camera.updateMatrixWorld(); view.update(camera, 1920, 1080)
  for (const pixel of [400.05, 950.05, 1000.15, 1500.25]) {
    const world = new Vector3(pixel / 960 - 1, 0, 0).unproject(camera), head = new Matrix4().makeTranslation(world)
    const p = new Vector3().applyMatrix4(head).project(camera), x = ((p.x + 1) * 1920) / 2, y = ((1 - p.y) * 1080) / 2
    expect(cache.project(head, camera, view, 10, 10, 0).transform)
      .toBe(`translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`)
  }
  for (const x of [-1, 1, -1.00000000000001, 1.00000000000001]) {
    const world = new Vector3(x, 0, 0).unproject(camera), head = new Matrix4().makeTranslation(world)
    const p = new Vector3().applyMatrix4(head).project(camera)
    expect(cache.project(head, camera, view, 10, 10, 0).visible).toBe(Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && Math.abs(p.z) <= 1)
  }
})
