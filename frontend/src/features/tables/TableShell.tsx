import { useMemo } from 'react'

import { GOMOKU, TABLE_SEATS, tableScale, type TableAnchor } from '../../config'
import { parkRuntime } from '../../park/runtime/runtime'
import { Instances, type Part } from '../../world/art/Instances'

import { SurfaceMaterial } from '../../world/art/SurfaceMaterial'
import { BeveledBox } from '../../world/art/BeveledBox'
import { WoodTable } from './WoodTable'
import { StonePicnicTable } from './StonePicnicTable'
import { MainPavilionTable } from './MainPavilionTable'

/** Stable game/seat anchors survive replacement of the visual table subtree. */
export function TableShell({ anchor }: { anchor: TableAnchor }) {
  const fourSeats = true
  const mainPavilion = anchor.pavilionId === 'P0'
  const parts = useMemo(() => {
    const stone: Part[] = [
      { p: [0, 0.99, 0], s: [2.1, 0.14, 1.6], c: '#c7c6b9' },
    ]
    const supports: Part[] = []
    for (const x of [-0.7, 0.7])
      supports.push({ p: [x, 0.46, 0], s: [0.28, 0.92, 1.15], c: '#545e57' })
    for (const z of GOMOKU.seatZ) {
      stone.push({ p: [0, 0.48, z], s: [2.1, 0.16, 0.52], c: '#c3c3b7' })
      for (const x of [-0.7, 0.7])
        supports.push({ p: [x, 0.2, z], s: [0.28, 0.4, 0.43], c: '#545e57' })
    }
    if (fourSeats)
      for (const { x, z } of TABLE_SEATS.slice(2)) {
        stone.push({ p: [x, 0.48, z], s: [0.52, 0.16, 0.85], c: '#c3c3b7' })
        supports.push({ p: [x, 0.2, z], s: [0.32, 0.4, 0.6], c: '#545e57' })
      }
    return { stone, supports }
  }, [fourSeats])
  return (
    <group
      scale={[tableScale(anchor), 1, tableScale(anchor)]}
      name={anchor.id}
      position={[...anchor.position]}
      userData={{ assetId: anchor.assetId }}
      onClick={(event) => {
        event.stopPropagation()
        parkRuntime.inspectTable(anchor.id)
      }}
    >
      {anchor.picnicId ? (
        <StonePicnicTable />
      ) : mainPavilion ? (
        <MainPavilionTable />
      ) : anchor.pavilionId ? (
        <WoodTable seatCount={4} />
      ) : (
        <>
          <Instances
            parts={parts.stone}
            material={
              <SurfaceMaterial
                kind="stone"
                mapping="box"
                meters={1.25}
                color="#ffffff"
              />
            }
          >
            <BeveledBox />
          </Instances>
          <Instances
            parts={parts.supports}
            material={
              <meshStandardMaterial metalness={0.35} roughness={0.62} />
            }
          >
            <boxGeometry />
          </Instances>
        </>
      )}
    </group>
  )
}
