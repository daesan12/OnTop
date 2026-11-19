import { useLayoutEffect, useMemo, useRef } from 'react'
import { CanvasTexture, Euler, Matrix4, Quaternion, SRGBColorSpace, Vector3, type InstancedMesh } from 'three'
import { HORROR, HORROR_MAZE_ARROWS } from './horrorPlan'

// The way through the labyrinth (S15P31B105-450), chalked on the floor by the one who went down first (the note at
// the way in says so): a rough arrow at every turning where you could go wrong, pointing at the right doorway. Chalk,
// so it shows in your torch and hardly at all out of it. One instanced plane, one small drawn texture.

function chalkArrow() {
  const size = 256, canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  let seed = 7
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  g.lineCap = 'round'
  // A few hurried strokes over each other: the shaft, then the two sides of the head (pointing up the texture).
  const stroke = (x0: number, y0: number, x1: number, y1: number) => {
    for (let k = 0; k < 4; k++) {
      g.strokeStyle = `rgba(236,232,220,${.35 + rnd() * .35})`
      g.lineWidth = 9 + rnd() * 7
      g.beginPath()
      g.moveTo(x0 + (rnd() - .5) * 10, y0 + (rnd() - .5) * 10)
      g.quadraticCurveTo((x0 + x1) / 2 + (rnd() - .5) * 14, (y0 + y1) / 2 + (rnd() - .5) * 14, x1 + (rnd() - .5) * 8, y1 + (rnd() - .5) * 8)
      g.stroke()
    }
  }
  stroke(128, 225, 128, 40)
  stroke(128, 34, 58, 112)
  stroke(128, 34, 198, 112)
  // Worn: specks rubbed out of it.
  g.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * .8})`; g.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 3, 1 + rnd() * 3) }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace; texture.anisotropy = 4
  return texture
}

export function MazeArrows() {
  const mesh = useRef<InstancedMesh>(null)
  const texture = useMemo(() => typeof document === 'undefined' ? null : chalkArrow(), [])
  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    const matrix = new Matrix4(), q = new Quaternion(), scale = new Vector3(1.15, 1.15, 1)
    HORROR_MAZE_ARROWS.forEach((a, i) => {
      // Flat on the floor, then turned so the texture's "up" points along (dx, dz).
      q.setFromEuler(new Euler(-Math.PI / 2, Math.atan2(-a.dx, -a.dz), (i % 3 - 1) * .08, 'YXZ'))
      m.setMatrixAt(i, matrix.compose(new Vector3(a.x, HORROR.floor + .025, a.z), q, scale))
    })
    m.instanceMatrix.needsUpdate = true
  }, [])
  if (!texture) return null
  return <instancedMesh ref={mesh} name="horror-maze-arrows" args={[undefined, undefined, HORROR_MAZE_ARROWS.length]} frustumCulled={false} userData={{ keepOpaque: true }}>
    <planeGeometry args={[1, 1]} />
    <meshStandardMaterial map={texture} transparent alphaTest={.12} roughness={1} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
  </instancedMesh>
}
