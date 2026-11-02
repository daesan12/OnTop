import { expect, it } from 'vitest'
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { pagodaBalustradeArt, stairSupportSites } from '../../src/layout-preview/pagodaBalustrade'
import { SETTINGS, SITES, STAIR_RAIL_RUNS } from '../../src/layout-preview/layout'

it('돌 울타리 모서리 기단의 윗면이 중복되어 깊이 충돌을 일으키지 않는다', () => {
  const mesh = new Mesh(pagodaBalustradeArt.stone, new MeshBasicMaterial())
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const ray = new Raycaster(new Vector3(SITES.pagoda.x + x * (SETTINGS.pagoda.terraceHalf - .08),
      SITES.pagoda.floor + .221, SITES.pagoda.z + z * (SETTINGS.pagoda.terraceHalf - .13)), new Vector3(0, -1, 0))
    expect(ray.intersectObject(mesh).filter(hit => hit.distance < .002)).toHaveLength(1)
  }
  mesh.material.dispose()
})

it('받침과 기둥이 겹치는 접지 면을 남기지 않는다', () => {
  const rail = new Mesh(pagodaBalustradeArt.stone, new MeshBasicMaterial())
  const contacts = [...stairSupportSites]
  for(const x of [-1,1])for(const z of [-1,1])contacts.push({
    x:SITES.pagoda.x+x*SETTINGS.pagoda.terraceHalf, z:SITES.pagoda.z+z*SETTINGS.pagoda.terraceHalf, bottom:SITES.pagoda.floor })
  for(const site of contacts){
    const ray=new Raycaster(new Vector3(site.x+.071,site.bottom-.01,site.z+.053),new Vector3(0,1,0),0,.02)
    expect(ray.intersectObject(rail)).toHaveLength(0)
  }
  rail.material.dispose()
})

it('계단 기단과 받침 표면에 겹쳐 보이는 면이 없다', () => {
  const mesh = new Mesh(pagodaBalustradeArt.stone, new MeshBasicMaterial())
  const overlaps: object[] = []
  for (const run of STAIR_RAIL_RUNS) {
    const dx=run.to[0]-run.from[0], dz=run.to[1]-run.from[1], length=Math.hypot(dx,dz)
    const across=new Vector3(dz/length,0,-dx/length)
    for (let i=0;i<35;i++) {
      const t=(i+.37)/35, x=run.from[0]+dx*t, z=run.from[1]+dz*t
      for (const side of [-1,1]) {
        const origin=new Vector3(x, SITES.pagoda.floor*(1-t)+.09,z).addScaledVector(across,side)
        const hits=new Raycaster(origin,across.clone().multiplyScalar(-side),0,2).intersectObject(mesh)
        if(hits[1] && Math.abs(hits[0]!.distance-hits[1]!.distance)<.0001) overlaps.push({x,z,side,y:origin.y})
      }
    }
  }
  for (const site of stairSupportSites) {
    const hits=new Raycaster(new Vector3(site.x+.071,site.bottom+.121,site.z+.053),new Vector3(0,-1,0),0,.3).intersectObject(mesh)
    if(hits[1] && Math.abs(hits[0]!.distance-hits[1]!.distance)<.0001) overlaps.push(site)
  }
  expect(overlaps).toEqual([])
  mesh.material.dispose()
})
