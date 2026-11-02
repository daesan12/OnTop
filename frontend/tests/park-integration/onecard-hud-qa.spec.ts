import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot, tableId } from '../e2e/contractFixture'
import type { Card, Hand } from '../../src/game/onecard/protocol'
import { choose3DCard } from '../e2e/onecardHeldInput'

const errors=new WeakMap<Page,string[]>()
test.beforeEach(({page})=>{
  const messages:string[]=[]; errors.set(page,messages)
  page.on('pageerror',e=>messages.push(e.message))
  page.on('console',m=>{if(m.type()==='error')messages.push(m.text())})
})
test.afterEach(async({page})=>{
  expect(errors.get(page)).toEqual([])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})
async function load(page:Page){
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect.poll(()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).sceneReady()),{timeout:90000}).toBe(true)
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
  await page.evaluate(async()=>(await import('/tests/e2e/sceneProbe.ts' as string)).visualTime(.5))
}
async function start(page:Page){
  const server=await fixture(page,{generatedPark:true,omok:true,onecard:2,manualLobby:true,tabletServer:true,spectatorEvents:true,onecardPranks:true})
  await load(page)
  await page.getByRole('button',{name:'E 테이블에 앉기',exact:true}).click()
  const tablet=page.getByRole('dialog',{name:'게임 태블릿',exact:true})
  await tablet.getByRole('button',{name:/원카드/}).click(); await tablet.getByLabel('1인 참가비').fill('1')
  await tablet.getByRole('button',{name:'선택하고 준비하기'}).click()
  await tablet.getByRole('checkbox',{name:'참가 금액을 확인했어요'}).check()
  await tablet.getByRole('button',{name:'준비 완료',exact:true}).click(); server.readyTabletOthers(true)
  await tablet.getByRole('button',{name:'게임 시작',exact:true}).click()
  await expect(page.getByLabel('나만 볼 수 있는 카드').getByRole('button')).toHaveCount(7)
  return server
}
function hand(count:number):Hand{
  const cards:Card[]=(['hearts','diamonds','clubs','spades'] as const).flatMap(suit=>
    ['A','2','3','4','5','6','7','8','9','10','J','Q','K'].map(rank=>({id:`${suit}-${rank}`,suit,rank})))
    .filter(card=>card.id!=='hearts-5').slice(0,count)
  return {userId:'101',hand:cards,playableCardIds:cards.filter(card=>card.suit==='hearts'||card.rank==='5').map(card=>card.id),canDraw:true}
}

