import {afterAll,describe,it,expect,vi} from 'vitest'
vi.stubEnv('MODE','park-renewal-integration')
const {renewalTables,renewalMapping,renewalInReach,renewalAnchors}=await import('../../src/park-renewal/runtime/placements')
const {BENCH_SEAT_HEIGHTS}=await import('../../src/park/mapConfig')
const {tableSeats}=await import('../../src/config/table-seats')
const {canReachTable}=await import('../../src/features/tableLobby/tableReach')
const {LIVE_MAP_IDENTITY,MapAdmission}=await import('../../src/network/mapContract')
const {constructionSites,canReachConstruction}=await import('../../src/features/construction/model')
afterAll(()=>vi.unstubAllEnvs())
describe('새 공원 기존 기능 연결 계약',()=>{
 it('벤치 사용 좌표와 아바타 보정은 실제 좌판 높이에 한 번만 맞춘다',()=>{for(const r of renewalAnchors.filter(r=>r.kind==='bench'&&r.status==='mapped'))for(const s of r.seats!){expect(s.use.y-.8+BENCH_SEAT_HEIGHTS.get(r.id)!).toBeCloseTo(s.contactY,6)}})
 it('광장 시설 네 곳은 각 모델의 정면에서 개별 상호작용하고 다른 높이에서는 열리지 않는다',()=>{
  const rows=renewalAnchors.filter(r=>r.kind==='interaction'&&['feedback-mailbox','layout-photo','layout-shop','layout-drink'].includes(r.id))
  expect(rows).toHaveLength(4)
  for(const r of rows){const p=r.reach!,yaw=r.yaw+(r.id==='layout-drink'?Math.PI:0),dx=p.x-r.position![0],dz=p.z-r.position![2];expect(Math.hypot(dx,dz)).toBeGreaterThan(2.5);expect(Math.hypot(dx,dz)).toBeLessThan(3.5);expect(dx*Math.sin(yaw)+dz*Math.cos(yaw)).toBeCloseTo(Math.hypot(dx,dz),5);expect(renewalInReach('interaction',r.id,p)).toBe(true);expect(renewalInReach('interaction',r.id,{...p,y:p.y+5})).toBe(false);expect(renewalInReach('interaction',r.id,{...p,x:p.x+20})).toBe(false)}
  const [a,b]=['feedback-mailbox','layout-photo'].map(id=>rows.find(r=>r.id===id)!.reach!)
  expect(Math.hypot(a!.x-b!.x,a!.z-b!.z)).toBeGreaterThan(5)
 })
 it('실물 13개만 노출하고 미배치 5개 ID는 상호작용에서 제외한다',()=>{expect(renewalTables).toHaveLength(13);for(const id of['table-11','table-12','table-13','table-17','table-18']){expect(renewalTables.some(t=>t.id===id)).toBe(false);expect(renewalInReach('table',id,{x:0,y:0,z:0})).toBe(false)}})
 it('높고 회전된 팔각정의 좌석 방향과 높이를 그대로 사용한다',()=>{for(const t of renewalTables){const seats=tableSeats(t);for(const [i,p]of t.seatUse!.entries()){expect(seats[i]!.yaw).toBe(p.yaw);expect(t.position[0]+seats[i]!.x).toBeCloseTo(p.x,6);expect(t.position[2]+seats[i]!.z).toBeCloseTo(p.z,6);expect(canReachTable({x:p.x,y:t.floorY!+.8,z:p.z},t.id)).toBe(true)}}})
 it('공사 중 16곳은 전부 E 안내 범위가 있고 기존 뽑기·복권 UI 진입점도 유지한다',()=>{expect(renewalMapping.world.constructionSites).toHaveLength(16);for(const s of renewalMapping.world.constructionSites){const[x,y,z]=s.reachPosition;expect(canReachConstruction({x,y,z},s.id)).toBe(true);expect(canReachConstruction({x,y:y+20,z},s.id)).toBe(false)}expect(constructionSites.some(s=>s.id==='layout-shop')).toBe(true);expect(constructionSites.some(s=>s.id==='layout-drink')).toBe(true)})
 it('기존 dev 맵과 새 로컬 맵의 버전이 다르면 접속을 거부한다',()=>{const admission=new MapAdmission();expect(LIVE_MAP_IDENTITY.mapId).toBe('park-renewal-local');expect(admission.connected({...LIVE_MAP_IDENTITY,mapId:'park'})).toBe(false);expect(admission.allowed).toBe(false);const valid=new MapAdmission();expect(valid.connected(LIVE_MAP_IDENTITY)).toBe(true);expect(valid.confirmed(LIVE_MAP_IDENTITY,true)).toBe(true)})
})
