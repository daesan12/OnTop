import { createRoot } from 'react-dom/client'
import { CoopClient } from '../../../src/features/skewer/coop/client'
import { CoopResultPanel } from '../../../src/features/skewer/coop/CoopResultPanel'
import type { CoopSnapshot } from '../../../src/features/skewer/coop/contracts'
import '../../../src/styles.css'
import '../../../src/features/skewer/coop/coop.css'
import '../../../src/features/skewer/coop/coopScreens.css'
import '../../../src/features/skewer/coop/coopPolish.css'

// 결과 UI 전용 영수증 대역. 실제 지갑이나 DB를 변경하지 않는다.
const gameId = 'skewer-coop-00000000-0000-4000-8000-000000000001'
const snapshot: CoopSnapshot = { gameId, version: 1, registered: true, privateState: { role: '' },
  publicState: { gameCode: 'SKEWER_COOP', phase: 'FINISHED', channelId: 'park', actionVersion: 1,
    remaining: 0, elapsed: 240, countdown: 0, score: 2460, served: 12, paused: false, chefVR: false,
    rankingEligible: true, rankingMode: 'PC', entryFee: 0, rewardStatus: 'SERVER_SETTLEMENT', message: '', endReason: 'SKEWER_TIME_UP',
    players: [{ userId: '101', role: 'server', ready: true, connected: true }, { userId: '202', role: 'chef', ready: true, connected: true }],
    greeting: { active: false, index: 0, remaining: 0, answered: false, responded: 0, speech: false } } }
const client = new CoopClient({ scope: () => ({ userId: '101', channelId: 'park', connected: true }),
  subscribe: () => () => {}, request: async () => { throw new Error('결과 검수에는 게임 입력이 없습니다.') },
  requestJSON: async () => {
    await new Promise(resolve => setTimeout(resolve, 250))
    return { gameId, status: 'SETTLED', teamScore: 2460, served: 12, endReason: 'SKEWER_TIME_UP',
      rankingStatus: 'REGISTERED', rankingReason: 'ELIGIBLE', coinsCalculated: 123, coinsGranted: 123,
      todayEarned: 210, dailyCap: 1000, remainingToday: 790, balance: 1123,
      rewardDate: '2026-11-07', settledAt: '2026-11-07T00:00:00Z' }
  } })
client.store.setState({ snapshot })
void client.refreshResult()
createRoot(document.getElementById('root')!).render(<div className="skewer-coop"><CoopResultPanel client={client} leaving={false} onClose={() => client.stop()} /></div>)
