import {expect,it,vi} from 'vitest'
import {gzipSync,gunzipSync} from 'node:zlib'
import {Buffer} from 'node:buffer'
import {BufferAttribute,BufferGeometry} from 'three'
import type {StaticPark} from '../../src/park-renewal/static/store'

it('사전 생성 지형·높이·난간은 원본 비트와 이동·충돌 판정을 보존한다',async()=>{
  const {snapshot}=await import('../../src/park-renewal/static/snapshot')
  const {encodeStaticPark,decodeStaticPark}=await import('../../src/park-renewal/static/codec')
  const encoded=encodeStaticPark(snapshot),compressed=gzipSync(encoded)
  const bytes=gunzipSync(compressed),archive=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),decoded=decodeStaticPark(archive)
  const equalBytes=(a:Uint8Array,b:Uint8Array)=>expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
  // Covers Float64 fields, every geometry attribute/index/bound, spatial bins,
  // curb/guard paths and exact post heights, including sharing between meshes.
  equalBytes(encoded,encodeStaticPark(decoded))
  expect(decoded.ground.grass.getAttribute('position').array).toBe(decoded.ground.paving.getAttribute('position').array)
  expect(decoded.forestField.buffer).not.toBe(archive)
  expect(decoded.forestField.byteOffset).toBe(0)
  expect(decoded.forestField.buffer.byteLength).toBe(decoded.forestField.byteLength)
  const positions=decoded.ground.grass.getAttribute('position').array
  expect(positions.buffer).not.toBe(archive)
  expect(positions.buffer.byteLength).toBe(positions.byteLength)

  const originalPlan=await import('../../src/park-renewal/plan')
  const originalSurface=await import('../../src/park-renewal/groundSurface')
  const originalWalk=await import('../../src/park-renewal/surfaceHeight')
  const originalTravel=await import('../../src/park-renewal/travelMotion')
  const originalMotion=await import('../../src/park-renewal/motionPlan')
  const samples:[number,number][]=[]
  for(const[a,b,width]of originalPlan.EDGES){
    const p=originalPlan.NODES[a]!,q=originalPlan.NODES[b]!,dx=q[0]-p[0],dz=q[1]-p[1],length=Math.hypot(dx,dz)
    for(const lane of[-width/2+.6,0,width/2-.6])for(let d=0;d<=length;d+=2)samples.push([p[0]+dx*d/length-dz/length*lane,p[1]+dz*d/length+dx/length*lane])
  }
  for(const p of snapshot.guards.guardPosts)samples.push([p[0]!,p[2]!])
  const probe=(plan:typeof originalPlan,surface:typeof originalSurface,walk:typeof originalWalk,travel:typeof originalTravel,motion:typeof originalMotion)=>({
    heights:samples.map(([x,z])=>[plan.heightAt(x,z),surface.groundSurfaceHeight(x,z),walk.parkWalkSurface(x,z)]),
    movement:samples.filter((_,i)=>i%10===0).map(([x,z])=>{const y=walk.parkWalkSurface(x,z);return ['walk','bicycle','scooter'].map(mode=>travel.canTravel([x,z],[x+.2,z+.2],y,mode as 'walk'|'bicycle'|'scooter',Math.PI/4))}),
    // Cross actual fences at ground and above the rail, in both directions.
    fences:snapshot.guards.guardRuns.flatMap(run=>run.slice(1).filter((_,i)=>i%10===0).map(b=>{const x=b[0],z=b[2],y=b[1];return [y,y+2].flatMap(h=>[motion.clearMotionSegment([x-.6,z],[x+.6,z],h),motion.clearMotionSegment([x+.6,z],[x-.6,z],h)])})),
  })
  const expected=probe(originalPlan,originalSurface,originalWalk,originalTravel,originalMotion)
  vi.resetModules()
  const store=await import('../../src/park-renewal/static/store')
  store.installStaticPark(decoded)
  // Import order is the production bootstrap contract: hydrate before app/plan.
  const actualSnapshot=(await import('../../src/park-renewal/static/snapshot')).snapshot
  equalBytes(encoded,encodeStaticPark(actualSnapshot))
  const {getMoleShopArt}=await import('../../src/park-renewal/moleShopArt')
  expect(getMoleShopArt()).toBe(decoded.buildingArt!.mole)
  const actual=probe(await import('../../src/park-renewal/plan'),await import('../../src/park-renewal/groundSurface'),await import('../../src/park-renewal/surfaceHeight'),await import('../../src/park-renewal/travelMotion'),await import('../../src/park-renewal/motionPlan'))
  expect(actual).toEqual(expected)
  expect(samples.length).toBeGreaterThan(3000)
  console.log('static-equivalence',{samples:samples.length,raw:encoded.byteLength,gzip:compressed.byteLength})
},180000)

it('건물 사전 데이터가 없는 이전 파일에서도 두더지 상점의 원본 형상을 복구한다',async()=>{
  const {snapshot}=await import('../../src/park-renewal/static/snapshot')
  const {encodeStaticPark}=await import('../../src/park-renewal/static/codec')
  const {getMoleShopArt}=await import('../../src/park-renewal/moleShopArt')
  const store=await import('../../src/park-renewal/static/store')
  const {buildingArt,...older}=snapshot
  expect(buildingArt).toBeDefined()
  const expected=encodeStaticPark(snapshot)
  try {
    store.installStaticPark(older)
    const fallback=getMoleShopArt()
    expect(fallback).not.toBe(buildingArt!.mole)
    // Includes every visible body/roof/wall attribute, index, normal and bound.
    const actual=encodeStaticPark({...snapshot,buildingArt:{mole:fallback}})
    expect(Buffer.from(actual).equals(Buffer.from(expected))).toBe(true)
    expect(performance.getEntriesByName('park-procedural-mole-ready').length).toBeGreaterThan(0)
  }finally{store.installStaticPark(snapshot)}
},30000)

