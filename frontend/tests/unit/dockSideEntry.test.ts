import {it,expect} from 'vitest'
import fs from 'node:fs'
import {fileURLToPath} from 'node:url'
import {Group,Mesh,BufferGeometry,Float32BufferAttribute,MeshBasicMaterial,DoubleSide,Matrix4,Quaternion,Vector3,Raycaster} from 'three'
import {factory} from '../../src/park-renewal/assetFactories'
import {openDockSideEntry,widenDockRearPassage} from '../../src/park-renewal/assetSizing'

// Read actual local GLB triangle data without textures, a browser, or network I/O.
function dockTriangles(){
 const bytes=fs.readFileSync(fileURLToPath(new URL('../../public/art/park-renewal/duck-dock-3.glb',import.meta.url)))
 const length=bytes.readUInt32LE(12),bin=28+length
 const doc=JSON.parse(bytes.subarray(20,20+length).toString()) as {
  nodes:{matrix?:number[];translation?:number[];rotation?:number[];scale?:number[];mesh?:number;children?:number[]}[];
  meshes:{primitives:{attributes:{POSITION:number};indices?:number}[]}[];
  accessors:{bufferView:number;byteOffset?:number;componentType:number;count:number}[];
  bufferViews:{byteOffset?:number;byteStride?:number}[];
  scenes:{nodes:number[]}[];scene?:number
 }
 const read=(id:number,size:number)=>{const a=doc.accessors[id]!,v=doc.bufferViews[a.bufferView]!,width=a.componentType===5126||a.componentType===5125?4:a.componentType===5123?2:1,offset=bin+(v.byteOffset??0)+(a.byteOffset??0),stride=v.byteStride??size*width,out:number[]=[]
  for(let i=0;i<a.count;i++)for(let k=0;k<size;k++){const p=offset+i*stride+k*width;out.push(a.componentType===5126?bytes.readFloatLE(p):width===4?bytes.readUInt32LE(p):width===2?bytes.readUInt16LE(p):bytes.readUInt8(p))}return out
 }
 const root=new Group(),material=new MeshBasicMaterial({side:DoubleSide})
 const visit=(id:number,parent:Matrix4)=>{const n=doc.nodes[id]!,local=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3().fromArray(n.translation??[0,0,0]),new Quaternion().fromArray(n.rotation??[0,0,0,1]),new Vector3().fromArray(n.scale??[1,1,1])),world=parent.clone().multiply(local)
  if(n.mesh!==undefined)for(const p of doc.meshes[n.mesh]!.primitives){const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(read(p.attributes.POSITION,3),3));if(p.indices!==undefined)g.setIndex(read(p.indices,1));g.applyMatrix4(world);root.add(new Mesh(g,material))}
  for(const c of n.children??[])visit(c,world)
 }
 for(const n of doc.scenes[doc.scene??0]!.nodes)visit(n,new Matrix4())
 root.updateMatrixWorld(true);return root
}
it('실제 선착장 GLB 옆 로프에만 통로를 내고 원본·반대편 난간·바닥을 보존',()=>{
 const original=dockTriangles(),copy=original.clone(true),ray=(g:Group,z:number)=>new Raycaster(new Vector3(-4.9,1.25,z),new Vector3(1,0,0),0,1).intersectObject(g,true)
 expect(ray(original,1.565).length).toBeGreaterThan(0)
 openDockSideEntry(copy);expect(copy.userData.sideEntryRemovedTriangles).toBeGreaterThan(0)
 expect(ray(copy,1.565)).toHaveLength(0);expect(ray(original,1.565).length).toBeGreaterThan(0)
 expect(new Raycaster(new Vector3(4.9,1.25,1.565),new Vector3(-1,0,0),0,1).intersectObject(copy,true).length).toBeGreaterThan(0)
 const floor=new Raycaster(new Vector3(-4,2,1.565),new Vector3(0,-1,0)).intersectObject(copy,true)[0]
 expect(floor!.point.y).toBeCloseTo(.65,1)
})

it('선착장 부스를 줄여 실제 뒤 통로를 열고 원본 부스는 보존',()=>{
 const original=dockTriangles(),copy=original.clone(true),ray=(g:Group)=>new Raycaster(new Vector3(-3.2,1.3,1.6),new Vector3(1,0,0),0,6.4).intersectObject(g,true)
 expect(ray(original).length).toBeGreaterThan(0);widenDockRearPassage(copy);expect(ray(copy)).toHaveLength(0);expect(ray(original).length).toBeGreaterThan(0)
 const floor=new Raycaster(new Vector3(0,2,1.6),new Vector3(0,-1,0)).intersectObject(copy,true)[0];expect(floor!.point.y).toBeCloseTo(.65,1)
})

it('선착장 뒤 통로의 바닥 전체가 새 목재 데크 위에서 이어짐',()=>{
 const g=dockTriangles();widenDockRearPassage(g);g.add(factory('dock-rear-floor'));g.updateMatrixWorld(true)
 for(const x of[-3.5,-2,-.5,1,2.5,3.5])for(const z of[1.25,1.6,2.1]){const hit=new Raycaster(new Vector3(x,1.7,z),new Vector3(0,-1,0)).intersectObject(g,true)[0];expect(hit).toBeDefined();expect(hit!.point.y).toBeCloseTo(.6865,3)}
})

it('새 진입로 폭 전체에서 선착장 옆 로프가 통행을 막지 않음',()=>{
 const g=dockTriangles();openDockSideEntry(g);widenDockRearPassage(g)
 for(const z of[.8,1.2,1.65,2.1,2.5])for(const y of[1.25,2.05,2.5]){const hit=new Raycaster(new Vector3(-4.9,y,z),new Vector3(1,0,0),0,.9).intersectObject(g,true);expect(hit,z.toString()).toHaveLength(0)}
})
