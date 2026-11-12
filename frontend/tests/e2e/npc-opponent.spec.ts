import {expect,test} from '@playwright/test'
const practice={name:'박영감',npcUserId:'9001',actorId:'opponent-9001',difficulty:'HARD',phase:'ARRIVING',bet:0,thinking:false,speech:'',speechSource:'FIXED',analysis:{source:'LOCAL',blackEstimate:null,advantage:'UNKNOWN'},analysisNote:'',snapshot:{gameId:'table-opponent',tableId:'table1',version:0,blackUserId:101,whiteUserId:9001,turnUserId:101,winnerUserId:null,turnDeadline:new Date(Date.now()+30000).toISOString(),endedAt:null,endReason:null,board:{board:Array.from({length:15},()=>Array(15).fill(0)),moveCount:0,outcome:'PLAYING',forbiddenMoves:[]}}}
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
