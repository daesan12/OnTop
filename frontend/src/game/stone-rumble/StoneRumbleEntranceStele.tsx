import { useLoader } from '@react-three/fiber'
import { useMemo } from 'react'
import { groundObject } from '../../../park-renewal-preview/assetSizing'
import { models } from '../../../park-renewal-preview/modelUrls'
import { interactWithPark } from '../../features/interactions/parkInteraction'
import type { TableAnchor } from '../../park/tablePlacement'
import { ParkAssetLoader } from '../../world/art/assetLoader'
import { PropSign } from '../../world/art/CraftedProp'
import { STONE_RUMBLE_GUIDE_ID, stoneRumbleStelePosition } from './entranceStele'

const FONT = '700 48px BusanDandiMyeongjo'

function drawStoneRumbleTitle(context: CanvasRenderingContext2D, width: number, height: number) {
  context.fillStyle = '#34271f'
  context.font = `700 ${height * .46}px BusanDandiMyeongjo, serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText('돌탑 생존전', width / 2, height * .54, width * .9)
}

export default function StoneRumbleEntranceStele({ anchor }: { anchor: TableAnchor }) {
  const gltf = useLoader(ParkAssetLoader, models.stele!)
  const model = useMemo(() => {
    const copy = gltf.scene.clone(true)
    for (const name of ['stele-korean-label', 'stele-arrow']) {
      copy.getObjectByName(name)?.removeFromParent()
    }
    return groundObject(copy)
  }, [gltf])

  return <group name={STONE_RUMBLE_GUIDE_ID} position={stoneRumbleStelePosition(anchor)} scale={.8}
    onClick={event => {
      event.stopPropagation()
      interactWithPark(STONE_RUMBLE_GUIDE_ID)
    }}>
    <primitive object={model} dispose={null} />
    <PropSign width={1.23} height={.48} position={[-.015, model.position.y + 1.16, .244]}
      font={FONT} transparent draw={drawStoneRumbleTitle} />
  </group>
}
