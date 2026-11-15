import {BufferGeometry,Float32BufferAttribute,type Group,type Mesh} from 'three'
import type {SIGNPOSTS} from './landscapePlan'

type Sign=typeof SIGNPOSTS[number]

/** Rotate each arrow board and its two readable label faces; preserve the approved central post. */
export function orientWayfinding(group:Group,sign:Sign){
 const levels=sign.boards.length===1?[1.6]:[2.2,1.61,1.02]
 const rotations=sign.boards.map(({yaw})=>({yaw,c:Math.cos(yaw),s:Math.sin(yaw)}))
 group.traverse(object=>{
  const mesh=object as Mesh
  if(!mesh.isMesh)return
  if(mesh.userData.text!==undefined){
   const i=levels.findIndex(y=>Math.abs(mesh.position.y-y)<.1)
   if(i<0)return
   const {yaw,c,s}=rotations[i]!,x=mesh.position.x,z=mesh.position.z+.13
   mesh.position.x=c*x+s*z
   mesh.position.z=-s*x+c*z-.13
   mesh.rotation.y+=yaw
   return
  }

  const source=mesh.geometry,index=source.getIndex(),position=source.getAttribute('position')
  const count=index?.count??position.count
  const attributes=Object.entries(source.attributes).map(([name,attribute])=>({
   name, input:attribute.array, size:attribute.itemSize,
   output:new Float32Array(count*attribute.itemSize),
   offset:name==='position'?.13:0,
   rotate:name==='position'||name==='normal',
  }))
  const indices=index?.array
  for(let k=0;k<count;k+=3){
   const a=indices?.[k]??k,b=indices?.[k+1]??k+1,d=indices?.[k+2]??k+2
   let board=-1
   if(Math.abs(position.getX(a))>.2||Math.abs(position.getX(b))>.2||Math.abs(position.getX(d))>.2){
    for(let i=0;i<levels.length;i++){
     const y=levels[i]!
     if(Math.abs(position.getY(a)-y)<.32&&Math.abs(position.getY(b)-y)<.32&&Math.abs(position.getY(d)-y)<.32){
      board=i
      break
     }
    }
   }
   const c=rotations[board]?.c??1,s=rotations[board]?.s??0
   for(const {input,output,size,offset,rotate} of attributes){
    for(let vertex=k;vertex<k+3;vertex++){
     const from=(indices?.[vertex]??vertex)*size,to=vertex*size
     for(let j=0;j<size;j++)output[to+j]=input[from+j]!
     if(rotate){
      const x=input[from]!,z=input[from+2]!+offset
      output[to]=c*x+s*z
      output[to+2]=-s*x+c*z-offset
     }
    }
   }
  }
  const geometry=new BufferGeometry()
  for(const {name,output,size} of attributes)geometry.setAttribute(name,new Float32BufferAttribute(output,size))
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  mesh.geometry=geometry
  source.dispose()
 })
 group.userData={...group.userData,directions:sign.boards.map(({label,target,yaw})=>({label,target,yaw}))}
 return group
}
