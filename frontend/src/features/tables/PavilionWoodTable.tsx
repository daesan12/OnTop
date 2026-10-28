import { TABLE_SEATS } from '../../config/table-seats'
import { useMemo } from 'react'
import { Instances, yawPart, type Part } from '../../world/art/Instances'
import { BeveledBox } from '../../world/art/BeveledBox'
import { SurfaceMaterial } from '../../world/art/SurfaceMaterial'

const tabletop: Part[] = [], tableFrame: Part[] = []
const chairSurfaces: Part[] = [], chairFrames: Part[] = [], hardware: Part[] = []

// Keep the original 2.1 x 1.6m footprint and 1.06m tabletop surface.
// Five separate boards and breadboard ends give the grain a readable construction.
for (let i = 0; i < 5; i++) tabletop.push({
  p: [0, 0.99, (i - 2) * 0.316], s: [1.9, 0.14, 0.312],
  c: ['#c49b70', '#bf9569', '#ccaa7e', '#c1986d', '#c7a173'][i]!,
})
for (const side of [-1, 1]) {
  tabletop.push({ p: [side * 1, 0.99, 0], s: [0.1, 0.14, 1.6], c: '#b88e60' })
  tableFrame.push(
    { p: [0, 0.83, side * 0.59], s: [1.72, 0.18, 0.105], c: '#795538' },
    { p: [side * 0.82, 0.83, 0], s: [0.105, 0.18, 1.28], c: '#795538' },
    { p: [side * 0.82, 0.22, 0], s: [0.075, 0.09, 1.17], c: '#805b3c' },
  )
  for (const z of [-0.59, 0.59]) {
    tableFrame.push(
      { p: [side * 0.82, 0.44, z], s: [0.115, 0.88, 0.115], c: '#8f6744' },
      { p: [side * 0.82, 0.055, z], s: [0.13, 0.11, 0.13], c: '#62452f' },
    )
    hardware.push({ p: [side * 0.82, 0.84, z + Math.sign(z) * 0.057], s: [0.025, 0.025, 0.008], c: '#a88c54' })
  }
}
tableFrame.push({ p: [0, 0.22, 0], s: [1.64, 0.075, 0.075], c: '#805b3c' })

// Model-space +Z is the sitter's forward direction; use the existing seat yaw unchanged.
// Seat surface remains 0.56m; the complete chair stays within the existing 0.8m footprint.
const seatBoards: Part[] = [], seatFrame: Part[] = [], seatHardware: Part[] = []
for (let i = 0; i < 3; i++) seatBoards.push({
  p: [0, 0.515, (i - 1) * 0.225], s: [0.72, 0.09, 0.219],
  c: ['#c49b70', '#cba478', '#bd946a'][i]!,
})
for (const side of [-1, 1]) {
  seatFrame.push(
    { p: [side * 0.29, 0.235, 0.275], s: [0.095, 0.47, 0.095], c: '#8f6744' },
    { p: [side * 0.29, 0.59, -0.285], s: [0.095, 1.18, 0.095], c: '#8f6744' },
    { p: [side * 0.29, 0.415, 0], s: [0.08, 0.11, 0.63], c: '#795538' },
    { p: [side * 0.29, 0.19, 0], s: [0.055, 0.065, 0.55], c: '#805b3c' },
    { p: [side * 0.305, 0.74, 0], s: [0.11, 0.07, 0.72], c: '#c0986d' },
    { p: [side * 0.29, 0.62, 0.275], s: [0.065, 0.2, 0.065], c: '#8f6744' },
  )
  seatHardware.push({ p: [side * 0.29, 1.181, -0.285], s: [0.098, 0.012, 0.098], c: '#a88c54' })
}
seatFrame.push(
  { p: [0, 0.415, 0.275], s: [0.58, 0.11, 0.08], c: '#795538' },
  { p: [0, 1.12, -0.285], s: [0.58, 0.12, 0.095], c: '#a47b52' },
  { p: [0, 0.755, -0.285], s: [0.58, 0.075, 0.08], c: '#8f6744' },
)
// Slightly swept individual back slats, framed by the continuous rear posts.
for (let i = 0; i < 5; i++) seatBoards.push({
  p: [(i - 2) * 0.095, 0.94, -0.275 + (1 - Math.abs(i - 2) / 2) * 0.018],
  s: [0.075, 0.32, 0.055], r: [-0.07, 0, 0], c: i % 2 ? '#b88e60' : '#c49b70',
})

function place(part: Part, seat: typeof TABLE_SEATS[number]): Part {
  const [x, y, z] = part.p
  const result: Part = {
    ...part,
    p: [seat.x + x * Math.cos(seat.yaw) + z * Math.sin(seat.yaw), y,
      seat.z - x * Math.sin(seat.yaw) + z * Math.cos(seat.yaw)],
  }
  yawPart(result, seat.yaw)
  return result
}
const tableHardwareCount = hardware.length
for (const seat of TABLE_SEATS) {
  chairSurfaces.push(...seatBoards.map(p => place(p, seat)))
  chairFrames.push(...seatFrame.map(p => place(p, seat)))
  hardware.push(...seatHardware.map(p => place(p, seat)))
}

function WoodBatch({ parts, dark = false }: { parts: readonly Part[]; dark?: boolean }) {
  return <Instances parts={parts} material={
    <SurfaceMaterial kind="wood" mapping="box" meters={0.8} strength={dark ? 0.12 : 0.18} detail={0.7} />
  }><BeveledBox /></Instances>
}

/** Approved shared furniture for ordinary pavilions. TableShell retains all gameplay contracts. */
export function PavilionWoodTable({ seatCount = 4 }: { seatCount?: number }) {
  const visible = useMemo(() => ({
    surfaces: chairSurfaces.slice(0, seatCount * seatBoards.length), frames: chairFrames.slice(0, seatCount * seatFrame.length),
    hardware: hardware.slice(0, tableHardwareCount + seatCount * seatHardware.length),
  }), [seatCount])
  return <group name="pavilion-wood-table">
    <group name="pavilion-table-body">
      <WoodBatch parts={tabletop} />
      <WoodBatch parts={tableFrame} dark />
    </group>
    <group name="pavilion-chairs-body">
      <WoodBatch parts={visible.surfaces} />
      <WoodBatch parts={visible.frames} dark />
    </group>
    <Instances parts={visible.hardware} shadow={false}
      material={<meshStandardMaterial metalness={0.65} roughness={0.48} />}>
      <BeveledBox />
    </Instances>
  </group>
}
