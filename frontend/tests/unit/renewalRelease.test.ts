import {readFileSync} from 'node:fs'
import {afterAll,expect,it,vi} from 'vitest'
vi.stubEnv('MODE','park-renewal-release')
const {LIVE_MAP_IDENTITY}=await import('../../src/network/mapContract')
const {packagedParkBindings,parkBindingsUrl,loadParkBindings}=await import('../../src/park/runtime/deployment')
const {default:binding}=await import('../../generated/park-renewal/park-bindings.local.json')
afterAll(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})

it('배포 모드에서도 새 맵을 확인하고 기존 서비스 배치를 잘못 사용하지 않는다',()=>{
 expect(LIVE_MAP_IDENTITY).toEqual({mapId:'park-renewal-local',schemaVersion:2,mapVersion:binding.mappingVersion})
 expect(packagedParkBindings(false,'dev.on-top.world')).toBeUndefined()
 expect(parkBindingsUrl('park-renewal-release',false,'dev.on-top.world')).toBe('/generated/park-renewal/park-bindings.local.json')
})
it('정적 배포에 포함된 새 binding 파일에서 기존 테이블 ID를 읽는다',async()=>{
 const request=vi.fn(async()=>({ok:true,json:async()=>binding}))
 vi.stubGlobal('fetch',request)
 const signal=new AbortController().signal
 expect(await loadParkBindings(signal)).toEqual(binding)
 expect(request).toHaveBeenCalledWith('/generated/park-renewal/park-bindings.local.json',{signal,cache:'no-store'})
 expect(binding.bindings.some(b=>b.anchorId==='table-14')).toBe(true)
})
it('새 배포 파일이 없으면 기존 맵 배치로 조용히 대체하지 않고 입장을 중단한다',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status:404})))
 await expect(loadParkBindings(new AbortController().signal)).rejects.toThrow('공원 배치 설정 파일을 읽을 수 없습니다.')
})

it('서비스 장면에는 미완성 공포 프리뷰의 조작기와 내부 진입점이 없다',()=>{const source=readFileSync('src/park-renewal/runtime/RenewalWorld.tsx','utf8');expect(source).not.toContain('HorrorZone');expect(source).not.toContain('CameraController');expect(source).not.toContain('setHorrorOpen')})
