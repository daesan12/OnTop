import {expect,test} from '@playwright/test'
const practice={name:'박영감',npcUserId:'9001',actorId:'opponent-9001',difficulty:'HARD',phase:'ARRIVING',bet:0,thinking:false,speech:'',speechSource:'FIXED',analysis:{source:'LOCAL',blackEstimate:null,advantage:'UNKNOWN'},analysisNote:'',snapshot:{gameId:'table-opponent',tableId:'table1',version:0,blackUserId:101,whiteUserId:9001,turnUserId:101,winnerUserId:null,turnDeadline:new Date(Date.now()+30000).toISOString(),endedAt:null,endReason:null,board:{board:Array.from({length:15},()=>Array(15).fill(0)),moveCount:0,outcome:'PLAYING',forbiddenMoves:[]}}}

test('idle resident status polls slowly and resumes when the page becomes visible', async ({page}) => {
 const polls: number[] = []
 await page.clock.install()
 await page.route('**/api/v1/ai/companions/status', route => {
  polls.push(Date.now())
  return route.fulfill({json:{actors:[],practice:null,commentary:[],waitSeconds:-1}})
 })
 await page.goto('/tests/fixtures/npc-opponent.html')
 await expect.poll(() => polls.length, { timeout: 10_000 }).toBe(2)
 expect(polls[1] - polls[0]).toBeGreaterThanOrEqual(4_900)

 await page.evaluate(() => {
  Object.defineProperty(document, 'hidden', { configurable:true, value:true })
  document.dispatchEvent(new Event('visibilitychange'))
 })
 await page.clock.fastForward(10_000)
 expect(polls).toHaveLength(2)
 await page.evaluate(() => {
  Object.defineProperty(document, 'hidden', { configurable:true, value:false })
  document.dispatchEvent(new Event('visibilitychange'))
 })
 await expect.poll(() => polls.length, { timeout: 2_000 }).toBe(3)
})

