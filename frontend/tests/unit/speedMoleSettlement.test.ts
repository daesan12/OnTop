import { afterEach, expect, it, vi } from 'vitest'
vi.mock('../../src/features/mole/store',()=>({refreshMole:vi.fn()}))
import { useSession } from '../../src/network/worldClient'
import { speedMoleService } from '../../src/features/speedMole/service'
import { settleSpeedMole } from '../../src/features/speedMole/settlement'
import { useWalletSettlement } from '../../src/features/wallet/settlementRefresh'
import { refreshMole } from '../../src/features/mole/store'
const result={id:'99',rulesVersion:1,score:120,hits:120,misses:0,completedAt:'2030-01-01T00:01:03Z',calculatedReward:24,reward:24,todayEarned:24,dailyCap:500}
afterEach(()=>vi.restoreAllMocks())
it('a delayed completion still refreshes the own wallet without needing a mounted result panel; retries do not double-refresh',async()=>{
  useSession.setState({sessionId:'speed-own-late'})
  let resolve!: (v:typeof result)=>void
  vi.spyOn(speedMoleService,'complete').mockReturnValue(new Promise(r=>{resolve=r}))
  const before=useWalletSettlement.getState().revision
  const pending=settleSpeedMole('99',[],'speed-own-late')
  // The caller may unmount; the settlement task remains independent of UI state.
  resolve(result);await pending
  expect(useWalletSettlement.getState().revision).toBe(before+1)
  vi.mocked(speedMoleService.complete).mockResolvedValue(result)
  await settleSpeedMole('99',[],'speed-own-late')
  expect(useWalletSettlement.getState().revision).toBe(before+1)
  expect(refreshMole).toHaveBeenCalled()
})
it('does not refresh another account after switching users during a pending completion',async()=>{
  useSession.setState({sessionId:'speed-next-user'})
  vi.spyOn(speedMoleService,'complete').mockResolvedValue(result)
  const before=useWalletSettlement.getState().revision
  await settleSpeedMole('99',[],'speed-previous-user')
  expect(useWalletSettlement.getState().revision).toBe(before)
})
