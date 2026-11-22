import { parkRuntime } from '../../../park/runtime/runtime'
import { useSession } from '../../../network/worldClient'
import { acceptWinterTree, parseTreePage } from './state'
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