for(const entry of ['manual','automatic'] as const){
 test(`${entry} opponent accepts a JSON invitation/first black move instead of HTTP 415`,async({page},info)=>{
  let active=entry==='automatic',moves=0
  const headers:Record<string,string>[]=[]
  const p={...practice,phase:'PLAYING',snapshot:{...practice.snapshot,turnDeadline:new Date(Date.now()+30000).toISOString()}}
  await page.route('**/api/v1/ai/companions/status',r=>r.fulfill({json:{actors:[],practice:active?{...p,snapshot:{...p.snapshot,version:moves,board:{...p.snapshot.board,moveCount:moves}}}:null,commentary:[]}}))
  await page.route('**/api/v1/ai/companions/{invite,action}',r=>{
   const h=r.request().headers();headers.push(h)
   if(!h['content-type']?.startsWith('application/json'))return r.fulfill({status:415,json:{error:'Unsupported Media Type'}})
   if(r.request().url().endsWith('/invite')){active=true;return r.fulfill({json:p})}
   expect(r.request().postDataJSON()).toMatchObject({kind:'place',gameId:'table-opponent',version:0,x:7,y:7})
   moves++;return r.fulfill({json:{accepted:true}})
  })
  await page.goto('/tests/fixtures/npc-opponent.html')
  if(entry==='manual'){
   await page.getByRole('button',{name:'오목 AI 상대 선택',exact:true}).click()
   await page.getByRole('button',{name:'박영감(어려움)',exact:true}).click()
  }
  await expect(page.getByLabel('오목판 연결 상태')).toHaveText('table-opponent')
  await page.getByRole('button',{name:'검수용 흑돌 착수'}).click()
  await expect(page.getByLabel('검수용 착수 수')).toHaveText('1')
  expect(headers).toHaveLength(entry==='manual'?2:1)
  for(const h of headers)expect(h['content-type']).toContain('application/json')
  await page.screenshot({path:info.outputPath(`${entry}-json-first-move.png`),animations:'disabled'})
 })
}
test('a same-difficulty actor elsewhere does not block invitation; transient status loss preserves arrival until seated',async({page},info)=>{
 let phase='NONE',fail=false,invites=0
 const other={id:'opponent-other',name:'박영감',channelId:'fixture-channel',role:'OPPONENT',difficulty:'HARD',action:'PLAY_OMOK',x:10,y:0,z:0,seated:true,moving:false}
 await page.route('**/api/v1/ai/companions/status',route=>fail?route.fulfill({status:503,json:{code:'UNAVAILABLE'}}):route.fulfill({json:{actors:[other],actorVersion:Date.now(),practice:phase==='NONE'?null:{...practice,phase},commentary:[],waitSeconds:-1}}))
 await page.route('**/api/v1/ai/companions/invite',route=>{invites++;phase='ARRIVING';return route.fulfill({json:practice})})
 await page.goto('/tests/fixtures/npc-opponent.html')
 await page.getByRole('button',{name:'오목 AI 상대 선택',exact:true}).click()
 await expect(page.getByRole('button',{name:'박영감(어려움)',exact:true})).toBeEnabled()
 await page.getByRole('button',{name:'박영감(어려움)',exact:true}).click()
 const arriving=page.getByRole('region',{name:'오목 상대 입장'})
 await expect(arriving).toBeVisible()
 await expect(page.getByLabel('오목판 연결 상태')).toHaveText('대결 입장 대기')
 fail=true
 await expect(arriving.getByRole('alert')).toContainText('다시 연결하고 있어요')
 await expect(arriving).toBeVisible()
 await page.screenshot({path:info.outputPath('arrival-status-retry.png')})
 phase='PLAYING';fail=false
 await expect(arriving).toHaveCount(0)
 await expect(page.getByLabel('오목판 연결 상태')).toHaveText('table-opponent')
 expect(invites).toBe(1)
})
test('an arriving opponent can be cancelled without starting a board',async({page})=>{
 let pending=true
 const bodies:unknown[]=[]
 await page.route('**/api/v1/ai/companions/status',route=>route.fulfill({json:{actors:[],actorVersion:Date.now(),practice:pending?practice:null,commentary:[]}}))
 await page.route('**/api/v1/ai/companions/action',route=>{bodies.push(route.request().postDataJSON());pending=false;return route.fulfill({json:{stopped:true}})})
 await page.goto('/tests/fixtures/npc-opponent.html')
 await page.getByRole('button',{name:'호출 취소',exact:true}).click()
 await expect(page.getByRole('region',{name:'오목 상대 입장'})).toHaveCount(0)
 expect(bodies).toHaveLength(1);expect(bodies[0]).toMatchObject({kind:'stop',gameId:'table-opponent'})
 await expect(page.getByLabel('오목판 연결 상태')).toHaveText('대결 입장 대기')
})

for(const [winner,label] of [[101,'승리'],[9001,'패배'],[null,'무승부']] as const){
 test(`finished NPC game uses the shared ${label} result popup and returns to waiting`,async({page},info)=>{
  let active=true
  const ended={...practice,phase:'PLAYING',snapshot:{...practice.snapshot,version:27,endedAt:new Date().toISOString(),turnUserId:null,winnerUserId:winner}}
  const requests:unknown[]=[]
  await page.route('**/api/v1/ai/companions/status',r=>r.fulfill({json:{actors:[],practice:active?ended:null,commentary:[]}}))
  await page.route('**/api/v1/ai/companions/action',r=>{requests.push(r.request().postDataJSON());active=false;return r.fulfill({json:{stopped:true}})})
  await page.goto('/tests/fixtures/npc-opponent.html')
  const result=page.getByRole('dialog',{name:'경기 결과',exact:true})
  await expect(result.getByRole('heading',{name:label,exact:true})).toBeVisible()
  await expect(result.getByLabel('참가자 결과')).toContainText('박영감')
  await expect(result).toContainText('엽전 변동 없음')
  await expect(page.getByText('대결이 끝났어요',{exact:true})).toHaveCount(0)
  await expect(result.getByRole('button',{name:'정산 결과 확인'})).toHaveCount(0)
  if(winner===101)await page.screenshot({path:info.outputPath('npc-victory-result.png'),animations:'disabled'})
  await result.getByRole('button',{name:'결과 창 닫기'}).click()
  await page.getByRole('button',{name:'경기 결과 다시 보기'}).click()
  await result.getByRole('button',{name:'다음 판 준비'}).click()
  await expect(result).toHaveCount(0)
  await expect(page.getByLabel('오목판 연결 상태')).toHaveText('대결 입장 대기')
  expect(requests).toHaveLength(1);expect(requests[0]).toMatchObject({kind:'stop',gameId:'table-opponent'})
 })
}

