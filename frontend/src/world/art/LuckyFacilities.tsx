import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { PropModel } from './PropModel'
import { PropSign } from './CraftedProp'
import { KIOSKS } from '../../layout-preview/layout'
import { openConstructionNotice } from '../../features/construction/model'
import { CodeFishBreadCart } from './CodeFishBreadCart'
import { bungeoppangView } from '../../features/bungeoppang/bungeoppangView'
import { luckyRoomArt,lotteryRoomArt,fishBreadShopArt,luckyRoomSign,lotteryRoomSign,fishBreadShopSign,fishMenuSign,wheelFace } from './luckyFacilityGeometry'

export function LuckyFacility({kind,live}:{kind:'shop'|'drink';live:boolean}){
  const k=KIOSKS.find(k=>k.kind===kind)!,lottery=kind==='drink',depth=lottery?4.8:6.6
  return <group name={'layout-'+kind} position={[k.x,0,k.z]} rotation={[0,k.yaw,0]}
    userData={{assetId:'procedural/plaza-'+kind,previewRole:kind,mock:true}}
    onClick={event=>{
      event.stopPropagation()
      if(!live)openConstructionNotice('layout-'+kind)
      else void import('../../features/interactions/parkInteraction').then(({getParkInteraction,interactWithPark})=>{
        if(getParkInteraction()?.id==='layout-'+kind)interactWithPark()
      })
    }}>
    <PropModel art={lottery?lotteryRoomArt:luckyRoomArt} name={lottery?'lottery-room':'lucky-wheel-room'}/>
    <PropSign position={[0,4.27,depth/2+.65]} width={(lottery?7.6:9.2)*.64} height={.76} draw={lottery?lotteryRoomSign:luckyRoomSign}/>
    {!lottery&&<PropSign position={[0,2.15,2.405]} width={3.05} height={3.05} draw={wheelFace} transparent/>}
  </group>
}

/** The existing private cooking set/camera stays at its original local coordinates. */
export function FishBreadShop(){
  const shop=useRef<Group>(null),cookingCart=useRef<Group>(null)
  useFrame(()=>{
    const cooking=bungeoppangView.active||performance.now()<bungeoppangView.returningUntil
    if(shop.current)shop.current.visible=!cooking
    if(cookingCart.current)cookingCart.current.visible=cooking
  })
  return <group name="fish-bread-shop">
    <group ref={shop} name="fish-bread-shop-exterior">
      <PropModel art={fishBreadShopArt} name="fish-bread-shop-building"/>
      <PropSign position={[0,4.27,3.95]} width={5.88} height={.76} draw={fishBreadShopSign}/>
      <PropSign position={[3.25,2.8,-.065]} width={1.25} height={1.7} draw={fishMenuSign}/>
    </group>
    <group ref={cookingCart} visible={false}><CodeFishBreadCart detailDistance={80}/></group>
  </group>
}
