import { ReferenceStreetProps } from './art/ReferenceStreetProps'
import { ReferenceGarden } from './art/ReferenceGarden'
import { SimpleParkTrees } from './art/SimpleParkTrees'
import { TABLES, PAGODA_ANCHORS, type QualityPreset } from '../config'
import { memo } from 'react'
import { TableShell } from '../features/tables/TableShell'
import { Vegetation, ContactShade } from './art/Landscape'
import { PlannedGround } from './art/PlannedGround'
import { PlannedLandmarks } from './art/PlannedLandmarks'
import { PlannedWater } from './art/PlannedWater'
import { PlannedCity } from './art/PlannedCity'
import { FitnessGarden } from './art/FitnessGarden'
import { ParkFurniture } from './art/ParkFurniture'
import { StonePagoda } from './art/StonePagoda'

/** Visual slots stay independent of server-owned movement, anchors and game state. */
export const PlaceholderWorld = memo(function PlaceholderWorld({
  quality,
}: {
  quality: QualityPreset
}) {
  return (
    <group name="placeholder-park">
      <PlannedGround />
      <PlannedWater quality={quality} />
      <FitnessGarden />
      <PlannedLandmarks quality={quality} />
      {PAGODA_ANCHORS.map((anchor) => (
        <StonePagoda key={anchor.id} anchor={anchor} />
      ))}
      <Vegetation quality={quality} />
      <SimpleParkTrees />
      <ReferenceGarden quality={quality} />
      <ParkFurniture />
      <ReferenceStreetProps />
      <PlannedCity />
      {TABLES.map((anchor) => (
        <TableShell key={anchor.id} anchor={anchor} />
      ))}
      <ContactShade />
    </group>
  )
})
