import { Mesh, MeshBasicMaterial, Raycaster, Vector3, type BufferGeometry } from 'three'

/** Cast just beside each colour seam: shared edges are allowed, overlapping surface area is not. */
export function fishShopSeamSamples(geometry: BufferGeometry) {
  const material = new MeshBasicMaterial(), mesh = new Mesh(geometry, material), ray = new Raycaster()
  const samples: { seam: number; part: string; offset: number; surfaceColors: number; covered: boolean }[] = []
  const colors = geometry.getAttribute('color')
  for (let seam = 1; seam < 12; seam++) for (const offset of [-.006, -.003, .003, .006]) {
    const x = -4.4 + seam * 8.8 / 12 + offset
    for (const part of ['slope', 'valance']) {
      ray.set(new Vector3(x, part === 'slope' ? 8 : 3.09, part === 'slope' ? 3.52 : 6),
        part === 'slope' ? new Vector3(0, -1, 0) : new Vector3(0, 0, -1))
      const hits = ray.intersectObject(mesh)
      const front = hits.filter(hit => Math.abs(hit.distance - hits[0]!.distance) < .00001)
      const surfaceColors = new Set(front.map(hit => {
        const i = hit.face!.a
        return [colors.getX(i), colors.getY(i), colors.getZ(i)].map(c => c.toFixed(4)).join(',')
      })).size
      samples.push({ seam, part, offset, surfaceColors, covered: !!hits.length })
    }
  }
  material.dispose()
  return samples
}
