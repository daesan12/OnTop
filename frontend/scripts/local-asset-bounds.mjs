import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {Box3,Matrix4,Quaternion,Vector3} from 'three'
const base=fileURLToPath(new URL('../public/art/park-renewal/',import.meta.url))
const models={fortune:'온탑_운세방_4/model/ontop-fortune-room-4.glb',lottery:'온탑_복권방_2/model/ontop-lottery-shop-2.glb',main:'메인_팔각정_5/model/main-octagonal-pavilion-5.glb',bread:'붕어빵_가게_v4/bungeoppang-shop.glb',pigeon:'비둘기_가게/pigeon-shop.glb',cafe:'한정선_카페_2/model/hanjeongseon-cafe-2.glb',dock:'오리배_선착장_3/model/duck-dock-3.glb',boat:'오리배_1/model/duck-boat-1.glb'}
for(const[kind,file]of Object.entries(models)){
 const bytes=fs.readFileSync(path.join(base,path.basename(file))),json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString()),box=new Box3()
 const visit=(id,parent)=>{const n=json.nodes[id],local=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3(...n.translation??[0,0,0]),new Quaternion(...n.rotation??[0,0,0,1]),new Vector3(...n.scale??[1,1,1])),world=parent.clone().multiply(local)
  if(n.mesh!==undefined)for(const p of json.meshes[n.mesh].primitives){const a=json.accessors[p.attributes.POSITION];box.union(new Box3(new Vector3(...a.min),new Vector3(...a.max)).applyMatrix4(world))}
  for(const c of n.children??[])visit(c,world)
 }
 for(const id of json.scenes[json.scene??0].nodes)visit(id,new Matrix4())
 console.log(kind,JSON.stringify({min:box.min.toArray(),max:box.max.toArray(),size:box.getSize(new Vector3()).toArray()}))
}
