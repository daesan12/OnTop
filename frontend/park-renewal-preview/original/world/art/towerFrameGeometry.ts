import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { OBSERVATION_TOWER as TOWER, TOWER_DECK_RAIL_SEGMENTS, towerPoint } from '../../../../src/config'
import { beam, type Part, type XYZ } from '../../../../src/world/art/Instances'
import { SIMPLE_MAP } from '../../../../src/world/art/mapRenderProfile'
import { mergeStaticBeams } from '../../../../src/world/art/staticBeams'

function createTowerRails(verticalScale: number, distant: boolean) {
  const rails: Part[] = []
  const segments = distant ? 72 : 360
  const scaled = ([x, y, z]: readonly [number, number, number]): XYZ => [x, y * verticalScale, z]
  for (const radius of [TOWER.inner, TOWER.outer])
    for (let i = 0; i < segments; i++) {
      const limit = radius === TOWER.inner ? 358 / 360 : 1
      if (i / segments >= limit) break
      const a = scaled(towerPoint(i / segments, radius)),
        b = scaled(towerPoint(Math.min((i + 1) / segments, limit), radius))
      for (const h of [0.5, 1.3])
        rails.push(
          beam([a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], 0.065, '#785c3a'),
        )
      if (i % 2 === 0)
        rails.push(beam([...a], [a[0], a[1] + 1.35, a[2]], 0.075, '#65492f'))
    }
  // Follow the deck edge, leaving the final spiral approach open overhead.
  for (const segment of TOWER_DECK_RAIL_SEGMENTS) {
    const [p, q] = segment.map(scaled) as [XYZ, XYZ]
    const y = p[1]
    rails.push(
      beam([p[0], y + 1.3, p[2]], [q[0], y + 1.3, q[2]], 0.07, '#6e5136'),
    )
    rails.push(beam([...p], [p[0], y + 1.3, p[2]], 0.045, '#886744'))
  }
  return mergeStaticBeams([{ parts: rails, sides: distant || SIMPLE_MAP ? 3 : 6 }]).scale(1, 1 / verticalScale, 1)
}

const supports: Part[] = []
// Braces and ring beams share the twelve column bearings (30°, not 45°).
for (let i = 0; i < 12; i++) {
  const a = (i * Math.PI) / 6,
    b = ((i + 1) * Math.PI) / 6
  for (let level = 0; level < 3; level++)
    supports.push(
      beam(
        [
          TOWER.x + Math.cos(a) * 4.8,
          level * 6 + 0.12,
          TOWER.z + Math.sin(a) * 4.8,
        ],
        [
          TOWER.x + Math.cos(b) * 4.8,
          (level + 1) * 6 - 0.12,
          TOWER.z + Math.sin(b) * 4.8,
        ],
        0.11,
        '#816449',
      ),
    )
  for (const y of [-0.12, 5.88, 11.88, 17.88])
    supports.push(
      beam(
        [TOWER.x + Math.cos(a) * 4.8, y, TOWER.z + Math.sin(a) * 4.8],
        [TOWER.x + Math.cos(b) * 4.8, y, TOWER.z + Math.sin(b) * 4.8],
        0.16,
        '#66513b',
      ),
    )
}
// Radial joists reach from the column line to the full width of each ramp turn.
for (let i = 1; i <= 36; i++) {
  const a = towerPoint(i / 36, 4.8),
    b = towerPoint(i / 36, TOWER.outer)
  supports.push(
    beam([a[0], a[1] - 0.24, a[2]], [b[0], b[1] - 0.24, b[2]], 0.16, '#73583c'),
  )
}
for (const radius of [TOWER.inner, TOWER.outer])
  for (let i = 0; i < TOWER.segments; i++) {
    const a = towerPoint(i / TOWER.segments, radius),
      b = towerPoint((i + 1) / TOWER.segments, radius)
    supports.push(
      beam(
        [a[0], a[1] - 0.18, a[2]],
        [b[0], b[1] - 0.18, b[2]],
        0.11,
        '#846444',
      ),
    )
  }
// Thin rail/bracing members cannot meaningfully hide the avatar. Keep their
// combined mesh opaque, so camera fading never hides the entire tower. The
// twelve solid columns still fade individually when they obstruct the player.
export function createTowerFrame(verticalScale: number, detail: 'near' | 'distant' = 'near') {
  const distant = detail === 'distant'
  const towerSupports = mergeStaticBeams([{ parts: supports, sides: distant || SIMPLE_MAP ? 4 : 8 }])
  // Build handrails in world metres before applying the tower transform.
  const rails = createTowerRails(verticalScale, distant)
  const frame = mergeGeometries([rails, towerSupports])!
  rails.dispose()
  towerSupports.dispose()
  return frame
}
