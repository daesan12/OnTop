import { Mesh,MeshBasicMaterial,Raycaster,Vector3 } from 'three'
import { gardenArt } from '../../src/layout-preview/sceneGeometry'
import { gatePromenadeGeometry } from '../../src/layout-preview/PreviewLandscaping'
import { mainGateArt } from '../../src/layout-preview/reviewFurnitureGeometry'
import { stairRailFrame,stairSupportSites } from '../../src/layout-preview/pagodaBalustrade'
import { fountainTerrain,fitnessRestArt } from '../../src/layout-preview/districtGeometry'
import { fountainPavingHeight } from '../../src/layout-preview/fountainPaving'
import { describe,it,expect } from 'vitest'
import { TABLES } from '../../src/config/world'
import { SETTINGS,DRAFT_FOUNTAIN,VR_EDGE_TREE_SITES,DRAFT_LAMPS,STAIR_RAIL_RUNS,DRAFT_PAVILIONS,DRAFT_TABLES,DRAFT_STAIRS,DRAFT_FITNESS_AREA,DRAFT_FITNESS_STATIONS,DRAFT_JUMP_PADS,FENCE_COURTS,FENCE_RUNS,ROUND_COURTS,LIFE_PLAZA,KIOSKS,DRAFT_TOWER_BENCHES,VR_STONE_SETS,EVENT_BENCHES,nearSegment,VR_YAW,VR_COURT,EVENT_GROVE,PATHS,MARKERS,SITES,canWalk,walkHeight,roundRoute } from '../../src/layout-preview/layout'
import { CROSSINGS,DRAFT_LAKE,shoreHalfSpan,DRAFT_LAKE_ROCKS,SHORE_RUNS,crossingHeight,swimmingAt } from '../../src/layout-preview/lakeLayout'
describe('180m layout draft contracts',()=>{
  it('retains every existing table ID and its seat data across placement changes',()=>{
    expect(DRAFT_TABLES.slice(0,16).map(t=>t.id)).toEqual(TABLES.map(t=>t.id))
    expect(DRAFT_TABLES.slice(16).map(t=>t.id)).toEqual(['table-17','table-18'])
    for(const t of DRAFT_TABLES.slice(0,16))expect(t.seatAnchors).toEqual(TABLES.find(old=>old.id===t.id)!.seatAnchors)
    expect(DRAFT_PAVILIONS.map(p=>p.id)).toEqual(['P0','P1','P2','P3','P4','P5','P6','P7','P8'])
    expect(new Set(MARKERS.map(m=>m.id)).size).toBe(23)
  })
  it('blocks exterior edges and obstacles while keeping crossings, water and arrival open',()=>{
    for(const p of [[89,0],[-89,0],[0,-89],[0,89],[102,0],[0,130],[NaN,0],[Infinity,0],[SITES.cart.x,SITES.cart.z],[SITES.mailbox.x,SITES.mailbox.z]])expect(canWalk(p[0]!,p[1]!)).toBe(false)
    for(const p of [[0,82],[0,55],[62,-26],[62,9],[79,-43]])expect(canWalk(p[0]!,p[1]!)).toBe(true)
    expect(walkHeight(0,-50)).toBe(1.8);expect(walkHeight(62,-26)).toBe(.32);expect(walkHeight(62,9)).toBeGreaterThan(.7)
  })
  it('keeps every courtyard entrance open while its solid fence spans block walking',()=>{
    for(const court of FENCE_COURTS)for(const gate of court.gates) {
      const horizontal=gate.side==='north'||gate.side==='south'
      const x=horizontal?court.x+gate.offset:court.x+(gate.side==='west'?-1:1)*court.width/2
      const z=horizontal?court.z+(gate.side==='north'?-1:1)*court.depth/2:court.z+gate.offset
      for(const across of [-.6,0,.6])expect(canWalk(x+(horizontal?0:across),z+(horizontal?across:0)),`${court.id} ${gate.side}`).toBe(true)
    }
    for(const run of FENCE_RUNS)expect(canWalk((run.from[0]+run.to[0])/2,(run.from[1]+run.to[1])/2),run.id).toBe(false)
    for(const c of ROUND_COURTS)for(const a of c.gates)expect(canWalk(c.x+Math.cos(a)*c.rx,c.z+Math.sin(a)*c.rz),`${c.id} gate ${a}`).toBe(true)
    // The hall-to-main-pavilion connection uses the side entrance, rather than crossing a fence.
    for(let x=-32;x<=0;x+=.2)expect(canWalk(x,-8),`middle crossing x=${x}`).toBe(true)
  })
  it('rounds a path corner without moving its entrances or overshooting its reserved footprint',()=>{
    const points=roundRoute([[0,0],[10,0],[10,10]],3)
    expect(points[0]).toEqual([0,0]);expect(points.at(-1)).toEqual([10,10])
    expect(points.some(([x,z])=>x>7&&x<10&&z>0&&z<3)).toBe(true)
    expect(points.every(([x,z])=>Number.isFinite(x)&&Number.isFinite(z)&&x>=0&&x<=10&&z>=0&&z<=10)).toBe(true)
  })
  it('keeps the pavilion columns and reference cross paths straight, with separate southern entries',()=>{
    for(const id of ['west-pavilions','east-pavilions']) {
      const route=PATHS.find(p=>p.id===id)!
      expect(new Set(route.points.map(p=>p[0])).size).toBe(1)
      expect(route.points[0]![1]).toBe(-8);expect(route.points.at(-1)![1]).toBe(-76)
    }
    expect(new Set(DRAFT_PAVILIONS.filter(p=>['P3','P5','P7'].includes(p.id)).map(p=>p.x)).size).toBe(1)
    expect(new Set(DRAFT_PAVILIONS.filter(p=>['P4','P6','P8'].includes(p.id)).map(p=>p.x)).size).toBe(1)
    expect(DRAFT_PAVILIONS.find(p=>p.id==='P1')!.x).toBe(-28)
    expect(DRAFT_PAVILIONS.find(p=>p.id==='P2')!.x).toBe(28)
    for(const side of [-1,1]){
      const route=PATHS.find(r=>r.id===(side<0?'west-main-side-pavilion':'east-main-side-pavilion'))!
      expect(route.points).toEqual([[side*28,-8],[side*28,25]])
      for(const z of [-4.5,12.5])expect(canWalk(side*28,z)).toBe(true)
      const gapTrees=SETTINGS.pavilionEdgeTrees.filter(t=>t.id.startsWith('pavilion-tree-'+(side<0?'P1':'P2')+'-')&&Math.abs(t.x)<21)
      expect(gapTrees.length).toBeGreaterThanOrEqual(4)
    }
    expect(DRAFT_PAVILIONS.filter(p=>p.id==='P5'||p.id==='P6').every(p=>p.z===-61)).toBe(true)
    for(const id of ['north-cross','garden-cross','service-entry','fountain-south','tower-east','tower-west']) {
      const points=PATHS.find(p=>p.id===id)!.points
      expect(points.slice(1).every((p,i)=>p[0]===points[i]![0]||p[1]===points[i]![1])).toBe(true)
    }
    expect(canWalk(SITES.vr.x,SITES.vr.z)).toBe(false);expect(canWalk(SITES.folk.x,SITES.folk.z)).toBe(false);expect(canWalk(SITES.vrPagoda.x,SITES.vrPagoda.z)).toBe(false)
  })
  it('opens both swimming entries, separates bridge walking from swimming, and blocks shore rails and rocks',()=>{
    for(let x=40;x<=84;x+=.25)expect(canWalk(x,-14),`swim entrance x=${x}`).toBe(true)
    expect(swimmingAt(62,-14)).toBe(true);expect(canWalk(62,-14)).toBe(true)
    expect(swimmingAt(42,-14)).toBe(false)
    for(const crossing of CROSSINGS) {
      expect(swimmingAt(62,crossing.z)).toBe(false)
      expect(crossingHeight(62,crossing.z)).toBeGreaterThan(0)
    }
    expect(CROSSINGS.find(c=>c.kind==='stone')!.z).toBe(-26);expect(CROSSINGS.find(c=>c.kind==='wood')!.z).toBe(9)
    for(const run of SHORE_RUNS)expect(canWalk((run.from[0]+run.to[0])/2,(run.from[1]+run.to[1])/2)).toBe(false)
    expect(DRAFT_LAKE_ROCKS.length).toBeGreaterThan(10)
    for(const rock of DRAFT_LAKE_ROCKS)expect(canWalk(rock.x,rock.z)).toBe(false)
  })
  it('opens straight facility connections and the lanes between adjoining pavilions',()=>{
    expect(PATHS.find(p=>p.id==='west-spine')!.points).toEqual([[-39,-76],[-39,84]])
    for(let z=-75;z<83;z+=.4)expect(canWalk(-39,z),`west spine z=${z}`).toBe(true)
    for(let x=-45;x<39;x+=.3)expect(canWalk(x,-8),`VR cross x=${x}`).toBe(true)
    for(let x=-39;x<-12;x+=.3)expect(canWalk(x,46),`fitness cross x=${x}`).toBe(true)
    for(let x=-39;x<-12;x+=.3)expect(canWalk(x,46),`service cross x=${x}`).toBe(true)
    for(const side of [-1,1])for(let z=-8;z<25;z+=.3)expect(canWalk(side*14.9,z),`side lane ${side} z=${z}`).toBe(true)
    expect(DRAFT_FITNESS_AREA.width).toBeGreaterThan(DRAFT_FITNESS_AREA.depth);expect(DRAFT_FITNESS_AREA.depth).toBeLessThan(30)
    for(const s of DRAFT_FITNESS_STATIONS)expect(canWalk(s.position[0],s.position[2]),s.id).toBe(false)
  })
  it('uses a concentric fitness circle with clear shaded seats, a larger plaza and inward-facing small booths',()=>{
    expect(SITES.fitness.z).toBeGreaterThan(56)
    for(const s of DRAFT_FITNESS_STATIONS) {
      const dx=s.position[0]-SITES.fitness.x,dz=s.position[2]-SITES.fitness.z
      expect(Math.hypot(dx,dz)).toBeCloseTo(SETTINGS.fitness.stationRadius)
      expect(Math.sin(s.yaw)*dx+Math.cos(s.yaw)*dz).toBeLessThan(0)
    }
    expect(canWalk(SITES.fitness.x,SITES.fitness.z)).toBe(false)
    expect(canWalk(SITES.fitness.x+2.15,SITES.fitness.z+2.15)).toBe(false)
    expect(canWalk(SITES.fitness.x+3,SITES.fitness.z)).toBe(true)
    expect(LIFE_PLAZA.depth).toBeGreaterThan(26)
    expect(DRAFT_PAVILIONS.filter(p=>p.id==='P7'||p.id==='P8').every(p=>p.z>69)).toBe(true)
    expect(EVENT_GROVE.z).toBeGreaterThan(18);expect(EVENT_GROVE.width).toBe(32);expect(VR_COURT.depth).toBeGreaterThan(32)
    expect(VR_YAW).toBe(Math.PI/2)
    for(const k of KIOSKS){expect(k.width).toBeGreaterThan(7);expect(k.depth).toBeGreaterThanOrEqual(5)}
  })
  it('joins the fishing decks to the path with gradual landings and keeps side rails solid',()=>{
    for(const [a,b] of [[42,45],[82,84]]) {
      let previous=walkHeight(a!,-43)
      for(let x=a!+.1;x<=b!;x+=.1){expect(canWalk(x,-43)).toBe(true);const next=walkHeight(x,-43);expect(Math.abs(next-previous)).toBeLessThan(.025);previous=next}
    }
    for(const x of [49,79]){expect(walkHeight(x,-43)).toBe(.32);expect(canWalk(x,-40.18)).toBe(false)}
  })
  it('fits bridge ends to the banks, arches the timber deck and keeps whole boulders clear of rails',()=>{
    for(const c of CROSSINGS) {
      expect(Math.abs(c.startX-(DRAFT_LAKE.x-shoreHalfSpan(c.z)))).toBeLessThan(.7)
      expect(Math.abs(c.endX-(DRAFT_LAKE.x+shoreHalfSpan(c.z)))).toBeLessThan(.7)
      expect(crossingHeight(c.startX,c.z)).toBeCloseTo(crossingHeight(c.endX,c.z)!)
      if(c.kind==='wood')expect(crossingHeight((c.startX+c.endX)/2,c.z)!).toBeGreaterThan(crossingHeight(c.startX,c.z)!+1.5)
    }
    for(const r of DRAFT_LAKE_ROCKS) {
      const bounds=Math.hypot(r.size[0],r.size[2])*1.18
      expect(Math.min(...SHORE_RUNS.map(s=>nearSegment(r.x,r.z,s.from,s.to))),r.id).toBeGreaterThan(bounds+.25)
    }
  })
  it('keeps the northern jump tower in front of VR, preserves both summit benches and blocks new solid furniture',()=>{
    expect(SITES.vrPagoda.z).toBe(SITES.vr.z)
    expect(SITES.vrPagoda.z).toBeLessThan(SITES.folk.z-15)
    expect(SITES.vrPagoda.x).toBeGreaterThan(SITES.vr.x+15)
    expect(DRAFT_TOWER_BENCHES).toHaveLength(2);expect(DRAFT_TOWER_BENCHES.every(b=>b.y>17)).toBe(true)
    for(const p of [...VR_STONE_SETS,...EVENT_BENCHES])expect(canWalk(p.x,p.z)).toBe(false)
    expect(canWalk(SITES.event.x,SITES.event.z)).toBe(true)
    expect(SITES.cart.x).toBeGreaterThan(SITES.event.x);expect(SITES.cart.z).toBeGreaterThan(SITES.event.z)
    expect(canWalk(88,88)).toBe(false);expect(canWalk(0,88)).toBe(true)
  })
  it('keeps lamps beside routes and off the central terrace, with all four stairways open',()=>{
    expect(DRAFT_LAMPS.length).toBeGreaterThan(25)
    for(const [x,,z] of DRAFT_LAMPS){expect(Math.abs(x)>=19||Math.abs(z+40)>=22).toBe(true);expect(Math.hypot(x-LIFE_PLAZA.x,z-LIFE_PLAZA.z)>=20).toBe(true);expect(canWalk(x,z)).toBe(false)}
    expect(STAIR_RAIL_RUNS).toHaveLength(8)
    for(const side of [-1,1])for(let d=13;d<=17;d+=.2){expect(canWalk(side*d,-40)).toBe(true);expect(canWalk(0,-40+side*d)).toBe(true)}
    expect(KIOSKS.find(k=>k.kind==='shop')!.yaw).toBe(SETTINGS.kiosks.shop.yaw)
    expect(KIOSKS.find(k=>k.kind==='drink')!.yaw).toBe(SETTINGS.kiosks.drink.yaw)
    expect(MARKERS.find(m=>m.id==='layout-drink')!.label).toBe('응모부스')
    for(const t of DRAFT_TABLES.slice(0,4))expect(Math.hypot(t.position[0]-LIFE_PLAZA.x,t.position[2]-LIFE_PLAZA.z)).toBeCloseTo(Math.sqrt(288))
  })
  it('bonds every stair-rail support to the rendered treads, and keeps the fitness ring bench backless',()=>{
    const mesh=new Mesh(gardenArt.stone,new MeshBasicMaterial()),ray=new Raycaster()
    expect(stairSupportSites).toHaveLength(48)
    for(const s of stairSupportSites){
      if(s.bottom===0){expect(walkHeight(s.x,s.z)).toBe(0);continue}
      ray.set(new Vector3(s.x,3,s.z),new Vector3(0,-1,0))
      const hits=ray.intersectObject(mesh)
      expect(hits.length,'tread under support '+s.x+','+s.z).toBeGreaterThan(0)
      expect(hits[0]!.point.y).toBeCloseTo(s.bottom,3)
    }
    const p=fitnessRestArt.wood!.getAttribute('position'),radii:number[]=[]
    for(let i=0;i<p.count;i++){
      expect(p.getY(i)).toBeLessThanOrEqual(.621)
      radii.push(Math.hypot(p.getX(i)-SITES.fitness.x,p.getZ(i)-SITES.fitness.z))
    }
    expect(radii.length).toBeGreaterThan(50);expect(Math.min(...radii)).toBeGreaterThan(2.59);expect(Math.max(...radii)).toBeLessThan(3.38)
    ;(mesh.material as MeshBasicMaterial).dispose()
    expect(KIOSKS.find(k=>k.kind==='shop')!.width).toBe(9.6);expect(KIOSKS.find(k=>k.kind==='drink')!.width).toBe(7.8)
    expect(SITES.vrPagoda.x-SITES.vr.x).toBe(21)
    expect(SITES.vr.x-4.8).toBeGreaterThan(VR_COURT.x-VR_COURT.width/2)
  })
  it('keeps rail cross-sections level, paves the south gate wall and matches the enlarged fountain terrain',()=>{
    for(const [dx,dz] of [[4.4,0],[-4.4,0],[0,4.4],[0,-4.4]]){
      const m=stairRailFrame(dx!,dz!,1.8),across=new Vector3().setFromMatrixColumn(m,0),up=new Vector3().setFromMatrixColumn(m,1)
      expect(across.y).toBeCloseTo(0,8);expect(up.y).toBeGreaterThan(.9)
    }
    const material=new MeshBasicMaterial(),gate=new Mesh(gatePromenadeGeometry,material),ray=new Raycaster()
    for(let x=-83;x<=83;x+=4)for(const z of [83,86,89]){ray.set(new Vector3(x,2,z),new Vector3(0,-1,0));expect(ray.intersectObject(gate).length,'stone apron '+x+','+z).toBeGreaterThan(0)}
    mainGateArt.stone!.computeBoundingBox();expect(mainGateArt.stone!.boundingBox!.max.y).toBeLessThan(.5)
    const terrain=new Mesh(fountainTerrain,material)
    for(const r of [7.5,10,14,17])for(let i=0;i<8;i++){
      const a=i*Math.PI/4,x=SITES.fountain.x+Math.cos(a)*r,z=SITES.fountain.z+Math.sin(a)*r
      ray.set(new Vector3(x,2,z),new Vector3(0,-1,0));const hit=ray.intersectObject(terrain)[0]!
      expect(hit).toBeDefined();expect(Math.abs(hit.point.y-fountainPavingHeight(x,z))).toBeLessThan(.035)
      expect(Math.abs(hit.point.y-walkHeight(x,z))).toBeLessThan(.11)
    }
    expect(DRAFT_FOUNTAIN.plazaRadius).toBeGreaterThan(17);expect(DRAFT_FOUNTAIN.jetHeightScale).toBe(1.65)
    expect(VR_EDGE_TREE_SITES.length).toBeGreaterThan(12);for(const p of VR_EDGE_TREE_SITES)expect(canWalk(p.x,p.z)).toBe(false)
    expect(DRAFT_LAMPS.filter(([x,,z])=>Math.hypot(x-SETTINGS.plaza.x,z-SETTINGS.plaza.z)<SETTINGS.plaza.pavingRadius).length).toBeGreaterThanOrEqual(4)
    material.dispose()
  })
  it('joins stair tops to the octagonal face with a matching floor height and restores all jump pads',()=>{
    for(const stair of DRAFT_STAIRS) {
      const p=DRAFT_PAVILIONS.find(p=>p.id===stair.id)!,face=4.5*p.scale*Math.cos(Math.PI/8)
      expect(stair.join).toBeLessThan(face);expect(face-stair.join).toBeLessThan(.3)
      expect(walkHeight(p.x,p.z+face-.01)).toBe(p.floor)
      expect(walkHeight(p.x,p.z+face+.4)).toBeLessThan(p.floor)
    }
    expect(DRAFT_JUMP_PADS).toHaveLength(24)
    expect(DRAFT_JUMP_PADS[0]!.height).toBe(.65);expect(DRAFT_JUMP_PADS[23]!.height).toBeCloseTo(15.6)
  })
})
