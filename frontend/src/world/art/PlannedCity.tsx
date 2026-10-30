import { Fragment, useMemo } from 'react'
import { DistantLandscape } from './DistantLandscape'
import { WORLD, PARK_SIZE } from '../../config'
import { Instances, type Part } from './Instances'
import { DetailInstances } from './DetailInstances'
import { SurfaceMaterial } from './SurfaceMaterial'
import { MEDIA_BUILDINGS, backgroundBuildingZ } from './cityLayout'
import { MediaBuilding } from './MediaBuilding'
import {
  AdvertisementResources,
  AdvertisementScreen,
} from './AdvertisementScreen'
import { UrbanMaterial } from './UrbanMaterials'
import { buildingParts } from './buildingParts'
import { CityStreets } from './CityStreets'
import { ParkBoundary } from './ParkBoundary'
import { ParkAdvertising } from './ParkAdvertising'
function createCity(parkSize:number) {
  const offset=(parkSize-PARK_SIZE)/2
  const buildings: Part[] = [],
    windows: Part[] = [],
    roads: Part[] = [],
    trim: Part[] = []
  // Support the city outside the park without covering the recessed lake bed.
  for (const side of [-1, 1]) {
    roads.push(
      {
        p: [side * (parkSize / 2 + 65), -0.15, 0],
        s: [130, 0.12, parkSize + 260],
        c: '#a7aea5',
      },
      {
        p: [0, -0.15, side * (parkSize / 2 + 65)],
        s: [parkSize, 0.12, 130],
        c: '#a7aea5',
      },
    )
  }
  for (let side = 0; side < 4; side++) {
    const angle = (side * Math.PI) / 2
    const p = (
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      c: string,
    ): Part => ({
      p: [
        Math.cos(angle) * x + Math.sin(angle) * (z-offset),
        y,
        -Math.sin(angle) * x + Math.cos(angle) * (z-offset),
      ],
      s: [w, h, d],
      r: [0, angle, 0],
      c,
    })
    for (let i = 0; i < 5; i++) {
      const x = ((i - 2) * (WORLD.halfSize - 14)) / 2,
        z = backgroundBuildingZ(side, x, -WORLD.halfSize - 42 - (i % 2) * 16),
        h = 24 + (i % 4) * 8
      if (
        (side === 0 && x > 30 && x < 78) ||
        (side === 1 && x > -85 && x < -25) ||
        (side === 3 && x > 20 && x < 75)
      )
        continue
      const parts = buildingParts({ w: 24, h, d: 18, variant: i + side })
      for (const [list, source] of [
        [buildings, parts.stone],
        [windows, parts.glass],
        [trim, parts.metal],
      ] as const)
        for (const part of source) {
          const transformed = p(
            x + part.p[0],
            part.p[1],
            z + part.p[2],
            ...part.s,
            part.c,
          )
          transformed.r = [0, angle + (part.r?.[1] ?? 0), 0]
          list.push(transformed)
        }
    }
  }
  return {buildings,windows,roads,trim,media:MEDIA_BUILDINGS.map(b=>({...b,x:b.x-Math.sin(b.yaw)*offset,z:b.z-Math.cos(b.yaw)*offset}))}
}
export function PlannedCity({parkSize=PARK_SIZE,exteriorOnly=false,entranceWidth=0,cornerRadius=0,advertising=true}:{cornerRadius?:number;parkSize?:number;exteriorOnly?:boolean;entranceWidth?:number;advertising?:boolean}={}) {
  const {buildings,windows,roads,trim,media}=useMemo(()=>createCity(parkSize),[parkSize])
  // An ad-free city must not mount the resource provider: it owns image/video loading.
  const Resources=advertising?AdvertisementResources:Fragment
  return (
    <Resources>
      <group name={advertising?'external-advertising-city':'external-city'}>
        <Instances parts={roads} shadow={false}>
          <boxGeometry />
        </Instances>
        <CityStreets parkSize={parkSize} cornerRadius={cornerRadius} />
        <DistantLandscape />
        <ParkBoundary halfSize={parkSize/2} entranceWidth={entranceWidth} cornerRadius={cornerRadius} />
        {/* Only remote buildings: walls and A-frames closer to players retain
            their existing independent camera fading. Cull 12m cells before
            submitting three material batches, without a distance cutoff. */}
        <group name="background-city-buildings" userData={{ keepOpaque: true }}>
          <DetailInstances
            name="city-building-stone"
            range={Infinity}
            parts={buildings}
            material={
              <SurfaceMaterial
                kind="stone"
                mapping="box"
                detail={0.12}
                strength={0.1}
                meters={2.2}
              />
            }
          >
            <boxGeometry />
          </DetailInstances>
          <DetailInstances
            name="city-building-glass"
            range={Infinity}
            parts={windows}
            material={<UrbanMaterial kind="glass" />}
          >
            <boxGeometry />
          </DetailInstances>
          <DetailInstances
            name="city-building-metal"
            range={Infinity}
            parts={trim}
            material={<meshStandardMaterial metalness={0.5} roughness={0.45} />}
          >
            <boxGeometry />
          </DetailInstances>
          {media.map((b) => (
            <MediaBuilding key={b.id} b={b} advertising={advertising} />
          ))}
        </group>
        {advertising&&!exteriorOnly&&<group
          position={[-78, 0, 43]}
          rotation={[0, Math.PI / 2, 0]}
          name="external-digital-sign"
        >
          <mesh position={[0, 6, 0]}>
            <boxGeometry args={[1, 12, 1]} />
            <meshStandardMaterial color="#315e60" />
          </mesh>
          <mesh position={[0, 12, 0.3]}>
            <boxGeometry args={[12.48, 6.48, 0.5]} />
            <meshStandardMaterial
              color="#253c3c"
              metalness={0.4}
              roughness={0.55}
            />
          </mesh>
          <AdvertisementScreen
            position={[0, 12, 0.6]}
            width={12}
            format="wide"
            slotId="park-wide"
          />
        </group>
        }
        {advertising&&!exteriorOnly&&<ParkAdvertising />}
      </group>
    </Resources>
  )
}
