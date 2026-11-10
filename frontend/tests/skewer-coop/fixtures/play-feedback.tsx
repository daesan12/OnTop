import { createRoot } from 'react-dom/client'
import CoopHost from '../../../src/features/skewer/coop/CoopHost'
import { ChefPreview } from '../../../src/features/skewer/chef/model'
import { HallPreview } from '../../../src/features/skewer/serviceHall/previewModel'
import type { CoopSnapshot, CoopTransport } from '../../../src/features/skewer/coop/contracts'
import type { Envelope } from '../../../src/network/protocol'
import ChefPage from '../../../src/features/skewer/chef/ChefPage'
import { CoopClient } from '../../../src/features/skewer/coop/client'
import { move, TABLES } from '../../../src/features/skewer/serviceHall/plan'
import { OnlineChef } from '../../../src/features/skewer/coop/drivers'
import '../../../src/styles.css'

// Controlled UI regression fixture. No shared server, wallet or DB is changed.
const role = new URLSearchParams(location.search).get('role') === 'server' ? 'server' : 'chef'
const gameId = 'skewer-coop-00000000-0000-4000-8000-000000000001'
let state: CoopSnapshot = { gameId, version: 1, registered: true,
  privateState: role === 'server' ? { role, hall: new HallPreview().view() } : { role, chef: new ChefPreview().view() },
  publicState: { gameCode: 'SKEWER_COOP', phase: 'PLAYING', channelId: 'park', actionVersion: 1, round: 0,
    remaining: 124, elapsed: 116, countdown: 0, score: 432, served: 2, paused: false, chefVR: false,
    rankingEligible: true, entryFee: 0, rewardStatus: 'SERVER_SETTLEMENT', message: '', endReason: null,
    players: [{ userId: '101', role, ready: true, connected: true }, { userId: '202', role: role === 'chef' ? 'server' : 'chef', ready: true, connected: true }],
    greeting: { active: false, index: 0, remaining: 0, answered: false, responded: 0, speech: false } } }