test('동일한 크기의 채팅이 기록·입력·긴 손패를 가리지 않고 하단 행동을 유지한다',async({page})=>{
  const server=await start(page), chat=page.getByRole('region',{name:'경기 채팅',exact:true})
  const cards=page.getByLabel('나만 볼 수 있는 카드').getByRole('button')
  for(const size of [{width:1920,height:1080},{width:1366,height:768},{width:1280,height:720},{width:800,height:600},{width:390,height:844}]){
    await page.setViewportSize(size)
    for(const count of [7,17,39]){
      server.cardSnapshot({turnDeadline:new Date(Date.now()+30000).toISOString(),drawCount:44-count,
        players:server.cardState().players.map((p,i)=>({...p,cardCount:i===0?count:7}))},hand(count))
      await expect(cards).toHaveCount(count); await page.mouse.move(1,1)
      const comparison=await page.evaluate(async()=>(await import('/tests/park-integration/onecardChatProbe.ts' as string)).compareParkChat())
      expect(comparison.actual.width).toBeCloseTo(comparison.common.width,0)
      expect(comparison.actual.height).toBeCloseTo(comparison.common.height,0)
      expect(comparison.actual.x).toBeCloseTo(comparison.common.x,0)
      expect(comparison.actual.y+comparison.actual.height).toBeCloseTo(comparison.common.y+comparison.common.height,0)
      const tray=(await page.locator('.onecard-command-tray').boundingBox())!
      expect(tray.x+tray.width/2).toBeCloseTo(size.width/2,0)
      if(count===7) await screenshot(page,`onecard-hud-${size.width}`,'disabled')
      await expect.poll(async()=>{
        const bounds=(await chat.boundingBox())!
        return cards.evaluateAll((nodes,b)=>nodes.every(node=>{
          const r=node.getBoundingClientRect()
          return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight
            &&(r.right<=b.x||r.left>=b.x+b.width||r.bottom<=b.y||r.top>=b.y+b.height)
        }),bounds)
      }).toBe(true)
      const fan=(await page.getByLabel('나만 볼 수 있는 카드').boundingBox())!
      expect(fan.x+fan.width/2).toBeCloseTo(size.width/2,0)
      const cardCenter=await cards.evaluateAll(nodes=>{
        const boxes=nodes.map(node=>node.getBoundingClientRect())
        return (Math.min(...boxes.map(box=>box.left))+Math.max(...boxes.map(box=>box.right)))/2
      })
      expect(cardCenter).toBeCloseTo(size.width/2,0)
      await expect(page.getByRole('button',{name:'드로우',exact:true})).toBeInViewport()
      await expect(page.getByRole('button',{name:'뿅망치 들기',exact:false})).toBeInViewport()
      const chatBounds=(await chat.boundingBox())!
      expect(await page.locator('.onecard-primary-actions button').evaluateAll((nodes,b)=>nodes.every(node=>{
        const r=node.getBoundingClientRect()
        return r.right<=b.x||r.left>=b.x+b.width||r.bottom<=b.y||r.top>=b.y+b.height
      }),chatBounds)).toBe(true)
    }
    const before=(await chat.boundingBox())!
    await chat.getByRole('button',{name:'채팅 기록 보기',exact:true}).click()
    for(let i=0;i<12;i++) server.spectatorEvent('chat',{text:`긴 대화 기록 ${i}`,senderUserId:'102'})
    await chat.getByRole('button',{name:'채팅 입력창 열기',exact:true}).click()
    await chat.getByRole('textbox').fill('채팅과 손패를 함께 확인해요')
    await expect(chat.getByRole('textbox')).toBeFocused()
    expect((await chat.boundingBox())!.width).toBeCloseTo(before.width,0)
    expect((await chat.boundingBox())!.x).toBeCloseTo(before.x,0)
    const expanded=await page.evaluate(async()=>(await import('/tests/park-integration/onecardChatProbe.ts' as string)).compareParkChat())
    expect(expanded.actual.width).toBeCloseTo(expanded.common.width,0)
    expect(expanded.actual.height).toBeCloseTo(expanded.common.height,0)
    expect(expanded.actual.y+expanded.actual.height).toBeCloseTo(before.y+before.height,0)
    await expect.poll(()=>cards.evaluateAll((nodes,b)=>nodes.every(node=>{
      const r=node.getBoundingClientRect()
      return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight
        &&(r.right<=b.x||r.left>=b.x+b.width||r.bottom<=b.y||r.top>=b.y+b.height)
    }),expanded.actual)).toBe(true)
    const expandedTray=(await page.locator('.onecard-command-tray').boundingBox())!
    expect(expandedTray.x+expandedTray.width/2).toBeCloseTo(size.width/2,0)
    const expandedFan=(await page.getByLabel('나만 볼 수 있는 카드').boundingBox())!
    expect(expandedFan.x+expandedFan.width/2).toBeCloseTo(size.width/2,0)
    await expect(page.getByRole('button',{name:'드로우',exact:true})).toBeInViewport()
    expect(expandedTray.x+expandedTray.width<=expanded.actual.x||expandedTray.x>=expanded.actual.x+expanded.actual.width
      ||expandedTray.y+expandedTray.height<=expanded.actual.y||expandedTray.y>=expanded.actual.y+expanded.actual.height).toBe(true)
    await screenshot(page,`onecard-expanded-chat-${size.width}`,'disabled')
    await expect(chat.getByRole('log')).toContainText('긴 대화 기록 11')
    await chat.getByRole('textbox').press('Escape')
  }
  await page.setViewportSize({width:1920,height:1080})
  server.cardSnapshot({turnDeadline:new Date(Date.now()+30000).toISOString(),drawCount:37,
    players:server.cardState().players.map(p=>({...p,cardCount:7}))},hand(7))
  await expect(cards).toHaveCount(7)
  await cards.first().click()
  const submit=page.getByRole('button',{name:'하트 A 내기',exact:true})
  await expect(submit).toBeEnabled(); await screenshot(page,'onecard-selected-action')
  const played=hand(7).hand[0]!
  server.cardReply({kind:'play',cardId:played.id},{turnUserId:'102',turnCount:2,topCard:played,lastAttack:played,attackTotal:3,
    players:server.cardState().players.map(p=>({...p,cardCount:p.userId==='101'?6:7}))},
    {...hand(7),hand:hand(7).hand.slice(1),playableCardIds:[],canDraw:false})
  await submit.click()
  await expect.poll(()=>server.sent.filter(m=>m.type==='GAME_ACTION_SEND').length).toBe(1)
  await expect(cards).toHaveCount(6)
})

