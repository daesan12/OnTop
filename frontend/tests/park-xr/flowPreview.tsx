/** Browser-review fixture only: actual UI components, isolated cooperative transport, no real account/API. */
import { createRoot, type Root } from 'react-dom/client'
import CoopHost from '../../src/features/skewer/coop/CoopHost'
import { ChefPreview } from '../../src/features/skewer/chef/model'
import type { CoopSnapshot, CoopTransport, CoopResult } from '../../src/features/skewer/coop/contracts'
import type { Envelope } from '../../src/network/protocol'
import { clearRoamingInput, inputState } from '../../src/world/inputOwnership'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

const gameId = 'skewer-coop-00000000-0000-4000-8000-000000000001'
const owner = 'preview-chef', friend = 'preview-server'
let root: Root | undefined, host: HTMLDivElement | undefined
let state: CoopSnapshot | null = null
const listeners = new Set<(message: Envelope) => boolean>()
const kitchen = new ChefPreview().view()
const chef = () => ({ visible: kitchen.visible, waiting: kitchen.waiting, selectedJob: kitchen.selectedJob,
  skewer: [], pass: [], pantry: kitchen.pantry, completed: 0 })
const envelope = (type: string, payload: unknown): Envelope => ({ type, requestId: null, payload: payload as Record<string, unknown> })
const publish = () => { if (state) for (const listener of listeners) listener(envelope('GAME_STATE', structuredClone(state))) }
function fresh(): CoopSnapshot {
  return { gameId, version: 1, registered: true, publicState: {
    gameCode: 'SKEWER_COOP', phase: 'WAITING', channelId: 'preview-channel', remaining: 240, elapsed: 0,
    countdown: 0, score: 0, served: 0, paused: false, actionVersion: 1, rankingEligible: false, chefVR: false,
    entryFee: 0, rewardStatus: 'SERVER_SETTLEMENT', message: '', endReason: null,
    players: [{ userId: owner, role: '', ready: false, connected: true }],
    greeting: { active: false, index: 0, remaining: 0, answered: false, responded: 0, speech: false },
  }, privateState: { role: '' } }
}
function change(update: (value: CoopSnapshot) => void) {
  if (!state) return
  update(state); state.version++; state.publicState.actionVersion++; publish()
}
function result(): CoopResult {
  return { gameId, status: 'SETTLED', teamScore: 160, served: 20, endReason: 'SKEWER_TIME_UP',
    rankingStatus: 'REGISTERED', rankingReason: 'ELIGIBLE', coinsCalculated: 8, coinsGranted: 8,
    todayEarned: 8, dailyCap: 500, remainingToday: 492, balance: 108,
    rewardDate: '2026-11-05', settledAt: '2026-11-05T03:00:00Z' }
}
const transport: CoopTransport = {
  scope: () => ({ userId: owner, channelId: 'preview-channel', connected: true }),
  subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
  requestJSON: async (path, init) => {
    if (path.includes('/result?')) return result()
    if (path.endsWith('/leave')) return {}
    if (path.includes('/rankings')) return { rulesVersion: 'coop-v1', period: 'ALL_TIME', aggregation: 'TEAM_BEST',
      asOf: '2026-11-05T03:00:00Z', items: [], myBest: null }
    if (init?.method === 'POST') { state = fresh(); return structuredClone(state) }
    return { mine: state && structuredClone(state), rooms: [] }
  },
  request: async (type, payload, expected, onId) => {
    onId?.(crypto.randomUUID())
    if (type === 'GAME_ACTION_SEND') {
      const input = payload.input as Record<string, unknown>
      change(value => {
        if (input.type === 'ROLE') {
          value.privateState = { role: 'chef', chef: chef() }; value.publicState.players[0]!.role = 'chef'
          value.publicState.players[1]!.role = 'server'
        }
        if (input.type === 'READY') {
          value.publicState.players.forEach(p => { p.ready = true })
          value.publicState.phase = 'COUNTDOWN'; value.publicState.countdown = 3
        }
      })
    }
    const reply = type === 'GAME_STATE_CHECK' ? envelope('GAME_STATE', structuredClone(state))
      : type === 'GAME_RECONNECT_CHECK' ? envelope('GAME_CONNECTION_STATE', { gameId, version: state?.version, state: structuredClone(state) })
        : envelope(expected[0]!, {})
    for (const listener of listeners) listener(reply)
    return reply
  },
}
export function mount() {
  unmount(); state = null
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  inputState.minigameOpen = true; clearRoamingInput()
  root.render(<CoopHost transport={transport} onClose={unmount} />)
}
export function unmount() {
  root?.unmount(); host?.remove(); root = undefined; host = undefined; listeners.clear()
  inputState.minigameOpen = false; clearRoamingInput()
}
export function joinFriend() { change(value => value.publicState.players.push({ userId: friend, role: '', ready: false, connected: true })) }
export function headsetPreviewConnected() { change(value => { value.publicState.chefVR = true; value.publicState.rankingEligible = true }) }
export function playing() {
  change(value => {
    Object.assign(value.publicState, { phase: 'PLAYING', remaining: 178, elapsed: 62, countdown: 0, score: 120, served: 8 })
    value.privateState.chef!.skewer = ['tomato', 'cheese', 'pepper']
  })
}
export function finish() {
  change(value => Object.assign(value.publicState, { phase: 'FINISHED', remaining: 0, elapsed: 240,
    score: 160, served: 20, endReason: 'SKEWER_TIME_UP', message: '영업을 마쳤어요.' }))
}
/** Excludes DOM overlays, as immersive WebXR does; camera is still the PC kitchen preview camera. */
export function captureKitchenFrame(): Promise<string> {
  return new Promise((resolve, reject) => {
    const original = OutputPass.prototype.render
    const timeout = setTimeout(() => { OutputPass.prototype.render = original; reject(Error('Kitchen frame missing')) }, 5000)
    OutputPass.prototype.render = function (...args) {
      const value = original.apply(this, args)
      clearTimeout(timeout); OutputPass.prototype.render = original
      resolve(args[0].domElement.toDataURL('image/png'))
      return value
    }
  })
}