test('cleanup failure keeps the result for retry, including after automatic server release',async({page})=>{
 let active=true
 const ended={...practice,phase:'PLAYING',snapshot:{...practice.snapshot,endedAt:new Date().toISOString(),winnerUserId:101}}
 await page.route('**/api/v1/ai/companions/status',r=>r.fulfill({json:{actors:[],practice:active?ended:null,commentary:[]}}))
 await page.route('**/api/v1/ai/companions/action',r=>r.fulfill({status:503,json:{code:'UNAVAILABLE'}}))
 await page.route('**/fixture/table-leave',r=>r.fulfill({json:{left:true}}))
 await page.goto('/tests/fixtures/npc-opponent.html')
 const result=page.getByRole('dialog',{name:'경기 결과',exact:true})
 await result.getByRole('button',{name:'다음 판 준비'}).click()
 await expect(result.getByRole('alert')).toContainText('처리하지 못했어요')
 active=false
 await expect(page.getByLabel('오목판 연결 상태')).toHaveText('대결 입장 대기',{timeout:10_000})
 await expect(result).toBeVisible()
 await result.getByRole('button',{name:'자리에서 일어나기'}).click()
 await expect(result).toHaveCount(0)
})

test('table leave remains available when NPC cleanup fails, and a failed leave can be retried',async({page})=>{
 const ended={...practice,phase:'PLAYING',snapshot:{...practice.snapshot,endedAt:new Date().toISOString(),winnerUserId:101}}
 let allowLeave=false,stops=0
 await page.route('**/api/v1/ai/companions/status',r=>r.fulfill({json:{actors:[],practice:ended,commentary:[]}}))
 await page.route('**/api/v1/ai/companions/action',r=>{stops++;return r.fulfill({status:503,json:{code:'UNAVAILABLE'}})})
 await page.route('**/fixture/table-leave',r=>r.fulfill({status:allowLeave?200:503,json:{left:allowLeave}}))
 await page.goto('/tests/fixtures/npc-opponent.html')
 const result=page.getByRole('dialog',{name:'경기 결과',exact:true})
 await result.getByRole('button',{name:'다음 판 준비'}).click()
 await expect(result.getByRole('alert')).toContainText('처리하지 못했어요')
 await result.getByRole('button',{name:'자리에서 일어나기'}).click()
 await expect(result.getByRole('alert')).toContainText('자리에서 일어나지 못했어요')
 allowLeave=true
 await result.getByRole('button',{name:'자리에서 일어나기'}).click()
 await expect(result).toHaveCount(0);expect(stops).toBe(1)
})

test('a new human game clears the cached NPC result and it does not reappear',async({page})=>{
 let active=true,polls=0
 const ended={...practice,phase:'PLAYING',snapshot:{...practice.snapshot,endedAt:new Date().toISOString(),winnerUserId:101}}
 await page.route('**/api/v1/ai/companions/status',r=>{polls++;return r.fulfill({json:{actors:[],practice:active?ended:null,commentary:[]}})})
 await page.goto('/tests/fixtures/npc-opponent.html')
 const result=page.getByRole('dialog',{name:'경기 결과',exact:true})
 await expect(result).toBeVisible();active=false
 await expect(page.getByLabel('오목판 연결 상태')).toHaveText('대결 입장 대기',{timeout:10_000})
 await result.getByRole('button',{name:'결과 창 닫기'}).click()
 await page.getByRole('button',{name:'사람과 새 판 검수'}).click()
 await expect(page.getByRole('button',{name:'경기 결과 다시 보기'})).toHaveCount(0)
 // Emulate an old terminal status arriving again after the PvP start cleared the cache.
 active=true;const before=polls
 await expect.poll(()=>polls,{timeout:10_000}).toBeGreaterThan(before)
 await expect(page.getByLabel('오목판 연결 상태')).toHaveText('대결 입장 대기')
 active=false;const late=polls
 await expect.poll(()=>polls,{timeout:10_000}).toBeGreaterThan(late)
 await page.getByRole('button',{name:'새 판 상태 해제'}).click()
 await expect(result).toHaveCount(0)
})
