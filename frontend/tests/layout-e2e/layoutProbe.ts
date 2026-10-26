import { PARK_DATA,PARK_LAYOUT } from '../../src/map/park'
import { _roots } from '@react-three/fiber'
import { Box3,Triangle,Color,Vector3,PerspectiveCamera,Raycaster,type Mesh,type MeshStandardMaterial,type InstancedMesh } from 'three'
import { DRAFT_FOUNTAIN,KIOSKS,VR_EDGE_TREE_SITES,DRAFT_LAMPS,DRAFT_PAVILIONS,DRAFT_TABLES,DRAFT_PARK,DRAFT_JUMP_PADS,DRAFT_FITNESS_STATIONS,DRAFT_TOWER_BENCHES,SITES } from '../../src/layout-preview/layout'
import { previewMotion } from '../../src/layout-preview/PreviewCamera'
import { SHORE_TREE_SITES,PERIMETER_TREE_SITES,trunks } from '../../src/layout-preview/sceneGeometry'
import { STEPPING_STONES,aquaticPlantCount } from '../../src/layout-preview/lakeGeometry'
import { DRAFT_LAKE_ROCKS } from '../../src/layout-preview/lakeLayout'
import { pigeonGeometry } from '../../src/world/pigeons/pigeonGeometry'
export function previewPolishProbe(){
  const scene=_roots.get(document.querySelector('canvas')!)!.store.getState().scene
  scene.updateMatrixWorld(true)
  const pagoda=scene.getObjectByName('vr-stone-pagoda')!.getObjectByName('pagoda-stone-asset') as Mesh
  const g=pagoda.geometry,p=g.getAttribute('position'),index=g.getIndex(),triangle=new Triangle(),box=new Box3(),hits:string[]=[],oldHits:string[]=[]
  for(const pad of DRAFT_JUMP_PADS)for(const old of [false,true]) {
    const k=Number(pad.id.split('-').at(-1)),a=Math.PI/2+k*Math.PI/4
    const x=old?SITES.vrPagoda.x+Math.cos(a)*4.7:pad.x,z=old?SITES.vrPagoda.z+Math.sin(a)*4.7:pad.z
    box.set(new Vector3(x-.93,pad.height-pad.thickness-.08,z-.93),new Vector3(x+.93,pad.height+.02,z+.93))
    for(let i=0;i<(index?.count??p.count);i+=3){
      for(const [j,v] of [triangle.a,triangle.b,triangle.c].entries())v.fromBufferAttribute(p,index?index.getX(i+j):i+j).applyMatrix4(pagoda.matrixWorld)
      if(box.intersectsTriangle(triangle)){(old?oldHits:hits).push(pad.id);break}
    }
  }
  const fades:number[]=[]
  scene.getObjectByName('layout-vr-jump-course')!.traverse(o=>{const m=o as InstancedMesh;if(m.isInstancedMesh&&m.geometry.hasAttribute('aFade'))fades.push(...Array.from(m.geometry.getAttribute('aFade').array))})
  return {hits,oldHits,fades,lampCount:DRAFT_LAMPS.length,lamps:!!scene.getObjectByName('layout-original-park-lamps'),centralDecor:!!scene.getObjectByName('garden-stone-pagoda')!.getObjectByName('pagoda-balustrade-finials')}
}
export function layoutProbe(){
  const state=_roots.get(document.querySelector('canvas')!)!.store.getState(),scene=state.scene
  const world=(name:string)=>scene.getObjectByName(name)?.getWorldPosition(new Vector3()).toArray()
  const fish=scene.getObjectByName('lake-fish')?.children[0] as InstancedMesh|undefined
  const pigeons=scene.getObjectByName('pigeons-body-0') as InstancedMesh|undefined
  const backdrop=scene.getObjectByName('layout-background')!,ray=new Raycaster()
  const backgroundCoversWater=[SITES.fountain,SITES.lake].some(p=>{
    ray.set(new Vector3(p.x,5,p.z),new Vector3(0,-1,0));return ray.intersectObject(backdrop,true).length>0
  })
  const vrForward=scene.getObjectByName('vr-experience-hall')?.getWorldDirection(new Vector3()).toArray()
  return {common:{samePark:PARK_DATA.world.size===DRAFT_PARK.size,sameTables:PARK_DATA.tables===DRAFT_TABLES,sameLayout:PARK_LAYOUT.SITES===SITES,obstacleCount:PARK_DATA.collision.obstacles.length,schemaVersion:PARK_DATA.metadata.schemaVersion},park:DRAFT_PARK,motion:{...previewMotion},camera:state.camera.position.toArray(),
    alignment:{rotation:scene.getObjectByName('park-layout-draft')!.rotation.toArray().slice(0,3),centre:new Vector3(0,0,0).project(state.camera).toArray(),north:new Vector3(0,0,-20).project(state.camera).toArray(),east:new Vector3(20,0,0).project(state.camera).toArray()},
    fieldOfView:state.camera instanceof PerspectiveCamera?state.camera.fov:0,
    pavilions:DRAFT_PAVILIONS.map(p=>({id:p.id,exists:!!scene.getObjectByName('pavilion-'+p.id)})),
    tables:DRAFT_TABLES.map(t=>({id:t.id,position:world(t.id),expected:[...t.position],codeFurniture:!!scene.getObjectByName(t.id)?.getObjectByName('pavilion-wood-table')})),
    mailbox:world('feedback-mailbox'),cart:world('fish-bread'),sites:SITES,
    latest:{vrInlay:!!scene.getObjectByName('layout-vr-circular-stone-inlay'),vrTrees:VR_EDGE_TREE_SITES.length,gardens:!!scene.getObjectByName('layout-reference-rest-gardens'),promenade:!!scene.getObjectByName('layout-gate-stone-promenade'),roles:KIOSKS.map(k=>({kind:k.kind,width:k.width,role:scene.getObjectByName('layout-'+k.kind)?.userData.previewRole})),fountainScale:scene.getObjectByName('layout-enlarged-fountain')?.scale.toArray(),jetScale:scene.getObjectByName('fountain-jet-height')?.scale.toArray(),expectedFountain:DRAFT_FOUNTAIN},
    mainOriginal:!!scene.getObjectByName('main-octagonal-game-table'),
    background:scene.getObjectByName('background-only')?.userData.walkable,
    landscape:['layout-smooth-paths','layout-courtyard-fences','layout-life-plaza'].map(name=>({name,exists:!!scene.getObjectByName(name)})),
    water:['layout-shore-fence','layout-lake-crossings','layout-lotus-and-reeds','layout-lake-rocks','lake-fish','layout-shore-trees'].map(name=>({name,exists:!!scene.getObjectByName(name)})),
    shoreTrees:SHORE_TREE_SITES.length,groveTrees:trunks.length,lotusPads:aquaticPlantCount,rocks:DRAFT_LAKE_ROCKS.length,
    zones:{vr:world('vr-experience-hall'),folk:world('layout-hall-room'),tower:world('vr-stone-pagoda')},
    fish:{count:fish?.count,visible:fish?.visible,position:fish?Array.from(fish.instanceMatrix.array.slice(12,15)):[]},
    pigeons:{exists:!!pigeons,capacity:pigeons?.instanceMatrix.count,drawn:pigeons?.count,originalGeometry:pigeons?.geometry===pigeonGeometry.body},
    jumpPads:DRAFT_JUMP_PADS.map(p=>({id:p.id,position:world(p.id),expected:[p.x,p.height-p.thickness/2,p.z]})),
    fitness:DRAFT_FITNESS_STATIONS.map(s=>({id:s.id,position:world(s.id),expected:s.position})),
    stairs:!!scene.getObjectByName('layout-pavilion-stairs'),
    restored:{sky:!!scene.getObjectByName('dynamic-sky'),namsan:!!scene.getObjectByName('namsan-tower-silhouette'),fountain:!!scene.getObjectByName('layout-original-fountain-terrain'),backgroundCoversWater},
    refinements:{gate:!!scene.getObjectByName('layout-crafted-entrance'),balustrade:!!scene.getObjectByName('layout-central-pagoda-stone-balustrade'),event:!!scene.getObjectByName('layout-event-grove'),stoneFurniture:!!scene.getObjectByName('layout-vr-stone-furniture'),wallCorners:!!scene.getObjectByName('rounded-tiled-wall-corners'),road:!!scene.getObjectByName('city-continuous-asphalt'),roadColor:((scene.getObjectByName('city-continuous-asphalt') as Mesh)?.material as MeshStandardMaterial)?.color.getHexString(),stones:STEPPING_STONES,towerBenches:DRAFT_TOWER_BENCHES.map(b=>({position:world(b.id),expected:[b.x,b.y,b.z]}))},
    exterior:{streets:!!scene.getObjectByName("city-streets"),wall:scene.getObjectByName("reference-tiled-boundary")?.userData.assetId,media:["west-media","east-media","north-media","west-poster-media","east-wide-media","north-landscape-media"].every(id=>!!scene.getObjectByName(id)),perimeterTrees:PERIMETER_TREE_SITES.length},
    districts:{vrForward,extraTowerStructure:!!scene.getObjectByName("layout-pagoda-structural-brackets"),gymScale:scene.getObjectByName("fitness-zone-floor")?.scale.toArray(),treeBench:!!scene.getObjectByName('layout-fitness-tree-and-ring-bench'),gymFloor:(scene.getObjectByName('fitness-zone-floor') as Mesh)?.geometry.type,padsShown:!!scene.getObjectByName('fitness-stone-inlays'),jumpColors:DRAFT_JUMP_PADS.map((_,i)=>{const c=new Color();(scene.getObjectByName('layout-jump-stone-stone') as InstancedMesh).getColorAt(i,c);return c.getHexString()})},
  }
}