test('중앙 손패의 Q를 위로 드래그하면 한 번만 내고 상대 차례를 표시한다',async({page})=>{
  await page.setViewportSize({width:1280,height:720})
  const server=await start(page)
  const queen:Card={id:'hearts-Q',suit:'hearts',rank:'Q'}, king:Card={id:'spades-K',suit:'spades',rank:'K'}
  server.cardSnapshot({turnCount:2,turnDeadline:new Date(Date.now()+30000).toISOString(),
    players:server.cardState().players.map(p=>({...p,cardCount:p.userId==='101'?2:p.cardCount}))},
    {userId:'101',hand:[queen,king],playableCardIds:[queen.id],canDraw:true})
  const card=page.getByLabel('나만 볼 수 있는 카드').getByRole('button',{name:'하트 Q · 방향 반전',exact:true})
  await expect(card).toBeEnabled()
  server.cardReply({kind:'play',cardId:queen.id},{direction:-1,turnUserId:'102',turnCount:3,topCard:queen,
    players:server.cardState().players.map(p=>({...p,cardCount:p.userId==='101'?1:p.cardCount}))},
    {userId:'101',hand:[king],playableCardIds:[],canDraw:false})
  await card.hover()
  await card.evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished)))
  const box=(await card.boundingBox())!, x=box.x+box.width/2, y=box.y+box.height*.45
  await page.mouse.move(x,y); await page.mouse.down(); await page.mouse.move(x,y-130,{steps:9})
  await expect(card).toHaveAttribute('data-drop-ready','true')
  await page.mouse.up()
  await expect(page.getByLabel('나만 볼 수 있는 카드').getByRole('button')).toHaveCount(1)
  await expect(page.getByRole('timer',{name:'차례 남은 시간',exact:true})).toContainText('참가자 2의 차례')
  expect(server.sent.filter(m=>m.type==='GAME_ACTION_SEND').map(m=>m.payload.input)).toEqual([{kind:'play',cardId:queen.id}])
  await screenshot(page,'onecard-queen-opponent-turn','disabled')
})

test('스페이드 A는 URL·QR 장식 없는 카드로 표시되고 선택할 수 있다',async({page})=>{
  const server=await start(page)
  const ace:Card={id:'spades-A',suit:'spades',rank:'A'}
  server.cardSnapshot({activeSuit:'spades',topCard:{id:'spades-5',suit:'spades',rank:'5'},
    players:server.cardState().players.map(p=>({...p,cardCount:p.userId==='101'?1:p.cardCount})),
    turnDeadline:new Date(Date.now()+30000).toISOString()},
    {userId:'101',hand:[ace],playableCardIds:[ace.id],canDraw:true})
  const card=page.getByLabel('나만 볼 수 있는 카드').getByRole('button',{name:/스페이드 A/})
  await expect(card).toBeVisible()
  const image=card.locator('.onecard-face-art')
  await expect(image).toHaveAttribute('src','/art/onecard/classic/S-A.svg')
  await expect.poll(()=>image.evaluate(node=>(node as HTMLImageElement).naturalWidth)).toBe(240)
  const svg=await (await page.request.get('/art/onecard/classic/S-A.svg')).text()
  expect(svg).not.toMatch(/www\.me\.uk|\/cards\/|<text[ >]|stroke-dasharray/)
  await card.click()
  await expect(page.getByRole('button',{name:'스페이드 A 내기',exact:true})).toBeEnabled()
  await screenshot(page,'onecard-spade-ace-redrawn','disabled')
})

