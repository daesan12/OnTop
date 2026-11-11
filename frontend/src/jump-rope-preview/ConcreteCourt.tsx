import { useEffect, useMemo, type RefObject } from 'react'
import { MathUtils, PlaneGeometry, SRGBColorSpace } from 'three'
import { AlleyManhole, manholeFootprint } from './AlleyManhole'
import type { DistractionPose } from './pigeonDistractionMotion'

const streetHeight = -0.17
const textureBounds = { left: -13, top: -9, width: 26, depth: 17 }
type GroundPoint = readonly [x: number, z: number]

// Keep the actors and rope at y=0, then grade down to the old curbs and poles.
export function courtSurfaceHeight(x: number, z: number) {
  const alongStreet = 1 - MathUtils.smoothstep(Math.abs(x), 3.8, 6.9)
  const towardCamera = 1 - MathUtils.smoothstep(z, 2.7, 6.2)
  const towardWall = MathUtils.smoothstep(z, -3.44, -2.44)
  return MathUtils.lerp(streetHeight, 0, alongStreet * towardCamera * towardWall)
}

function makeGroundGeometry() {
  // Keep a tight grid around the grade and stretch just the outermost quads.
  const geometry = new PlaneGeometry(16, 16, 64, 64)
  geometry.rotateX(-Math.PI / 2)
  const positions = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < positions.count; i++) {
    const localX = positions.getX(i)
    const localZ = positions.getZ(i)
    const x = Math.abs(localX) === 8 ? Math.sign(localX) * 37.5 : localX
    const z = Math.abs(localZ) === 8 ? Math.sign(localZ) * 37.5 : localZ
    positions.setXYZ(i, x, courtSurfaceHeight(x, z), z)
    uv.setXY(i, (x - textureBounds.left) / textureBounds.width, 1 - (z - textureBounds.top) / textureBounds.depth)
  }
  geometry.computeVertexNormals()
  return geometry
}

function paintConcrete() {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 768
  const ctx = canvas.getContext('2d')!
  const px = (x: number) => canvas.width * (x - textureBounds.left) / textureBounds.width
  const pz = (z: number) => canvas.height * (z - textureBounds.top) / textureBounds.depth

  ctx.fillStyle = '#bcb7aa'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  function stain(x: number, y: number, radius: number, tint: string) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, tint)
    gradient.addColorStop(1, 'transparent')
    ctx.fillStyle = gradient
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  }

  let seed = 389
  function sample() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }

  for (let i = 0; i < 190; i++) {
    const tint = i % 3 === 0 ? '#756d6014' : '#f2e9d317'
    const radius = 8 + sample() * 60
    stain(radius + sample() * (canvas.width - 2 * radius), radius + sample() * (canvas.height - 2 * radius), radius, tint)
  }
  for (let i = 0; i < 4700; i++) {
    ctx.fillStyle = i % 2 ? '#605c4e13' : '#fff5e71e'
    ctx.fillRect(2 + sample() * (canvas.width - 5), 2 + sample() * (canvas.height - 5), 1 + sample(), 1)
  }

  // Small damp patches collect in front of the foundations and fade into the lane.
  for (const [x, z, radius] of [
    [-8.7, -4.79, 19], [-6.62, -4.72, 14], [-5.73, -4.78, 20], [-4.91, -4.81, 15],
    [-3.15, -4.77, 16], [-2.17, -4.69, 21], [0.51, -4.74, 17], [2.36, -4.8, 18], [3.74, -4.78, 15],
  ]) {
    stain(px(x), pz(z), radius, '#716a4d4a')
  }
  stain(px(-2.54), pz(1.94), 53, '#ece2cb22')
  stain(px(-1.82), pz(1.93), 33, '#9c8c7130')
  stain(px(2.05), pz(1.55), 48, '#8178652b')
  stain(px(0.34), pz(-1.29), 51, '#eee3d326')

  function stroke(points: readonly GroundPoint[], tint: string, width: number) {
    ctx.beginPath()
    points.forEach(([x, z], i) => {
      if (i === 0) ctx.moveTo(px(x), pz(z))
      else ctx.lineTo(px(x), pz(z))
    })
    ctx.strokeStyle = tint
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
  }

  // Broken fissures cross the old edge, without a seam across the rope's path.
  stroke([[-3.12, 1.19], [-2.96, 1.21], [-2.83, 1.38], [-2.64, 1.37], [-2.47, 1.51], [-2.28, 1.54]], '#776e5b82', 1.35)
  stroke([[-2.83, 1.38], [-2.86, 1.57], [-2.75, 1.72]], '#776e5b65', 0.9)
  stroke([[2.95, 1.43], [2.73, 1.38], [2.63, 1.51], [2.44, 1.55], [2.31, 1.5], [2.19, 1.64]], '#776e5b79', 1.3)
  stroke([[2.44, 1.55], [2.42, 1.69], [2.32, 1.78]], '#776e5b61', 0.9)
  stroke([[3.34, -2.78], [3.18, -2.72], [3.05, -2.49], [2.92, -2.43], [2.84, -2.27]], '#776e5b68', 1)

  // A few scuffed chalk fragments sit off-center, with nothing drawn underfoot.
  stroke([[-1.53, 1.38], [-1.46, 1.28], [-1.31, 1.23]], '#f2ead582', 1.45)
  stroke([[-1.27, 1.24], [-1.18, 1.27]], '#f2ead554', 1.1)
  stroke([[1.14, 1.57], [1.26, 1.61], [1.41, 1.59]], '#f2ead563', 1.35)
  stroke([[1.47, 1.58], [1.57, 1.53]], '#f2ead545', 1.05)

  const { x, z, openingRadius } = manholeFootprint
  stain(px(x), pz(z), 25, '#7a6c4f32')
  // Cut the surface material inside the fixed collar so lifting the lid reveals the shaft.
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = '#000'
  ctx.beginPath()
  ctx.ellipse(px(x), pz(z), px(openingRadius) - px(0), pz(openingRadius) - pz(0), 0, 0, 2 * Math.PI)
  ctx.fill()
  ctx.restore()

  return canvas
}

export function ConcreteCourt({ distractionPose }: { distractionPose: RefObject<DistractionPose | null> }) {
  const concrete = useMemo(paintConcrete, [])
  const geometry = useMemo(makeGroundGeometry, [])
  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <>
      <mesh name="park-concrete-court" geometry={geometry}>
        <meshStandardMaterial roughness={1} alphaTest={0.5}>
          <canvasTexture attach="map" args={[concrete]} colorSpace={SRGBColorSpace} anisotropy={4} />
        </meshStandardMaterial>
      </mesh>
      <AlleyManhole surfaceY={courtSurfaceHeight(manholeFootprint.x, manholeFootprint.z)} distractionPose={distractionPose} />
    </>
  )
}
