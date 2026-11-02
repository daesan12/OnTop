import { useEffect, useMemo } from 'react'
import { Instances, beam } from './Instances'
import { AdvertisementScreen } from './AdvertisementScreen'
import {
  ADVERTISEMENT_FRAME as frame,
  advertisementSize,
  type AdvertisementSlot,
} from './advertisementFormats'
import { createAdvertisementGeometry } from './advertisementGeometry'
import type { MEDIA_BUILDINGS } from './cityLayout'
import { SurfaceMaterial } from './SurfaceMaterial'
import { UrbanMaterial } from './UrbanMaterials'
import { buildingParts } from './buildingParts'

function LedPanel({ slot, wall }: { slot: AdvertisementSlot; wall: number }) {
  const size = advertisementSize(slot.format, slot.width),
    arc = slot.arc ?? 0
  const back = useMemo(
    () =>
      createAdvertisementGeometry(
        size.width + frame.border * 2,
        size.height + frame.border * 2,
        arc,
      ),
    [size.width, size.height, arc],
  )
  useEffect(() => () => back.dispose(), [back])
  const z = wall + frame.wallGap + frame.depth
  return (
    <group name={`led-panel-${slot.id}`}>
      <mesh geometry={back} position={[slot.x, slot.y, z]}>
        <meshStandardMaterial
          color="#17282d"
          roughness={0.35}
          metalness={0.65}
        />
      </mesh>
      <AdvertisementScreen
        slotId={slot.id}
        format={slot.format}
        position={[slot.x, slot.y, z + 0.18]}
        width={slot.width}
        arc={arc}
      />
    </group>
  )
}
export function MediaBuilding({ b,advertising=true }: { b: (typeof MEDIA_BUILDINGS)[number];advertising?:boolean }) {
  const { stone, metal, glass } = useMemo(() => {
    const parts = buildingParts({
      ...b,
      variant: b.id === 'east-media' ? 1 : 0,
    })
    for (const slot of advertising?b.slots:[]) {
      const size = advertisementSize(slot.format, slot.width),
        wall = b.d / 2
      if ((slot as AdvertisementSlot).mount === 'roof') {
        const top = slot.y + size.height / 2
        for (const side of [-1, 1]) {
          const x = slot.x + side * size.width * 0.34
          parts.metal.push(
            {
              p: [x, (b.h + top) / 2, wall - 0.25],
              s: [0.4, top - b.h, 0.45],
              c: '#455957',
            },
            beam(
              [x, b.h + 0.6, wall - 4],
              [x, slot.y, wall - 0.25],
              0.3,
              '#455957',
            ),
          )
        }
      }
    }
    // Recessed facade joints and fins flank the feature screens.
    for (const side of [-1, 1])
      parts.metal.push({
        p: [side * (b.w / 2 - 0.24), b.h / 2, b.d / 2 + 0.22],
        s: [0.17, b.h, 0.5],
        c: '#bbc8c6',
      })
    return parts
  }, [b,advertising])
  return (
    <group name={b.id} position={[b.x, 0, b.z]} rotation={[0, b.yaw, 0]}>
      <Instances
        parts={stone}
        shadow={false}
        material={
          <SurfaceMaterial
            kind="stone"
            mapping="box"
            meters={2.2}
            detail={0.13}
            strength={0.12}
          />
        }
      >
        <boxGeometry />
      </Instances>
      <Instances
        parts={metal}
        shadow={false}
        material={<meshStandardMaterial metalness={0.55} roughness={0.4} />}
      >
        <boxGeometry />
      </Instances>
      <Instances
        parts={glass}
        shadow={false}
        material={<UrbanMaterial kind="glass" />}
      >
        <boxGeometry />
      </Instances>
      {advertising&&b.slots.map((slot) => (
        <LedPanel key={slot.id} slot={slot} wall={b.d / 2} />
      ))}
    </group>
  )
}
