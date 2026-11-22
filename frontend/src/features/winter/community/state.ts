import { create } from 'zustand'
import { isTreeOrnament, type TreeOrnament, type TreeOrnamentKind } from './ornaments'

export type TreeStatus = { count: number; lit: boolean; litAt: string | null; revision: number; ornaments: TreeOrnament[] }
export type TreeMessage = { id: number; text: string; anonymous: boolean; nickname: string | null; ornament: TreeOrnamentKind; createdAt: string }
export type TreePage = { status: TreeStatus; messages: TreeMessage[]; nextBefore: number | null }
export const useWinterCommunity = create<{ tree: TreeStatus | null }>(() => ({ tree: null }))

const object = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('겨울 공원 응답을 확인하지 못했어요.')
  return raw as Record<string, unknown>
}
const number = (raw: unknown) => typeof raw === 'number' && Number.isFinite(raw)
const integer = (raw: unknown) => number(raw) && Number.isSafeInteger(raw) && Number(raw) >= 0
const stamp = (raw: unknown) => typeof raw === 'string' && Number.isFinite(Date.parse(raw))

export function parseTreeStatus(raw: unknown): TreeStatus {
  const s = object(raw)
  if (!integer(s.count) || !integer(s.revision) || typeof s.lit !== 'boolean' || s.litAt != null && !stamp(s.litAt)) throw Error('트리 소식을 확인하지 못했어요.')
  if (!Array.isArray(s.ornaments) || s.ornaments.length > 50) throw Error('트리 장식을 확인하지 못했어요.')
  const seen = new Set<number>()
  const ornaments = s.ornaments.map(raw => {
    const item = object(raw)
    if (!integer(item.id) || item.id === 0 || !isTreeOrnament(item.ornament) || seen.has(Number(item.id))) throw Error('트리 장식을 확인하지 못했어요.')
    seen.add(Number(item.id))
    return { id: Number(item.id), ornament: item.ornament }
  })
  return { count: Number(s.count), revision: Number(s.revision), lit: s.lit, litAt: s.litAt == null ? null : String(s.litAt), ornaments }
}

export function acceptWinterTree(raw: unknown) {
  const next = parseTreeStatus(raw), previous = useWinterCommunity.getState().tree
  if (previous && previous.revision > next.revision) return false
  useWinterCommunity.setState({ tree: next }); return true
}

export function parseTreePage(raw: unknown): TreePage {
  const p = object(raw)
  if (!Array.isArray(p.messages) || p.messages.length > 12 || p.nextBefore != null && (!integer(p.nextBefore) || p.nextBefore === 0)) throw Error('편지를 불러오지 못했어요.')
  const messages = p.messages.map(raw => {
    const m = object(raw)
    if (!integer(m.id) || m.id === 0 || typeof m.text !== 'string' || [...m.text].length > 300 || typeof m.anonymous !== 'boolean'
      || !stamp(m.createdAt) || !isTreeOrnament(m.ornament) || !m.anonymous && typeof m.nickname !== 'string') throw Error('편지를 불러오지 못했어요.')
    return { id: Number(m.id), text: m.text, anonymous: m.anonymous, nickname: m.anonymous ? null : String(m.nickname), ornament: m.ornament, createdAt: String(m.createdAt) }
  })
  return { status: parseTreeStatus(p.status), messages, nextBefore: p.nextBefore == null ? null : Number(p.nextBefore) }
}

export function resetWinterCommunity() { useWinterCommunity.setState({ tree: null }) }
