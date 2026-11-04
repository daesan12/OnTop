import { describe, expect, it } from 'vitest'
import { Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { advanceOmokCamera, omokTopDownHeight, omokSpectatorFrame } from '../../src/world/omokCamera'

describe('original omok camera projection and transition', () => {
  it.each([[1280,720],[1366,768],[1920,1080]])('enlarges the playing grid between side rails at %i×%i for either seat', (width, height) => {
    const insets = {top:18,bottom:18,left:320,right:310}
    const frame = omokSpectatorFrame(width,height,1,insets)
    for (const side of [-1,1]) {
      const camera = new PerspectiveCamera(42,width/height)
      camera.up.set(0,0,-side)
      camera.position.set(frame.offsetX*side,frame.height,frame.offsetZ*side)
      camera.lookAt(frame.offsetX*side,0,frame.offsetZ*side);camera.updateMatrixWorld()
      const a = new Vector3(-.8,0,0).project(camera), b = new Vector3(.8,0,0).project(camera)
      const pixels = Math.abs(b.x-a.x)*width/2
      expect(pixels).toBeGreaterThan(height-304)
      for (const x of [-.8,.8]) for (const z of [-.8,.8]) {
        const point = new Vector3(x,0,z).project(camera)
        expect((point.x+1)*width/2).toBeGreaterThan(insets.left)
        expect((point.x+1)*width/2).toBeLessThan(width-insets.right)
        expect((1-point.y)*height/2).toBeGreaterThan(insets.top)
        expect((1-point.y)*height/2).toBeLessThan(height-insets.bottom)
      }
    }
  })
  it.each([[1920, 1080], [1366, 768], [1000, 700], [768, 1024], [390, 844]])('fits the complete spectator frame between HUD bounds at %i×%i', (width, height) => {
    const insets = { top: 110, bottom: 210, left: 20, right: 60 }
    for (const scale of [1, 1.3]) {
      const frame = omokSpectatorFrame(width, height, scale, insets)
      const camera = new PerspectiveCamera(42, width / height)
      camera.position.set(frame.offsetX, frame.height, frame.offsetZ)
      camera.up.set(0, 0, -1); camera.lookAt(frame.offsetX, 0, frame.offsetZ); camera.updateMatrixWorld()
      for (const x of [-.8, .8]) for (const z of [-.8, .8]) {
        const point = new Vector3(x * scale, 0, z * scale).project(camera)
        const screenX = (point.x + 1) * width / 2, screenY = (1 - point.y) * height / 2
        expect(screenX).toBeGreaterThan(insets.left); expect(screenX).toBeLessThan(width - insets.right)
        expect(screenY).toBeGreaterThan(insets.top); expect(screenY).toBeLessThan(height - insets.bottom)
      }
    }
  })
  it.each([[1920, 1080], [1280, 720], [1000, 1400]])('keeps the board inside 80% of the shorter side at %i×%i', (width, height) => {
    const camera = new PerspectiveCamera(42, width / height)
    for (const scale of [1, 1.3]) {
      camera.position.set(0, omokTopDownHeight(camera.aspect, scale), 0)
      camera.quaternion.setFromRotationMatrix(new Matrix4().lookAt(camera.position, new Vector3(), new Vector3(0, 0, -1)))
      camera.updateMatrixWorld()
      const p = new Vector3(.8 * scale, 0, 0).project(camera)
      expect(p.x * width / Math.min(width, height)).toBeCloseTo(.8, 10)
    }
  })

  it('eases position, rotation and zoom without depending on frame rate', () => {
    const destination = new Vector3(2, 4, -3), rotation = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2)
    const low = new PerspectiveCamera(76), high = new PerspectiveCamera(76)
    expect(advanceOmokCamera(low, destination, rotation, 42, 1 / 30)).toBe(false)
    expect(low.fov).toBeGreaterThan(42); expect(low.fov).toBeLessThan(76)
    expect(low.quaternion.angleTo(rotation)).toBeGreaterThan(.001)
    for (let i = 1; i < 15; i++) advanceOmokCamera(low, destination, rotation, 42, 1 / 30)
    for (let i = 0; i < 60; i++) advanceOmokCamera(high, destination, rotation, 42, 1 / 120)
    expect(low.position.distanceTo(high.position)).toBeLessThan(1e-10)
    expect(low.quaternion.angleTo(high.quaternion)).toBeLessThan(1e-6)
    expect(low.fov).toBeCloseTo(high.fov, 10)
    let settled = false
    for (let i = 0; i < 300 && !settled; i++) settled = advanceOmokCamera(low, destination, rotation, 42, 1 / 60)
    expect(settled).toBe(true)
    expect(low.position.equals(destination)).toBe(true)
    expect(low.quaternion.equals(rotation)).toBe(true)
  })

  it('blocks readiness when position is settled but rotation or zoom is still changing', () => {
    const position = new Vector3(), rotation = new Quaternion()
    const camera = new PerspectiveCamera(76)
    camera.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI)
    expect(advanceOmokCamera(camera, position, rotation, 42, 1 / 60)).toBe(false)
    camera.quaternion.copy(rotation)
    expect(advanceOmokCamera(camera, position, rotation, 42, 1 / 60)).toBe(false)
  })
})
