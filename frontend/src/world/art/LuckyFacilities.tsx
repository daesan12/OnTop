import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { PropModel } from './PropModel'
import { PropSign } from './CraftedProp'
import { KIOSKS,SETTINGS } from '../../layout-preview/layout'
import { openConstructionNotice } from '../../features/construction/model'
import { CodeFishBreadCart } from './CodeFishBreadCart'
import { bungeoppangView } from '../../features/bungeoppang/bungeoppangView'
import { luckyRoomArt,lotteryRoomArt,fishBreadShopArt,FISH_MENU_BOARD,LUCKY_WHEEL_SCALE,lotteryRoomSign,fishBreadShopSign,fishMenuSign,wheelFace } from './luckyFacilityGeometry'

export function LuckyFacility({kind,live}:{kind:'shop'|'drink';live:boolean}){
  const k=KIOSKS.find(k=>k.kind===kind),lottery=kind==='drink'
  if(!k)return null
  return <group name={'layout-'+kind} position={[k.x,0,k.z]} rotation={[0,k.yaw,0]}
    userData={{assetId:'procedural/plaza-'+kind,previewRole:kind,mock:true}}
    onClick={event=>{
      event.stopPropagation()
      if(!live)openConstructionNotice('layout-'+kind)
      else void import('../../features/interactions/parkInteraction').then(({getParkInteraction,interactWithPark})=>{
        if(getParkInteraction()?.id==='layout-'+kind)interactWithPark()
      })
    }}>
    <group scale={lottery?k.scale:1}>
      <PropModel art={lottery?lotteryRoomArt:luckyRoomArt} name={lottery?'lottery-room':'lucky-wheel-room'}/>
      {lottery&&<PropSign position={[0,4.27,3.05]} width={7.6*.64} height={.76} draw={lotteryRoomSign}/>}
      {!lottery&&<PropSign position={[0,(2.15-.32)*LUCKY_WHEEL_SCALE,(2.405-1.95)*LUCKY_WHEEL_SCALE]} width={3.05*LUCKY_WHEEL_SCALE} height={3.05*LUCKY_WHEEL_SCALE} draw={wheelFace} transparent/>}
    </group>
  </group>
}

/** The existing private cooking set/camera stays at its original local coordinates. */
export function FishBreadShop(){
  const shop=useRef<Group>(null),cookingCart=useRef<Group>(null)
  useFrame(()=>{
    const cooking=bungeoppangView.active||performance.now()<bungeoppangView.returningUntil
    if(shop.current)shop.current.visible=!cooking
    // The private stage unmounts on exit. Never reveal its underlying legacy cart
    // while the camera travels back to the new shop exterior.
    if(cookingCart.current)cookingCart.current.visible=bungeoppangView.active
  })
  return <group name="fish-bread-shop">
    <group ref={shop} name="fish-bread-shop-exterior" scale={SETTINGS.fishBreadShop.scale} rotation={[0,SETTINGS.fishBreadShop.yaw,0]}>
      <PropModel art={fishBreadShopArt} name="fish-bread-shop-building"/>
      <PropSign position={[0,4.27,3.95]} width={5.88} height={.76} draw={fishBreadShopSign}/>
      <group name="fish-bread-shop-menu">
        <PropSign position={[FISH_MENU_BOARD.position[0],FISH_MENU_BOARD.position[1],FISH_MENU_BOARD.position[2]+FISH_MENU_BOARD.depth/2+.02]}
          width={FISH_MENU_BOARD.width-.2} height={FISH_MENU_BOARD.height-.2} draw={fishMenuSign}/>
      </group>
    </group>
    <group ref={cookingCart} name="fish-bread-cooking-cart" visible={false}><CodeFishBreadCart detailDistance={80}/></group>
  </group>
}
