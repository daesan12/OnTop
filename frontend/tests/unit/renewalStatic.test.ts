import {expect,it,vi} from 'vitest'
import {gzipSync,gunzipSync} from 'node:zlib'
import {Buffer} from 'node:buffer'

it('사전 생성 지형·높이·난간은 원본 비트와 이동·충돌 판정을 보존한다',async()=>{
  const {snapshot}=await import('../../src/park-renewal/static/snapshot')
  const {encodeStaticPark,decodeStaticPark}=await import('../../src/park-renewal/static/codec')
  const encoded=encodeStaticPark(snapshot),compressed=gzipSync(encoded)
  const bytes=gunzipSync(compressed),decoded=decodeStaticPark(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))
  const equalBytes=(a:Uint8Array,b:Uint8Array)=>expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
  // Covers Float64 fields, every geometry attribute/index/bound, spatial bins,
  // curb/guard paths and exact post heights, including sharing between meshes.
  equalBytes(encoded,encodeStaticPark(decoded))
  expect(decoded.ground.grass.getAttribute('position').array).toBe(decoded.ground.paving.getAttribute('position').array)

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
  const actual=probe(await import('../../src/park-renewal/plan'),await import('../../src/park-renewal/groundSurface'),await import('../../src/park-renewal/surfaceHeight'),await import('../../src/park-renewal/travelMotion'),await import('../../src/park-renewal/motionPlan'))
  expect(actual).toEqual(expected)
  expect(samples.length).toBeGreaterThan(3000)
  console.log('static-equivalence',{samples:samples.length,raw:encoded.byteLength,gzip:compressed.byteLength})
},180000)

it('형식이 다르거나 잘린 사전 생성 파일은 사용하지 않는다',async()=>{
  const {decodeStaticPark}=await import('../../src/park-renewal/static/codec')
  expect(()=>decodeStaticPark(new ArrayBuffer(4))).toThrow()
  expect(()=>decodeStaticPark(new ArrayBuffer(16))).toThrow('header')
})

it('압축 파일을 설치하며 HTTP·손상 오류는 원본 생성 경로로 복구한다',async()=>{
  const {snapshot}=await import('../../src/park-renewal/static/snapshot')
  const {encodeStaticPark}=await import('../../src/park-renewal/static/codec')
  const {loadStaticPark}=await import('../../src/park-renewal/static/load')
  const store=await import('../../src/park-renewal/static/store')
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{})
  const compressed=gzipSync(encodeStaticPark(snapshot))
  const fetcher=vi.fn().mockResolvedValue(new Response(compressed))
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