test('내 차례 마지막 5초만 흔들림·화면 테두리 경고를 표시하고 모션 감소와 종료를 따른다',async({page})=>{
  const server=await start(page), timer=page.getByRole('timer',{name:'차례 남은 시간',exact:true})
  const ownHand=server.cardHand()
  server.cardSnapshot({turnUserId:'101',turnDeadline:new Date(Date.now()+20000).toISOString()},ownHand)
  await expect(timer).toHaveAttribute('data-warning','false')
  server.cardSnapshot({turnUserId:'101',turnDeadline:new Date(Date.now()+5500).toISOString()},ownHand)
  await expect(timer.locator('strong')).toHaveText('6초')
  await expect(timer).toHaveAttribute('data-warning','false')
  server.cardSnapshot({turnUserId:'101',turnDeadline:new Date(Date.now()+4500).toISOString()},ownHand)
  await expect(timer).toHaveAttribute('data-warning','true')
  await expect(timer).toHaveCSS('animation-name','onecard-countdown-shake')
  await expect(page.locator('.onecard-time-warning')).toHaveCSS('animation-name','onecard-warning-glow')
  const movement=await timer.evaluate(async node=>{
    const positions:number[]=[], opacities:number[]=[], start=performance.now()
    await new Promise<void>(resolve=>{
      const sample=()=>{
        positions.push(node.getBoundingClientRect().x)
        opacities.push(Number(getComputedStyle(document.querySelector('.onecard-time-warning')!).opacity))
        if(performance.now()-start>=1000) resolve(); else requestAnimationFrame(sample)
      }; requestAnimationFrame(sample)
    })
    return {shift:Math.max(...positions)-Math.min(...positions),pulse:Math.max(...opacities)-Math.min(...opacities)}
  })
  expect(movement.shift).toBeGreaterThan(3)
  expect(movement.pulse).toBeGreaterThan(.25)
  await screenshot(page,'onecard-last-five-seconds')
  await page.emulateMedia({reducedMotion:'reduce'})
  await expect(timer).toHaveCSS('animation-name','none')
  await expect(page.locator('.onecard-time-warning')).toHaveCSS('animation-name','none')
  server.cardSnapshot({turnUserId:'102',turnDeadline:new Date(Date.now()+4500).toISOString()},{...ownHand,playableCardIds:[],canDraw:false})
  await expect(timer).toHaveAttribute('data-warning','false')
  await expect(page.locator('.onecard-time-warning')).toHaveCount(0)
  server.cardSnapshot({turnUserId:'101',turnDeadline:new Date(Date.now()-1000).toISOString()},ownHand)
  await expect(timer).toHaveAttribute('data-warning','false')
  await expect(timer.locator('strong')).toHaveText('0초')
  await expect(page.getByLabel('원카드 경기',{exact:true})).toBeVisible()
  expect(server.sent.filter(m=>m.type==='GAME_ACTION_SEND')).toHaveLength(0)
})

test('관전자 상시 조작 문구를 숨기고 승인된 카드 선택·상태 안내·관전 종료를 유지한다',async({page})=>{
  const server=await fixture(page,{generatedPark:true,omok:true,onecard:2,publicSpectator:true,ownUserId:'505',spectatorEvents:true,onecardPranks:true})
  await load(page)
  server.tableSeat('101',{tableId,seatNumber:1}); server.tableSeat('102',{tableId,seatNumber:2})
  await page.getByRole('button',{name:'E 관전하기',exact:true}).click()
  await expect(page.getByRole('button',{name:'관전 종료',exact:true})).toBeVisible()
  await expect(page.getByText('캐릭터가 손에 든 카드를 선택하세요',{exact:true})).toHaveCount(0)
  await expect(page.getByText(/빈 곳을 드래그해 시점 회전/)).toHaveCount(0)
  await expect(page.locator('.onecard-spectator-hint')).toHaveCount(0)
  await expect(page.getByLabel('나만 볼 수 있는 카드')).toHaveCount(0)
  await expect.poll(()=>page.evaluate(async()=>{
    const probe=await import('/tests/e2e/onecardSceneProbe.ts' as string)
    return ['101','102'].some(id=>[0,1,2].some(index=>!!probe.oneCardHeldCardTarget(id,index)))
  })).toBe(true)
  await screenshot(page,'onecard-spectator-clean-hud')
  // 장난 요청은 현재 차례인 참가자에게만 허용된다. 반대편 비차례 손패를 대신 클릭하지 않는다.
  await choose3DCard(page,'101',0)
  await expect.poll(()=>server.sent.filter(m=>m.type==='ONECARD_PRANK_REACH_SEND').length).toBe(1)
  await expect(page.locator('.onecard-spectator-hint')).toBeVisible()
  expect(server.sent.filter(m=>m.type==='GAME_ACTION_SEND')).toHaveLength(0)
  expect(await page.evaluate(async()=>(await import('/src/game/store.ts' as string)).useGame.getState().game.hand)).toBeNull()
  await page.getByRole('button',{name:'관전 종료',exact:true}).click()
  await expect(page.getByLabel('원카드 경기',{exact:true})).toHaveCount(0)
})
