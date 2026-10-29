import {_roots} from '@react-three/fiber'
import {Raycaster,Vector3,Mesh,MeshBasicMaterial,DoubleSide} from 'three'
import {plazaBuildingArt} from '../../src/layout-preview/PlazaBuildings'
import {KIOSKS} from '../../src/layout-preview/layout'
import {constructionBoardPosition} from '../../src/layout-preview/plazaBuildingStructure'

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
  const roofJoints=k.kind==='drink'?[]:Array.from({length:8},(_,n)=>solid([0,4.4+n*.05,k.depth/2-.26],[0,0,1],wood,.4))
  const boardPosts=[-1,1].map(x=>({wood:solid([x,.76,board[2]-.17],[1,0,0],wood,.2),floor:solid([x,.4,board[2]-.17],[0,-1,0],stone,.2)}))
  return {kind:k.kind,assetId:group.userData.assetId,position:group.position.toArray(),yaw:group.rotation.y,roofJoints,boardPosts,
   boundsValid:Object.values(art).every(g=>Array.from(g.getAttribute('position').array).every(Number.isFinite))}
 })}finally{material.dispose()}
}
