import { create } from 'zustand'
import { useSession } from '../../network/worldClient'
import { parkRuntime } from '../../park/runtime/runtime'
import { RestError } from '../../network/restError'
import { parseResult, parseState, type GachaResult, type GachaState } from './contracts'
import { resetGachaEvents, useGachaEvents } from './events'
import { gachaClock, refillRemaining } from './timing'
import { gachaFailureMessage } from './errors'

type Kind = 'BUY' | 'DRAW' | 'OPEN'
/** Most tickets one purchase may buy (the server's GachaRules.MAX_PURCHASE). */
export const MAX_TICKET_PURCHASE = 100
export type GachaAvailability = 'unknown' | 'enabled' | 'disabled'
interface Pending { kind: Kind; operationId: string; roundId?: string; grade?: number; quantity?: number }
const initial = () => ({ owner: '', state: null as GachaState | null, loading: false, busy: false, error: '',
  unavailable: false, availability: 'unknown' as GachaAvailability, transition: null as 'ROUND_ENDED' | 'REFILLING' | null,
  result: null as GachaResult | null, pending: null as Pending | null })
export const useGacha = create(initial)
let generation = 0, reads = 0
const storageKey = (owner: string) => `ontop:gacha:pending:${owner}`
function save(owner: string, pending: Pending | null) {
  try { if (pending) sessionStorage.setItem(storageKey(owner), JSON.stringify(pending)); else sessionStorage.removeItem(storageKey(owner)) } catch { /* 메모리 재시도는 유지한다. */ }
}
function restored(owner: string): Pending | null {
  try {
    const p = JSON.parse(sessionStorage.getItem(storageKey(owner)) ?? 'null') as Pending | null
    if (!p || !['BUY', 'DRAW', 'OPEN'].includes(p.kind) || !/^[A-Za-z0-9_-]{1,64}$/.test(p.operationId)
      || (p.kind === 'DRAW' && (typeof p.roundId !== 'string' || !/^[1-9]\d*$/.test(p.roundId)))
      || (p.kind === 'OPEN' && ![1, 2, 3, 4].includes(p.grade!))
      || (p.quantity !== undefined && (!Number.isInteger(p.quantity) || p.quantity < 1 || p.quantity > MAX_TICKET_PURCHASE))) return null
    return p
  } catch { return null }
}
const present = (owner: string, epoch: number) => generation === epoch && useSession.getState().sessionId === owner
  && useSession.getState().status === 'connected'
export function resetGacha() { generation++; reads++; useGacha.setState(initial(), true); resetGachaEvents(); gachaClock.reset() }
export function gachaInteractionEnabled(owner: string): boolean {
  const current = useGacha.getState()
  return !!owner && current.owner === owner && current.availability === 'enabled' && current.state?.enabled === true
}
export async function refreshGacha() {
  const owner = useSession.getState().sessionId
  if (!owner || useSession.getState().status !== 'connected') return
  if (useGacha.getState().owner !== owner) { resetGacha(); useGacha.setState({ owner, pending: restored(owner) }) }
  const epoch = generation, reading = ++reads, sentAt = performance.now()
  useGacha.setState({ loading: true, error: '' })
  try {
    const state = parseState(await parkRuntime.requestJSON('/api/v1/gacha', { cache: 'no-store', signal: AbortSignal.timeout(10000) }))
    if (present(owner, epoch) && reading === reads) {
      const receivedAt=performance.now()
      if(state.serverNow)gachaClock.sync(Date.parse(state.serverNow),receivedAt,receivedAt-sentAt)
      useGacha.setState({ state: state.enabled ? state : null, loading: false, unavailable: !state.enabled,
        availability: state.enabled ? 'enabled' : 'disabled' })
    }
  } catch (cause) {
    if (!present(owner, epoch) || reading !== reads) return
    const unavailable = cause instanceof RestError && cause.code === 'GACHA_NOT_CONFIGURED'
    useGacha.setState({ loading: false, error: gachaFailureMessage(cause),
      unavailable, ...(unavailable ? { state: null, availability: 'disabled' as const } : {}) })
  }
}
/** grade: the box grade for OPEN; for BUY, how many tickets (1-10, one server transaction). */
export async function gachaAction(kind: Kind, grade?: number) {
  const s = useGacha.getState(), owner = useSession.getState().sessionId
  if (!owner || s.owner !== owner || s.busy || !s.state) return
  const live = useGachaEvents.getState().machine
  const machine = live && live.version > s.state.machine.version ? live : s.state.machine
  // A pending request can already be committed: always allow that exact receipt to be recovered.
  if(!s.pending && kind==='DRAW' && refillRemaining(machine)>0){
    useGacha.setState({transition:'REFILLING',error:'',result:null});return
  }
  const pending = s.pending ?? { kind, operationId: crypto.randomUUID(), ...(kind === 'DRAW' ? { roundId: machine.roundId } : {}),
    ...(kind === 'OPEN' ? { grade } : {}), ...(kind === 'BUY' && grade && grade > 1 ? { quantity: grade } : {}) }
  useGacha.setState({ busy: true, error: '', transition:null, pending, result: null }); save(owner, pending)
  const epoch = generation
  const path = pending.kind === 'BUY' ? '/tickets' : pending.kind === 'DRAW' ? '/draws' : '/boxes/open'
  const body = { operationId: pending.operationId, ...(pending.kind === 'DRAW' ? { roundId: pending.roundId } : {}),
    ...(pending.kind === 'OPEN' ? { grade: pending.grade } : {}), ...(pending.kind === 'BUY' && pending.quantity ? { quantity: pending.quantity } : {}) }
  try {
    const result = parseResult(await parkRuntime.requestJSON(`/api/v1/gacha${path}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) }))
    if (!present(owner, epoch)) return
    save(owner, null); useGacha.setState({ pending: null, result })
    // 거래 영수증의 과거 잔액으로 현재 잔액을 덮지 않고, 별도 최신 조회를 요청한다.
    window.dispatchEvent(new Event('ontop-gacha-committed'))
    await refreshGacha()
  } catch (cause) {
    if (!present(owner, epoch)) return
    const refill = cause instanceof RestError && ['GACHA_ROUND_CHANGED','GACHA_REFILLING'].includes(cause.code)
    const rejected = cause instanceof RestError && ['INVALID_REQUEST', 'GACHA_ROUND_CHANGED', 'GACHA_REFILLING', 'GACHA_NO_TICKET',
      'GACHA_NO_BOX', 'INSUFFICIENT_BALANCE', 'GACHA_NO_COMPATIBLE_PRODUCT', 'GACHA_CAPACITY_EXCEEDED'].includes(cause.code)
    if (rejected) {
      save(owner, null); useGacha.setState({ pending: null })
    }
    if(refill){
      useGacha.setState({transition:cause.code==='GACHA_ROUND_CHANGED'?'ROUND_ENDED':'REFILLING',error:''})
      await refreshGacha() // GET only. Never submit a second DRAW on the user's behalf.
      return
    }
    useGacha.setState({ error: gachaFailureMessage(cause, true) })
  } finally { if (present(owner, epoch)) useGacha.setState({ busy: false }) }
}
