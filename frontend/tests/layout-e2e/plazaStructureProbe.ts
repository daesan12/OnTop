import {_roots} from '@react-three/fiber'
import {Box3,Raycaster,Vector3,Mesh,MeshBasicMaterial,DoubleSide} from 'three'
import {plazaBuildingArt} from '../../src/layout-preview/PlazaBuildings'
import {KIOSKS} from '../../src/layout-preview/layout'
import {constructionBoardPosition} from '../../src/layout-preview/plazaBuildingStructure'
import {bungeoppangView} from '../../src/features/bungeoppang/bungeoppangView'

export function plazaStructureProbe(){
 const scene=_roots.get(document.querySelector('canvas')!)!.store.getState().scene
 const material=new MeshBasicMaterial({side:DoubleSide}),ray=new Raycaster()
 try{return KIOSKS.map(k=>{
  const group=scene.getObjectByName('layout-'+k.kind)!,art=plazaBuildingArt[k.kind]
  const wood=new Mesh(art.wood!,material),stone=new Mesh(art.stone!,material)
  const solid=(point:readonly number[],direction:readonly number[],target:Mesh,distance:number)=>{
   ray.set(new Vector3(...point as [number,number,number]),new Vector3(...direction as [number,number,number]));return (ray.intersectObject(target)[0]?.distance??Infinity)<=distance
  }
  const board=constructionBoardPosition(k.depth)
  const depth=k.kind==='shop'?6.6:k.kind==='drink'?4.8:k.depth
  const width=k.kind==='shop'?9.2:k.kind==='drink'?7.6:k.width
  const roofJoints=k.kind==='shop'?[]:Array.from({length:8},(_,n)=>solid([0,4.4+n*.05,depth/2-.36],[0,0,1],wood,.5))
  const boardPosts=(k.kind==='photo'?[-1,1]:[]).map(x=>({wood:solid([x,.76,board[2]-.17],[1,0,0],wood,.2),floor:solid([x,.4,board[2]-.17],[0,-1,0],stone,.2)}))
  const signBrackets=k.kind!=='drink'?[]:[-1,1].map(side=>solid([side*width*.32,4.23,depth/2+.12],[0,1,0],wood,.2))
  const pillarJoints=k.kind!=='drink'?[]:[-1,1].flatMap(sx=>[-1,1].map(sz=>solid([sx*(width/2-.16),4.25,sz*(depth/2-.2)],[1,0,0],wood,.4)))
  const bounds=new Box3()
  for(const geometry of Object.values(art)){geometry.computeBoundingBox();bounds.union(geometry.boundingBox!)}
  return {kind:k.kind,assetId:group.userData.assetId,position:group.position.toArray(),yaw:group.rotation.y,roofJoints,boardPosts,signBrackets,pillarJoints,
   wheelOnly:k.kind!=='shop'||(!art.tile&&!art.stone),
   minY:bounds.min.y,width:bounds.max.x-bounds.min.x,
   boundsValid:Object.values(art).every(g=>Array.from(g.getAttribute('position').array).every(Number.isFinite))}
 })}finally{material.dispose()}
}

export function fishShopVisibility(){
 const scene=_roots.get(document.querySelector('canvas')!)!.store.getState().scene
 return {exterior:scene.getObjectByName('fish-bread-shop-exterior')!.visible,
   cart:scene.getObjectByName('code-fish-cart')!.parent!.visible}
}

export function setFishCooking(active:boolean){bungeoppangView.active=active}
