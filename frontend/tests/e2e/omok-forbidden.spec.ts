import { expect, test } from '@playwright/test'
import { fixture, screenshot, tableId } from './contractFixture'

test('same public board shows forbidden marks only for the black player', async ({ page }) => {
  await fixture(page, { omok: true })
  await page.goto('/park')
  await expect.poll(() => page.evaluate(async () => (await import('/src/network/worldClient.ts' as string)).useSession.getState().status), {timeout:90000}).toBe('connected')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
  // Rendering regression with a synthetic received game; no real member or match is changed.
  await page.evaluate(async tableId => {
    const { useSession, avatars } = await import('/src/network/worldClient.ts' as string)
    const { useGame } = await import('/src/game/store.ts' as string)
    useSession.setState({tableId,seatIndex:0,sessionId:'101'})
    const anchorId = useSession.getState().bindings.find((b: {tableId:string})=>b.tableId===tableId)!.anchorId
    for (const [id, seatIndex] of [['101',0],['102',1]] as const) {
      const avatar = avatars.get(id)!
      avatar.tableId = anchorId; avatar.seatIndex = seatIndex
    }
    useGame.setState({recovery:'RESTORED',permittedGameId:'forbidden-render',game:{
      gameId:'forbidden-render',version:0,role:'PLAYER',omok:{
        gameCode:'OMOK',status:'PLAYING',boardSize:15,
        board:Array.from({length:15},()=>Array(15).fill(0)),moveCount:0,
        blackUserId:'101',whiteUserId:'102',turnUserId:'101',
        turnDeadline:new Date(Date.now()+120000).toISOString(),
        lastMove:null,winnerUserId:null,endReason:null,endedAt:null,
        forbiddenMoves:[{x:7,y:7,kind:'33'}],
      },
    }})
  }, tableId)
  const marks = () => page.evaluate(async () => {
    return (await import('/tests/e2e/sceneProbe.ts' as string)).omokForbiddenProbe()
  })
  await expect.poll(marks).toBe(true)
  await expect.poll(() => page.evaluate(async () => (await import('/src/game/cameraState.ts' as string)).omokCamera.ready)).toBe(true)
  await screenshot(page,'omok-forbidden-black-visible')
  await page.evaluate(async () => {
    const { useSession } = await import('/src/network/worldClient.ts' as string)
    useSession.setState({sessionId:'102',seatIndex:1})
  })
  await expect.poll(marks).toBe(false)
  await screenshot(page,'omok-forbidden-white-hidden')
  await page.evaluate(async () => {
    const { useGame } = await import('/src/game/store.ts' as string)
    const { useSession } = await import('/src/network/worldClient.ts' as string)
    const { useTableLobby } = await import('/src/features/tableLobby/state.ts' as string)
    const session = useSession.getState()
    useSession.setState({watchedTableId:session.tableId,tableId:'',seatIndex:-1})
    useTableLobby.setState({spectatorView:'board'})
    useGame.setState({game:{...useGame.getState().game!,role:'SPECTATOR'}})
  })
  await expect.poll(marks).toBe(false)
  await screenshot(page,'omok-forbidden-spectator-hidden')
})
