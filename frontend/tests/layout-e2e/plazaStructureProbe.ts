import {_roots} from '@react-three/fiber'
import {Box3,Raycaster,Vector3,Mesh,MeshBasicMaterial,DoubleSide} from 'three'
import {plazaBuildingArt} from '../../src/layout-preview/PlazaBuildings'
import {KIOSKS,PATHS} from '../../src/layout-preview/layout'
import {constructionBoardPosition} from '../../src/layout-preview/plazaBuildingStructure'
import {bungeoppangView} from '../../src/features/bungeoppang/bungeoppangView'
import {rankingBoardModelMetrics} from '../../src/layout-preview/RankingBoardModel'

export function rankingBoardProbe(){
 const scene=_roots.get(document.querySelector('canvas')!)!.store.getState().scene
 const board=scene.getObjectByName('ranking-board-preview')!
 return {position:board.position.toArray(),yaw:board.rotation.y,scale:board.scale.toArray(),assetId:board.userData.assetId,
  meshCount:board.children.length,metrics:rankingBoardModelMetrics}
}

/** Measure rendered roofs, signs and feet, including every parent transform. */
export function plazaPlacementProbe(){
 const scene=_roots.get(document.querySelector('canvas')!)!.store.getState().scene
 scene.updateMatrixWorld(true)
 if(scene.getObjectByName('layout-shop'))throw new Error('The temporary wheel removal did not reach the rendered scene')
 return ['fish-bread-shop-exterior','layout-drink','ranking-board-preview','feedback-mailbox'].map(name=>{
  const box=new Box3().setFromObject(scene.getObjectByName(name)!,true)
  return {name,min:box.min.toArray(),max:box.max.toArray()}
 })
}

export function plazaPlanCapture(){
 const state=_roots.get(document.querySelector('canvas')!)!.store.getState()
 const camera=state.camera.clone()
 camera.position.set(0,104,46.001);camera.lookAt(0,0,46);camera.updateMatrixWorld(true)
 state.gl.render(state.scene,camera)
 return state.gl.domElement.toDataURL('image/png')
}

export function lotteryApproachProbe(){
 const scene=_roots.get(document.querySelector('canvas')!)!.store.getState().scene
 const paving=scene.getObjectByName('layout-smooth-paths')!,ray=new Raycaster()
 const route=PATHS.find(p=>p.id==='raffle-approach')!,a=route.points[0]!,b=route.points.at(-1)!
 return Array.from({length:16},(_,i)=>{
  const t=(i+1)/17,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t
  ray.set(new Vector3(x,3,z),new Vector3(0,-1,0))
  return ray.intersectObject(paving).length>0
 })
}

export async function rankingBoardRenderProbe(){
 const state=_roots.get(document.querySelector('canvas')!)!.store.getState()
 const board=state.scene.getObjectByName('ranking-board-preview')!
 const sample=async()=>{
  const intervals:number[]=[]
  let previous=performance.now()
  await new Promise<void>(resolve=>{
   let frame=0
   const next=(now:number)=>{
    if(frame++>5)intervals.push(now-previous)
    previous=now
    if(frame<90)requestAnimationFrame(next)
    else resolve()
   }
   requestAnimationFrame(next)
  })
  intervals.sort((a,b)=>a-b)
  return {medianFrameMs:intervals[Math.floor(intervals.length/2)]!,
   p95FrameMs:intervals[Math.floor(intervals.length*.95)]!,
   drawCalls:state.gl.info.render.calls,triangles:state.gl.info.render.triangles}
 }
 try{
  board.visible=false
  const withoutBoard=await sample()
  board.visible=true
  const withBoard=await sample()
  return {withoutBoard,withBoard}
 }finally{board.visible=true}
}

export function plazaStructureProbe(){
 const scene=_roots.get(document.querySelector('canvas')!)!.store.getState().scene
 const material=new MeshBasicMaterial({side:DoubleSide}),ray=new Raycaster()
 try{return KIOSKS.filter(k=>k.kind!=='photo').map(k=>{
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
