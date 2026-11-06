import { create } from 'zustand'
import { parseMachine, type GachaMachine } from './contracts'

export interface GachaNotice { id: string; text: string; version: number; expiresAt: number }
export const useGachaEvents = create<{ machine: GachaMachine | null; notices: GachaNotice[] }>(() => ({ machine: null, notices: [] }))
const seen = new Set<string>()
export function resetGachaEvents() { seen.clear(); useGachaEvents.setState({ machine: null, notices: [] }) }
export function acceptGacha(value: Record<string, unknown>, receivedAt = performance.now()) {
  try {
    if (typeof value.eventId !== 'string' || !/^[a-f0-9-]{36}$/.test(value.eventId)) return
    const machine = parseMachine(value.machine), previous = useGachaEvents.getState()
    if (previous.machine && machine.version <= previous.machine.version) return
    let notices = previous.notices.filter(n => n.expiresAt > receivedAt)
    const winner = value.winner
    if (!seen.has(value.eventId) && winner && typeof winner === 'object' && !Array.isArray(winner)
      && 'nickname' in winner && typeof winner.nickname === 'string' && winner.nickname.length <= 40) {
      notices = [...notices, { id: value.eventId, text: `${winner.nickname}님이 1등 의상 상자에 당첨됐어요! 새로운 뽑기가 시작됩니다.`,
        version: machine.version, expiresAt: receivedAt + 30000 }].slice(-5)
    }
    seen.add(value.eventId)
    if (seen.size > 512) seen.delete(seen.values().next().value!)
    useGachaEvents.setState({ machine, notices })
  } catch { /* 잘못된 비필수 상태는 현재 승인된 기계를 덮어쓰지 않는다. */ }
}
