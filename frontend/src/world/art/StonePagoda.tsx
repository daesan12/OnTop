import { SIMPLE_MAP } from './mapRenderProfile'
import {
  BufferGeometry,
  Float32BufferAttribute,
  BoxGeometry,
  IcosahedronGeometry,
} from 'three'
import { PAGODA_TIERS, GARDEN_PAGODA, PAGODA_ANCHORS } from '../../config'
import { type Part, type XYZ } from './Instances'
import { PagodaRefinements } from './LandmarkRefinements'
import { SurfaceMaterial } from './SurfaceMaterial'
import { mergeSurfaceParts, raycastStaticSurface } from './staticSurface'

const roofGeometry = SIMPLE_MAP ? previewRoofGeometry : defaultRoofGeometry
const createPagoda = SIMPLE_MAP ? previewCreatePagoda : defaultCreatePagoda

const crossOutline = [
  [-0.55, -1],
  [0.55, -1],
  [0.55, -0.55],
  [1, -0.55],
  [1, 0.55],
  [0.55, 0.55],
  [0.55, 1],
  [-0.55, 1],
  [-0.55, 0.55],
  [-1, 0.55],
  [-1, -0.55],
  [-0.55, -0.55],
]
const squareOutline = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
]

/** Closed stone roof with curved slopes, thick eaves and lifted corners. */
function previewRoofGeometry(cross: boolean) {
  const outline = cross ? crossOutline : squareOutline
  const rings = [
    [0.59, 1],
    [0.72, 0.52],
    [0.88, 0.2],
    [1, 0.12],
  ]
  const vertices: number[] = [],
    uv: number[] = []
  const triangle = (a: XYZ, b: XYZ, c: XYZ) => {
    vertices.push(...a, ...c, ...b)
    for (const p of [a, c, b]) uv.push(p[0] + 0.5, p[2] + 0.5)
  }
  const point = (
    edge: number,
    u: number,
    ring: number,
    bottom = false,
  ): XYZ => {
    const a = outline[edge]!,
      b = outline[(edge + 1) % outline.length]!
    const [radius, height] = rings[ring]!
    return [
      ((a[0]! * (1 - u) + b[0]! * u) * radius!) / 2,
      height! +
        0.25 * Math.abs(u * 2 - 1) ** 3 * (ring / 3) ** 3 -
        (bottom ? 0.18 : 0),
      ((a[1]! * (1 - u) + b[1]! * u) * radius!) / 2,
    ]
  }
  for (let edge = 0; edge < outline.length; edge++) {
    for (let segment = 0; segment < (SIMPLE_MAP ? 1 : 4); segment++) {
      const u = segment / (SIMPLE_MAP ? 1 : 4),
        v = (segment + 1) / (SIMPLE_MAP ? 1 : 4)
      for (let ring = 0; ring < 3; ring++) {
        const a = point(edge, u, ring),
          b = point(edge, v, ring)
        const c = point(edge, u, ring + 1),
          d = point(edge, v, ring + 1)
        triangle(a, c, b)
        triangle(b, c, d)
      }
      const a = point(edge, u, 3),
        b = point(edge, v, 3)
      const c = point(edge, u, 3, true),
        d = point(edge, v, 3, true)
      triangle(a, c, b)
      triangle(b, c, d)
      triangle([0, 0, 0], d, c)
      triangle([0, 1, 0], point(edge, u, 0), point(edge, v, 0))
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  geometry.computeVertexNormals()
  return geometry
}

const crossRoof = roofGeometry(true),
  squareRoof = roofGeometry(false)

function previewCreatePagoda() {
  const masonry: Part[] = [],
    details: Part[] = [],
    relief: Part[] = []
  const lowerRoofs: Part[] = [],
    upperRoofs: Part[] = []
  const block = (p: XYZ, s: XYZ, c = '#b9b5a3', r?: XYZ) =>
    masonry.push({ p, s, c, r })
  // Broad moulded stone plinth; lower dark bands give depth even on Low.
  for (const [y, height, width, color] of [
    [0.12, 0.24, 7.4, '#989b8d'],
    [0.42, 0.36, 5.65, '#b2b09e'],
    [0.68, 0.16, 6.0, '#c5c2af'],
    [1.05, 0.58, 5.2, '#afac99'],
    [1.4, 0.12, 5.55, '#d0cab5'],
    [1.63, 0.34, 4.95, '#bcb7a2'],
    [1.86, 0.12, 5.3, '#d0cab5'],
    [2.18, 0.52, 4.45, '#b5b09c'],
    [2.51, 0.18, 4.85, '#c9c2ad'],
  ] as const)
    block([0, y, 0], [width * 1.15, height, width * 1.15], color)

  // Bas-relief panels, with a shallow inset and a small raised floral motif.
  const panel = (
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    yaw: number,
  ) => {
    if (SIMPLE_MAP) return
    const transform = (dx: number, dy: number, dz: number): XYZ => [
      x + dx * Math.cos(yaw) + dz * Math.sin(yaw),
      y + dy,
      z - dx * Math.sin(yaw) + dz * Math.cos(yaw),
    ]
    const part = (
      dx: number,
      dy: number,
      dz: number,
      sx: number,
      sy: number,
      sz: number,
      c: string,
    ) =>
      details.push({
        p: transform(dx, dy, dz),
        s: [sx, sy, sz],
        r: [0, yaw, 0],
        c,
      })
    part(0, 0, 0, width, height, 0.035, '#888b7d')
    part(0, 0, 0.022, width * 0.82, height * 0.83, 0.03, '#a9a592')
    for (const side of [-1, 1]) {
      part(side * width * 0.46, 0, 0.052, width * 0.09, height, 0.08, '#c6c0ad')
      part(
        0,
        side * height * 0.46,
        0.052,
        width,
        height * 0.09,
        0.08,
        '#c6c0ad',
      )
    }
    for (let petal = 0; petal < 6; petal++) {
      const a = (petal * Math.PI) / 3
      relief.push({
        p: transform(
          Math.cos(a) * width * 0.16,
          Math.sin(a) * height * 0.21,
          0.065,
        ),
        s: [width * 0.1, height * 0.13, 0.045],
        r: [0, yaw, -a],
        c: '#c0bba7',
      })
    }
    relief.push({
      p: transform(0, 0, 0.09),
      s: [width * 0.1, height * 0.12, 0.07],
      c: '#cdc7b2',
    })
  }

  for (let face = 0; face < 4; face++) {
    const yaw = (face * Math.PI) / 2
    for (let i = -2; i <= 2; i++) {
      const along = i * 0.96
      panel(
        Math.cos(yaw) * along + Math.sin(yaw) * 3.01,
        1.05,
        -Math.sin(yaw) * along + Math.cos(yaw) * 3.01,
        0.78,
        0.4,
        yaw,
      )
    }
    // Low perimeter balustrade leaves the wider outer plaza available for walking.
    for (let i = -3; i <= 3; i++) {
      const along = i * 1.45
      block(
        [
          Math.cos(yaw) * along + Math.sin(yaw) * 4.4,
          0.7,
          -Math.sin(yaw) * along + Math.cos(yaw) * 4.4,
        ],
        [0.2, 1.05, 0.2],
        '#aaa997',
      )
      block(
        [
          Math.cos(yaw) * along + Math.sin(yaw) * 4.4,
          1.24,
          -Math.sin(yaw) * along + Math.cos(yaw) * 4.4,
        ],
        [0.29, 0.12, 0.29],
        '#cdc7b3',
      )
    }
    block(
      [Math.sin(yaw) * 4.4, 1.04, Math.cos(yaw) * 4.4],
      [8.8, 0.16, 0.18],
      '#c3bda9',
      [0, yaw, 0],
    )
    block(
      [Math.sin(yaw) * 4.4, 0.4, Math.cos(yaw) * 4.4],
      [8.8, 0.14, 0.2],
      '#b4b09e',
      [0, yaw, 0],
    )
  }

  for (const [index, tier] of PAGODA_TIERS.entries()) {
    const { width, y, bodyHeight, roofHeight, cross } = tier
    const body = width * 0.69
    const bodyColor = index % 2 ? '#bdb7a2' : '#c5beaa'
    if (cross) {
      block(
        [0, y + bodyHeight / 2, 0],
        [body, bodyHeight, body * 0.55],
        bodyColor,
      )
      block(
        [0, y + bodyHeight / 2, 0],
        [body * 0.55, bodyHeight, body],
        bodyColor,
      )
    } else
      block([0, y + bodyHeight / 2, 0], [body, bodyHeight, body], bodyColor)
    // Foot and head mouldings tie each solid story into the roof above it.
    block([0, y + 0.075, 0], [body * 1.05, 0.15, body * 1.05], '#a9a58f')
    block(
      [0, y + bodyHeight - 0.07, 0],
      [body * 1.04, 0.14, body * 1.04],
      '#d0c8b2',
    )
    for (let face = 0; face < 4; face++) {
      const yaw = (face * Math.PI) / 2
      const facadeWidth = cross ? body * 0.55 : body
      const count = cross ? 2 : 3
      for (let i = 0; i < count; i++) {
        const along = ((i - (count - 1) / 2) * facadeWidth) / count
        panel(
          Math.cos(yaw) * along + Math.sin(yaw) * (body / 2 + 0.012),
          y + bodyHeight * 0.51,
          -Math.sin(yaw) * along + Math.cos(yaw) * (body / 2 + 0.012),
          (facadeWidth / count) * 0.77,
          bodyHeight * 0.67,
          yaw,
        )
      }
      // Small stone brackets under each eave, part of the same instance batch.
      for (let i = -2; i <= 2; i++) {
        const along = i * facadeWidth * 0.2
        details.push({
          p: [
            Math.cos(yaw) * along + Math.sin(yaw) * body * 0.46,
            y + bodyHeight - 0.03,
            -Math.sin(yaw) * along + Math.cos(yaw) * body * 0.46,
          ],
          s: [width * 0.055, 0.16, width * 0.2],
          r: [0, yaw, 0],
          c: '#a5a38f',
        })
      }
    }
    ;(cross ? lowerRoofs : upperRoofs).push({
      p: [0, y + bodyHeight, 0],
      s: [width, roofHeight, width],
      c: '#bbb9a4',
    })
    block(
      [0, y + bodyHeight + roofHeight + 0.055, 0],
      [width * 0.6, 0.14, width * 0.6],
      '#c3bca6',
    )
  }
  // Compact layered finial seals the tenth roof instead of a large cone cap.
  block([0, 19.2, 0], [0.8, 0.3, 0.8], '#b6b09b')
  block([0, 19.41, 0], [0.65, 0.12, 0.65], '#d1c7ae')
  relief.push({ p: [0, 19.65, 0], s: [0.25, 0.35, 0.25], c: '#c4baa1' })
  return { masonry, details, relief, lowerRoofs, upperRoofs }
}
const art = createPagoda()
const detailGeometry = new BoxGeometry()
const reliefGeometry = new IcosahedronGeometry(1, 0)
const masonryGeometry = new BoxGeometry()
const stoneAssets = new Map<number, BufferGeometry>()
function stoneAsset(scale: number) {
  let geometry = stoneAssets.get(scale)
  if (!geometry) {
    geometry = mergeSurfaceParts(
      [
        {
          geometry: masonryGeometry,
          parts: art.masonry,
          mapping: 'box',
          meters: 1.4,
          strength: 0.55,
        },
        {
          geometry: detailGeometry,
          parts: art.details,
          mapping: 'box',
          meters: 1,
          strength: 0.35,
        },
        { geometry: reliefGeometry, parts: art.relief, strength: 0.4 },
        { geometry: crossRoof, parts: art.lowerRoofs, strength: 0.55 },
        { geometry: squareRoof, parts: art.upperRoofs, strength: 0.55 },
      ],
      [
        scale * GARDEN_PAGODA.widthScale,
        scale,
        scale * GARDEN_PAGODA.widthScale,
      ],
      `pagoda-stone-${scale}`,
    )
    stoneAssets.set(scale, geometry)
  }
  return geometry
}

/** Build tooling captures exact stone surfaces and their raycast ranges. */
export function prebuildStaticSurfaces() {
  for (const scale of new Set(PAGODA_ANCHORS.map(anchor => anchor.scale))) stoneAsset(scale)
}

/** Standalone scenes own this copy; disposing it never affects the park asset. */
export function cloneStonePagodaGeometry() {
  return stoneAsset(1).clone()
}

export function StonePagoda({
  anchor, decorations = true,
}: {
  decorations?: boolean
  anchor: { id: string; x: number; z: number; scale: number }
}) {
  return (
    <group
      name={
        anchor.id === 'garden-pagoda'
          ? 'garden-stone-pagoda'
          : 'vr-stone-pagoda'
      }
      position={[anchor.x, 0, anchor.z]}
      scale={[
        anchor.scale * GARDEN_PAGODA.widthScale,
        anchor.scale,
        anchor.scale * GARDEN_PAGODA.widthScale,
      ]}
      userData={{
        assetId: 'placeholder/stone-pagoda',
        height: 20 * anchor.scale,
      }}
    >
      {decorations && anchor.id === 'garden-pagoda' && <PagodaRefinements />}
      <mesh
        name="pagoda-stone-asset"
        geometry={stoneAsset(anchor.scale)}
        raycast={raycastStaticSurface}
        dispose={null}
        castShadow
        receiveShadow
      >
        <SurfaceMaterial kind="stone" baked vertexColors side={2} />
      </mesh>
    </group>
  )
}

// Keep the current service-map optimization independently from the accepted preview.
function defaultRoofGeometry(cross: boolean) {
  const outline = cross ? crossOutline : squareOutline
  const rings = [
    [0.59, 1],
    [0.72, 0.52],
    [0.88, 0.2],
    [1, 0.12],
  ]
  const vertices: number[] = [],
    uv: number[] = []
  const triangle = (a: XYZ, b: XYZ, c: XYZ) => {
    vertices.push(...a, ...c, ...b)
    for (const p of [a, c, b]) uv.push(p[0] + 0.5, p[2] + 0.5)
  }
  const point = (
    edge: number,
    u: number,
    ring: number,
    bottom = false,
  ): XYZ => {
    const a = outline[edge]!,
      b = outline[(edge + 1) % outline.length]!
    const [radius, height] = rings[ring]!
    return [
      ((a[0]! * (1 - u) + b[0]! * u) * radius!) / 2,
      height! +
        0.25 * Math.abs(u * 2 - 1) ** 3 * (ring / 3) ** 3 -
        (bottom ? 0.18 : 0),
      ((a[1]! * (1 - u) + b[1]! * u) * radius!) / 2,
    ]
  }
  for (let edge = 0; edge < outline.length; edge++) {
    const u = 0, v = 1
    for (let ring = 0; ring < 3; ring++) {
      const a = point(edge, u, ring),
        b = point(edge, v, ring)
      const c = point(edge, u, ring + 1),
        d = point(edge, v, ring + 1)
      triangle(a, c, b)
      triangle(b, c, d)
    }
    const a = point(edge, u, 3),
      b = point(edge, v, 3)
    const c = point(edge, u, 3, true),
      d = point(edge, v, 3, true)
    triangle(a, c, b)
    triangle(b, c, d)
    triangle([0, 0, 0], d, c)
    triangle([0, 1, 0], point(edge, u, 0), point(edge, v, 0))
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  geometry.computeVertexNormals()
  return geometry
}
function defaultCreatePagoda() {
  const masonry: Part[] = [],
    details: Part[] = [],
    relief: Part[] = []
  const lowerRoofs: Part[] = [],
    upperRoofs: Part[] = []
  const block = (p: XYZ, s: XYZ, c = '#b9b5a3', r?: XYZ) =>
    masonry.push({ p, s, c, r })
  // Broad moulded stone plinth; lower dark bands give depth even on Low.
  for (const [y, height, width, color] of [
    [0.12, 0.24, 7.4, '#989b8d'],
    [0.42, 0.36, 5.65, '#b2b09e'],
    [0.68, 0.16, 6.0, '#c5c2af'],
    [1.05, 0.58, 5.2, '#afac99'],
    [1.4, 0.12, 5.55, '#d0cab5'],
    [1.63, 0.34, 4.95, '#bcb7a2'],
    [1.86, 0.12, 5.3, '#d0cab5'],
    [2.18, 0.52, 4.45, '#b5b09c'],
    [2.51, 0.18, 4.85, '#c9c2ad'],
  ] as const)
    block([0, y, 0], [width * 1.15, height, width * 1.15], color)

  // A single coloured inset replaces each carved panel and its petal meshes.
  const panel = (x: number, y: number, z: number, width: number, height: number, yaw: number) => {
    details.push({ p: [x, y, z], s: [width, height, 0.035], r: [0, yaw, 0], c: '#989c89' })
  }
  for (let face = 0; face < 4; face++) {
    const yaw = (face * Math.PI) / 2
    for (let i = -2; i <= 2; i++) {
      const along = i * 0.96
      panel(
        Math.cos(yaw) * along + Math.sin(yaw) * 3.01,
        1.05,
        -Math.sin(yaw) * along + Math.cos(yaw) * 3.01,
        0.78,
        0.4,
        yaw,
      )
    }
    // Low perimeter balustrade leaves the wider outer plaza available for walking.
    for (let i = -3; i <= 3; i++) {
      const along = i * 1.45
      block(
        [
          Math.cos(yaw) * along + Math.sin(yaw) * 4.4,
          0.7,
          -Math.sin(yaw) * along + Math.cos(yaw) * 4.4,
        ],
        [0.2, 1.05, 0.2],
        '#aaa997',
      )
      block(
        [
          Math.cos(yaw) * along + Math.sin(yaw) * 4.4,
          1.24,
          -Math.sin(yaw) * along + Math.cos(yaw) * 4.4,
        ],
        [0.29, 0.12, 0.29],
        '#cdc7b3',
      )
    }
    block(
      [Math.sin(yaw) * 4.4, 1.04, Math.cos(yaw) * 4.4],
      [8.8, 0.16, 0.18],
      '#c3bda9',
      [0, yaw, 0],
    )
    block(
      [Math.sin(yaw) * 4.4, 0.4, Math.cos(yaw) * 4.4],
      [8.8, 0.14, 0.2],
      '#b4b09e',
      [0, yaw, 0],
    )
  }

  for (const [index, tier] of PAGODA_TIERS.entries()) {
    const { width, y, bodyHeight, roofHeight, cross } = tier
    const body = width * 0.69
    const bodyColor = index % 2 ? '#bdb7a2' : '#c5beaa'
    if (cross) {
      block(
        [0, y + bodyHeight / 2, 0],
        [body, bodyHeight, body * 0.55],
        bodyColor,
      )
      block(
        [0, y + bodyHeight / 2, 0],
        [body * 0.55, bodyHeight, body],
        bodyColor,
      )
    } else
      block([0, y + bodyHeight / 2, 0], [body, bodyHeight, body], bodyColor)
    // Foot and head mouldings tie each solid story into the roof above it.
    block([0, y + 0.075, 0], [body * 1.05, 0.15, body * 1.05], '#a9a58f')
    block(
      [0, y + bodyHeight - 0.07, 0],
      [body * 1.04, 0.14, body * 1.04],
      '#d0c8b2',
    )
    for (let face = 0; face < 4; face++) {
      const yaw = (face * Math.PI) / 2
      const facadeWidth = cross ? body * 0.55 : body
      const count = cross ? 2 : 3
      for (let i = 0; i < count; i++) {
        const along = ((i - (count - 1) / 2) * facadeWidth) / count
        panel(
          Math.cos(yaw) * along + Math.sin(yaw) * (body / 2 + 0.012),
          y + bodyHeight * 0.51,
          -Math.sin(yaw) * along + Math.cos(yaw) * (body / 2 + 0.012),
          (facadeWidth / count) * 0.77,
          bodyHeight * 0.67,
          yaw,
        )
      }
      // Small stone brackets under each eave, part of the same instance batch.
      for (let i = -2; i <= 2; i++) {
        const along = i * facadeWidth * 0.2
        details.push({
          p: [
            Math.cos(yaw) * along + Math.sin(yaw) * body * 0.46,
            y + bodyHeight - 0.03,
            -Math.sin(yaw) * along + Math.cos(yaw) * body * 0.46,
          ],
          s: [width * 0.055, 0.16, width * 0.2],
          r: [0, yaw, 0],
          c: '#a5a38f',
        })
      }
    }
    ;(cross ? lowerRoofs : upperRoofs).push({
      p: [0, y + bodyHeight, 0],
      s: [width, roofHeight, width],
      c: '#bbb9a4',
    })
    block(
      [0, y + bodyHeight + roofHeight + 0.055, 0],
      [width * 0.6, 0.14, width * 0.6],
      '#c3bca6',
    )
  }
  // Compact layered finial seals the tenth roof instead of a large cone cap.
  block([0, 19.2, 0], [0.8, 0.3, 0.8], '#b6b09b')
  block([0, 19.41, 0], [0.65, 0.12, 0.65], '#d1c7ae')
  relief.push({ p: [0, 19.65, 0], s: [0.25, 0.35, 0.25], c: '#c4baa1' })
  return { masonry, details, relief, lowerRoofs, upperRoofs }
}