if (new URLSearchParams(location.search).has('prepare')) {
  state.publicState.phase = 'WAITING'; state.publicState.players.forEach(player => { player.ready = false })
}
let velocity = { dx: 0, dz: 0 }
let greetings = 0
const lobby = new URLSearchParams(location.search).get('lobby')
let joined = lobby !== 'home'
if (lobby) {
  state.publicState.phase = 'WAITING'; state.registered = false; state.privateState = { role: '' }
  state.publicState.players.forEach(player => { player.role = ''; player.ready = false })
  if (lobby !== 'roles') state.publicState.players = state.publicState.players.slice(0, 1)
}
const moveRequests: { dx: number; dz: number; at: number }[] = []
let holdMoves = new URLSearchParams(location.search).has('holdMoves')
const moveReplies: (() => void)[] = []
window.setInterval(() => {
  if (state.privateState.hall && state.publicState.phase === 'PLAYING' && !state.publicState.paused && (velocity.dx || velocity.dz)) {
    state.publicState.elapsed += .05
    state.privateState.hall.position = move(state.privateState.hall.position, velocity.dx, velocity.dz, .05)
    state.version++; publish()
  }
}, 50)
let receive: ((message: Envelope) => boolean) | undefined
if (state.privateState.chef) {
  const hall = new HallPreview().view()
  state.privateState.chef.hallSight = { position: hall.position, carrying: false, cleaning: false,
    tables: hall.tables.map(table => ({ id: table.id, people: table.people, eating: table.status === 'eating', dirty: table.status === 'dirty' })) }
}
const publish = () => receive?.({ type: 'GAME_STATE', payload: structuredClone(state) } as unknown as Envelope)
const transport: CoopTransport = {
  scope: () => ({ userId: '101', channelId: 'park', connected: true }),
  subscribe: fn => { receive = fn; return () => { receive = undefined } },
  requestJSON: async (path, init) => {
    if (lobby && init?.method === 'POST') {
      if (path.endsWith('/leave')) { joined = false; return {} }
      joined = true; state.publicState.roomName = JSON.parse(String(init.body)).roomName
      return structuredClone(state)
    }
    return path.includes('/result?') ? { gameId, status: 'UNAVAILABLE', teamScore: 432, served: 2, endReason: 'SKEWER_TIME_UP', rankingStatus: 'EXCLUDED', rankingReason: 'QA', coinsCalculated: 21, coinsGranted: null, todayEarned: null, dailyCap: 500, remainingToday: null, balance: null, rewardDate: null, settledAt: null } : { mine: joined ? structuredClone(state) : null, rooms: [] }
  },
  request: async (type, payload) => {
    const input = payload.input as { type?: string; paused?: boolean; dx?: number; dz?: number; role?: 'chef' | 'server' } | undefined
    if (input?.type === 'GREET') { greetings++; state.publicState.greeting.answered = true; state.version++; publish() }
    if (input?.type === 'ROLE' && input.role) {
      state.publicState.players[0].role = input.role
      state.privateState = input.role === 'chef' ? { role: 'chef', chef: new ChefPreview().view() } : { role: 'server', hall: new HallPreview().view() }
      state.version++; publish()
    }
    if (input?.type === 'MOVE') {
      velocity = { dx: input.dx ?? 0, dz: input.dz ?? 0 }
      moveRequests.push({ ...velocity, at: performance.now() })
      if (holdMoves) await new Promise<void>(resolve => moveReplies.push(resolve))
    }
    if (input?.type === 'PAUSE') { state.publicState.paused = !!input.paused; state.publicState.pausedBy = input.paused ? ['101'] : []; state.publicState.pauseReason = input.paused ? 'EXIT_CONFIRM' : ''; state.version++; publish() }
    return { type: type === 'GAME_STATE_CHECK' ? 'GAME_STATE' : 'GAME_ACTION_RESULT', payload: structuredClone(state) } as unknown as Envelope
  },
}
Reflect.set(window, 'skewerFeedback', {
  greetings: () => greetings,
  playGreeting: () => { state.publicState.phase = 'PLAYING'; state.publicState.greeting.active = true; state.version++; publish() },
  position: () => state.privateState.hall?.position,
  moves: () => moveRequests,
  releaseMoves: () => { holdMoves = false; moveReplies.splice(0).forEach(resolve => resolve()) },
  nearTable: (id: number) => { state.privateState.hall!.position = { ...TABLES.find(table => table.id === id)!.approach }; state.version++; publish() },
  tableArrival: (remaining: number) => { const t = state.privateState.hall!.tables[2]; t.people = 1; t.status = remaining > 0 ? 'arriving' : 'unreceived'; t.arrivalRemaining = remaining; t.bill = remaining > 0 ? null : { dishes: [{ id: 'arrival', table: 3, recipe: ['tomato'], delivered: false }], sake: 0, sakeDelivered: 0 }; state.version++; publish() },
  clock: (remaining: number) => { state.publicState.remaining = remaining; state.version++; publish() },
  greeting: (outcome: '' | 'success' | 'missed' | 'active') => {
    state.publicState.greeting = { active: outcome === 'active', index: state.publicState.greeting.index + 1, remaining: 4.5, answered: false, responded: 0, speech: false, outcome: outcome === 'active' ? '' : outcome, bonus: outcome === 'success' ? 24 : 0 }
    state.publicState.message = outcome === 'success' ? '인사 완료! +24점' : outcome === 'missed' ? '인사 시간이 지났어요. 다음 손님에게 인사해요.' : ''
    state.version++; publish()
    if (outcome === 'success' || outcome === 'missed') window.setTimeout(() => { state.publicState.greeting.outcome = ''; state.version++; publish() }, 2000)
  },
  corrupt: () => {
    const wrong = structuredClone(state); wrong.version += 100
    wrong.privateState = role === 'chef' ? { role: 'server', hall: new HallPreview().view() } : { role: 'chef', chef: new ChefPreview().view() }
    receive?.({ type: 'GAME_STATE', payload: wrong } as unknown as Envelope)
  },
  finish: () => { state.publicState.phase = 'FINISHED'; state.publicState.endReason = 'SKEWER_TIME_UP'; state.publicState.remaining = 0; state.publicState.greeting.outcome = ''; state.version++; publish() },
})
if (new URLSearchParams(location.search).get('mode') === 'vr') {
  const client = new CoopClient(transport); client.start()
  const driver = new OnlineChef(client)
  // Wait for the first valid private view just as CoopHost does.
  void client.refresh().then(() => createRoot(document.getElementById('root')!).render(<ChefPage driver={driver} preferredMode="vr" />))
} else createRoot(document.getElementById('root')!).render(<CoopHost transport={transport} onClose={() => {}} />)
