import { PICNIC_TABLE_SEATS } from '../../config'
import { useMemo } from 'react'
import { Instances, type Part } from '../../world/art/Instances'
import { SurfaceMaterial } from '../../world/art/SurfaceMaterial'
import { BeveledBox } from '../../world/art/BeveledBox'

// Preserve the outer tables' square stone profile and four existing stool positions.
// Top is at the shared 1.06m game surface so every board sits above the stone.
const parts: Part[] = [
  { p: [0, 0.445, 0], s: [0.7, 0.89, 0.7], c: '#c7bda5' },
  { p: [0, 0.975, 0], s: [2.2, 0.17, 2.2], c: '#d3c8b0' },
  ...PICNIC_TABLE_SEATS.map(({ x, z }): Part => ({
    p: [x, 0.28, z],
    s: [0.65, 0.56, 0.65],
    c: '#c4b89f',
  })),
]
export function StonePicnicTable({ seatCount = 4 }: { seatCount?: number }) {
  const visible = useMemo(() => parts.slice(0, 2 + seatCount), [seatCount])
  return (
    <group name="stone-picnic-table-and-seats">
      <Instances
        parts={visible}
        material={<SurfaceMaterial kind="stone" mapping="box" />}
      >
        <BeveledBox />
      </Instances>
    </group>
  )
}