it('형식이 다르거나 잘린 사전 생성 파일은 사용하지 않는다',async()=>{
  const {decodeStaticPark}=await import('../../src/park-renewal/static/codec')
  expect(()=>decodeStaticPark(new ArrayBuffer(4))).toThrow()
  expect(()=>decodeStaticPark(new ArrayBuffer(16))).toThrow('header')
})

it('배열별 정렬·길이·타입을 검증하고 독립 버퍼에서도 공유 참조를 유지한다',async()=>{
  const {encodeStaticPark,decodeStaticPark}=await import('../../src/park-renewal/static/codec')
  const geometry=new BufferGeometry()
  geometry.setAttribute('position',new BufferAttribute(new Float32Array([1,2,3]),3))
  geometry.setIndex(new BufferAttribute(new Uint16Array([0]),1))
  const retaining=new BufferGeometry().setIndex(new BufferAttribute(new Uint32Array([0]),1))
  const snapshot:StaticPark={forestField:new Float64Array([Math.PI,-0,1/3]),plantingField:new Float32Array([.25]),
    ground:{grass:geometry,paving:geometry,retaining,pavingBoundary:{positions:[],indices:[]}},
    groundIndex:{triangles:[],bins:new Map()},curbs:{paths:[],geometry},hillEdges:[],
    guards:{guardRuns:[],guardPosts:[],guardPostRailBases:[]},jumpFence:{runs:[],sections:[]},guardArt:{hill:{},jump:{}}}
  const encoded=encodeStaticPark(snapshot),archive=encoded.buffer as ArrayBuffer,restored=decodeStaticPark(archive)
  expect(restored.ground.grass).toBe(restored.ground.paving)
  expect(restored.curbs.geometry).toBe(restored.ground.grass)
  for(const array of[restored.forestField,restored.plantingField,restored.ground.grass.getAttribute('position').array,restored.ground.grass.index!.array,restored.ground.retaining.index!.array]){
    expect(array.buffer).not.toBe(archive)
    expect(array.byteOffset).toBe(0)
    expect(array.buffer.byteLength).toBe(array.byteLength)
  }
  expect(Buffer.from(encodeStaticPark(restored)).equals(Buffer.from(encoded))).toBe(true)
  const mutate=(change:(node:{type:string;offset:number;length:number})=>void)=>{
    const header=new DataView(archive),oldBase=header.getUint32(8,true)
    const metadata=JSON.parse(new TextDecoder().decode(encoded.subarray(12,12+header.getUint32(4,true))))
    change(metadata.nodes.find((node:{kind:string;type:string})=>node.kind==='typed'&&node.type==='Float64Array'))
    const json=new TextEncoder().encode(JSON.stringify(metadata)),base=Math.ceil((12+json.byteLength)/8)*8
    const damaged=new Uint8Array(base+encoded.byteLength-oldBase),view=new DataView(damaged.buffer)
    view.setUint32(0,header.getUint32(0,true),true);view.setUint32(4,json.byteLength,true);view.setUint32(8,base,true)
    damaged.set(json,12);damaged.set(encoded.subarray(oldBase),base)
    return damaged.buffer
  }
  expect(()=>decodeStaticPark(mutate(node=>node.offset++))).toThrow('array alignment')
  expect(()=>decodeStaticPark(mutate(node=>node.offset=-8))).toThrow('buffer')
  expect(()=>decodeStaticPark(mutate(node=>node.length=Number.MAX_SAFE_INTEGER))).toThrow('buffer')
  expect(()=>decodeStaticPark(mutate(node=>node.length=.5))).toThrow('buffer')
  expect(()=>decodeStaticPark(mutate(node=>node.type='toString'))).toThrow('array type')
})

it('압축 파일을 설치하며 HTTP·손상 오류는 원본 생성 경로로 복구한다',async()=>{
  const {snapshot}=await import('../../src/park-renewal/static/snapshot')
  const {encodeStaticPark}=await import('../../src/park-renewal/static/codec')
  const {loadStaticPark}=await import('../../src/park-renewal/static/load')
  const store=await import('../../src/park-renewal/static/store')
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{})
  const compressed=gzipSync(encodeStaticPark(snapshot))
  // Network chunk boundaries are independent of typed-array alignment.
  const body=new ReadableStream({start(controller){
    let offset=0
    for(const end of[1,7,31,compressed.byteLength]){controller.enqueue(compressed.subarray(offset,end));offset=end}
    controller.close()
  }})
  const fetcher=vi.fn().mockResolvedValue(new Response(body))
  vi.stubGlobal('fetch',fetcher)
  try {
    await loadStaticPark('/assets/park.bin.gz')
    expect(performance.getEntriesByName('park-static-ready').length).toBeGreaterThan(0)
    expect(store.staticPark?.forestField).toEqual(snapshot.forestField)
    const installed=store.staticPark
    fetcher.mockResolvedValueOnce(new Response('',{status:404})).mockResolvedValueOnce(new Response(new ArrayBuffer(16)))
    await loadStaticPark('/missing');await loadStaticPark('/damaged')
    expect(warn).toHaveBeenCalledTimes(2)
    expect(store.staticPark).toBe(installed)
    expect(performance.getEntriesByName('park-static-fallback').length).toBeGreaterThanOrEqual(2)
  }finally{vi.unstubAllGlobals();warn.mockRestore()}
})
