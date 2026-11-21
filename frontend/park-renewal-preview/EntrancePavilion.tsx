import {useMemo,type ReactNode} from 'react'
import {useLoader} from '@react-three/fiber'
import {ParkAssetLoader} from '../src/world/art/assetLoader'
import {Mesh,type Group} from 'three'
import {groundObject} from './assetSizing'
import {facilityYaw} from './facilityPlacement'
import {legacyIdsForSite,pavilionIdForSite} from './mapping/identities'
import {models} from './modelUrls'
import {facilityGroundY,site} from './plan'

/** Resolve the shared loader cache before constructing procedural entrance art.
 * Suspense retries must not rebuild/discard snow, trees and sleigh geometry. */
export function EntranceAssetsReady({children}:{children:ReactNode}) {
 useLoader(ParkAssetLoader,models.main!)
 useLoader(ParkAssetLoader,models.fortune!)
 useLoader(ParkAssetLoader,models.lottery!)
 return children
}

export function createGroundedEntranceModel(source: Group) {
 const object = source.clone(true)
 object.traverse(o => { if (o instanceof Mesh) { o.castShadow = true; o.receiveShadow = true } })
 return groundObject(object)
}

function EntranceModel({kind}: {kind: 'main' | 'fortune' | 'lottery'}) {
  const gltf = useLoader(ParkAssetLoader, models[kind]!)
  const object = useMemo(() => createGroundedEntranceModel(gltf.scene), [gltf])
  return <primitive object={object} dispose={null}/>
}

export function EntranceBuilding({id}: {id: 'pavilion' | 'fortune' | 'lottery'}) {
 const building=site(id)
 return <group name={'facility-'+id} userData={{siteId:id,legacyFacilityIds:legacyIdsForSite(id),pavilionId:pavilionIdForSite(id)}} position={[building.x,facilityGroundY(building)+.1,building.z]} rotation={[0,facilityYaw(building),0]}>
  <EntranceModel kind={id==='pavilion'?'main':id}/>
 </group>
}
