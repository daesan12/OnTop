import { parkRuntime } from '../../../park/runtime/runtime'
import { useSession } from '../../../network/worldClient'
import { acceptWinterBuilding, acceptWinterTree, parseTreePage, type RollingBall, type Snowman } from './state'
import type { TreeOrnamentKind } from './ornaments'

const root = '/api/v1/world/winter'
const timeout = (signal?: AbortSignal) => signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000)
const post = (path: string, payload: unknown, signal?: AbortSignal) => parkRuntime.requestJSON(root + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: timeout(signal),
})
const scope = () => { const s = useSession.getState(); return `${s.sessionId}:${s.roomId}` }
const channel = () => useSession.getState().roomId

export async function refreshWinterCommunity(signal?: AbortSignal) {
  const current = scope(), room = channel()
  const results = await Promise.allSettled([
    parkRuntime.requestJSON(`${root}/tree/status?channelId=${encodeURIComponent(room)}`, { signal: timeout(signal) }).then(raw => {
      if (scope() === current && !signal?.aborted) acceptWinterTree(raw)
    }),
    parkRuntime.requestJSON(`${root}/snow?channelId=${encodeURIComponent(room)}`, { signal: timeout(signal) }).then(raw => {
      if (scope() === current && !signal?.aborted) acceptWinterBuilding(raw, room)
    }),
  ])
  return results.every(r => r.status === 'fulfilled')
}

export async function treePage(before?: number, signal?: AbortSignal) {
  return parseTreePage(await parkRuntime.requestJSON(`${root}/tree?channelId=${encodeURIComponent(channel())}${before ? `&before=${before}` : ''}`, { signal: timeout(signal) }))
}

export async function postTree(text: string, anonymous: boolean, operationId: string, ornament: TreeOrnamentKind, signal?: AbortSignal) {
  const current = scope()
  const raw = await post('/tree/messages', { channelId: channel(), operationId, text, anonymous, ornament }, signal) as {
    status: unknown; message: unknown; nextAllowedAt: string
  }
  const parsed = parseTreePage({ status: raw.status, messages: [raw.message], nextBefore: null })
  if (scope() !== current || signal?.aborted) throw Error('공원 연결이 바뀌었어요. 편지를 다시 확인해주세요.')
  acceptWinterTree(parsed.status)
  return { status: parsed.status, message: parsed.messages[0]!, nextAllowedAt: raw.nextAllowedAt }
}

export async function holdSnow(action: 'BEGIN' | 'KEEP' | 'RELEASE', operationId: string, ball?: Pick<RollingBall, 'id'>) {
  const current = scope(), room = channel()
  const path = action === 'BEGIN' ? '/snow/rolls' : `/snow/rolls/${ball?.id}/${action === 'KEEP' ? 'hold' : 'release'}`
  const raw = await post(path, { channelId: room, operationId, ballId: ball?.id ?? null })
  if (scope() === current) acceptWinterBuilding(raw, room)
  return raw
}

export type Assembly = { ballIds: string[]; name: string; hat: Snowman['hat']; scarf: Snowman['scarf']; face: Snowman['face']; x: number; z: number; yaw: number; operationId: string }
export async function assembleSnowman(assembly: Assembly) {
  const current = scope()
  const raw = await post('/snow/snowmen', { channelId: channel(), ...assembly })
  if (scope() !== current) throw Error('공원 연결이 바뀌었어요. 눈사람을 다시 확인해주세요.')
  await refreshWinterCommunity()
  return raw
}
