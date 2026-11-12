import { expect, test } from '@playwright/test'
const inventory = { tickets: 1, balance: 900, availableBalance: 900, boxes: [1,2,3,4].map(grade=>({grade,quantity:0})) }
const state = { enabled:true,ticketPrice:100,products:[],inventory,machine:{roundId:'1',version:0,remaining:30,refillEndsAt:null,
  prizes:[1,2,4,8,15].map((remaining,i)=>({grade:i+1,initial:remaining,remaining,value:[1000,500,250,100,20][i]}))} }

for (const view of ['storage','machine']) {
  test(`${view}: 첫 조회 실패 뒤 같은 거래 ID로 확정 결과를 복구한다`, async ({page},info)=>{
    await page.emulateMedia({reducedMotion:'reduce'})
    await page.addInitScript(()=>sessionStorage.setItem('ontop:gacha:pending:101',JSON.stringify({kind:'DRAW',operationId:'lost-draw',roundId:'1'})))
    let ready=false,reads=0
    const bodies:unknown[]=[]
    await page.route('**/api/v1/gacha',route=>{
      reads++
      return ready?route.fulfill({json:state}):route.fulfill({status:503,json:{code:'GACHA_UNAVAILABLE',message:'upstream internal failure'}})
    })
    await page.route('**/api/v1/gacha/draws',route=>{
      bodies.push(route.request().postDataJSON())
      return route.fulfill({json:{operationId:'lost-draw',kind:'DRAW',roundId:'1',grade:5,product:null,duplicate:false,
        paidCoins:0,awardedCoins:20,inventory,completedAt:'2026-11-12T00:00:00Z'}})
    })
    await page.goto('/tests/fixtures/gacha-recovery.html'+(view==='machine'?'?machine=1':''))
    const surface=view==='machine'?page.getByRole('dialog',{name:'의상 뽑기',exact:true}):page.getByRole('region',{name:'아이템 보관함'})
    const alert=surface.getByRole('alert')
    await expect(alert).toContainText('뽑기 정보를 불러오지 못했어요')
    await expect(alert).not.toContainText('internal')
    await expect(surface.getByText(/불러오고 있어요/)).toHaveCount(0)
    await expect(surface.getByRole('button',{name:'이전 거래 결과 확인',exact:true})).toBeDisabled()
    await page.screenshot({path:info.outputPath(`${view}-failed.png`)})
    ready=true
    await alert.getByRole('button',{name:'다시 불러오기',exact:true}).click()
    expect(bodies).toHaveLength(0)
    await expect(surface.getByRole('button',{name:'이전 거래 결과 확인',exact:true})).toBeEnabled()
    await surface.getByRole('button',{name:'이전 거래 결과 확인',exact:true}).click()
    await expect(surface.getByText(view==='machine'?'20냥 당첨!':'20냥 당첨을 확인했어요',{exact:true})).toBeVisible()
    expect(bodies).toEqual([{operationId:'lost-draw',roundId:'1'}])
    expect(reads).toBe(3)
    expect(await page.evaluate(()=>sessionStorage.getItem('ontop:gacha:pending:101'))).toBeNull()
    await page.screenshot({path:info.outputPath(`${view}-recovered.png`)})
  })
}
test('보관함 네트워크 실패는 한국어 안내 후 조회만 재시도한다',async({page})=>{
  let ready=false,posts=0
  await page.route('**/api/v1/gacha',route=>ready?route.fulfill({json:state}):route.abort('failed'))
  await page.route('**/api/v1/gacha/**',route=>{posts++;return route.abort()})
  await page.goto('/tests/fixtures/gacha-recovery.html')
  await expect(page.getByRole('alert')).toContainText('연결 상태를 확인하고')
  ready=true;await page.getByRole('button',{name:'다시 불러오기'}).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(posts).toBe(0)
})

