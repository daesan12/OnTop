import { expect, it, vi } from 'vitest'
import { Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
vi.mock('../../src/world/art/mapRenderProfile', () => ({ SIMPLE_MAP: true }))
import { createPavilionBench } from '../../src/world/art/pavilionInteriorGeometry'
import { pavilionLanternLayout } from '../../src/world/art/pavilionLanternLayout'
import { pavilionCeilingBottom, PAVILION_CANOPY } from '../../src/world/art/pavilionCanopy'
import { pavilionBenchRadius, PAVILION_CLOSED_SIDES } from '../../src/config/parkPlan'
import { PARK_LAYOUT } from '../../src/map/park'

it('closes the missing wedges in the seat and back at every adjoining pavilion bay', () => {
  const material = new MeshBasicMaterial(), ray = new Raycaster()
  for (const scale of [1.2, 2.05]) {
    const radius = pavilionBenchRadius(scale), geometry = createPavilionBench(scale), group = new Group()
    for (const side of PAVILION_CLOSED_SIDES) {
      const a = (side + 1) * Math.PI / 4, mesh = new Mesh(geometry, material)
      mesh.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius)
      mesh.rotation.y = -Math.PI / 2 - a
      group.add(mesh)
    }
    group.updateMatrixWorld(true)
    for (const side of PAVILION_CLOSED_SIDES) {
      if (!(PAVILION_CLOSED_SIDES as readonly number[]).includes((side + 1) % 8)) continue
      const angle = (side + 1.5) * Math.PI / 4
      for (const offset of [.2, .46]) for (const along of [-.04, -.02, .02, .04]) {
        const r = (radius + offset) / Math.cos(Math.PI / 8)
        ray.set(new Vector3(Math.cos(angle) * r - Math.sin(angle) * along, 1.5,
          Math.sin(angle) * r + Math.cos(angle) * along), new Vector3(0, -1, 0))
        const hits = ray.intersectObjects(group.children)
        expect(hits.length, `scale=${scale}, bay=${side}, radial=${offset}, along=${along}`).toBeGreaterThan(0)
        expect(hits[0]!.point.y).toBeCloseTo(offset === .2 ? .56 : 1.228, 5)
      }
    }
    geometry.dispose()
  }
  material.dispose()
})

it('suspends all 13 complete lanterns below the ceiling, inside its edges and clear of pillars', () => {
  const pavilions = PARK_LAYOUT.DRAFT_PAVILIONS, layout = pavilionLanternLayout(pavilions)
  expect(layout.placements).toHaveLength(13)
  layout.placements.forEach((lamp, i) => {
    const p = i < pavilions.length ? pavilions[i]! : pavilions.find(p => p.id === 'P0')!
    const chain = layout.simpleChains[i]!, cap = layout.chainCaps[i]!
    const ceiling = p.floor + pavilionCeilingBottom * p.scale
    expect(ceiling - (lamp.p[1] + .968 * lamp.s[1])).toBeGreaterThan(.3)
    const chainBottom = chain.p[1] - chain.s[1] / 2
    // The .84-.91 finial must enclose the stem; the eye's centre is empty.
    expect(chainBottom).toBeGreaterThan(lamp.p[1] + .84 * lamp.s[1])
    expect(lamp.p[1] + .91 * lamp.s[1] - chainBottom).toBeGreaterThan(.01 * lamp.s[1])
    expect(chain.p[1] + chain.s[1] / 2).toBeCloseTo(ceiling, 8)
    expect(cap.p[1]).toBeCloseTo(ceiling, 8)
    const radius = Math.hypot(lamp.p[0] - p.x, lamp.p[2] - p.z)
    expect(radius + .4 * lamp.s[0]).toBeLessThan(PAVILION_CANOPY.ceilingRadius * Math.cos(Math.PI / 8) * p.scale)
    for (let side = 0; side < 8; side++) {
      const angle = Math.PI / 8 + side * Math.PI / 4
      const distance = Math.hypot(lamp.p[0] - p.x - Math.cos(angle) * 3.65 * p.scale,
        lamp.p[2] - p.z - Math.sin(angle) * 3.65 * p.scale)
      expect(distance - .11 * p.scale - .4 * lamp.s[0]).toBeGreaterThan(.3)
    }
  })
})
