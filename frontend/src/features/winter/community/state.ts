import { create } from 'zustand'
import { isTreeOrnament, type TreeOrnament, type TreeOrnamentKind } from './ornaments'

export type TreeStatus = { count: number; lit: boolean; litAt: string | null; revision: number; ornaments: TreeOrnament[] }
export type TreeMessage = { id: number; text: string; anonymous: boolean; nickname: string | null; ornament: TreeOrnamentKind; createdAt: string }
export type TreePage = { status: TreeStatus; messages: TreeMessage[]; nextBefore: number | null }
export type Snowman = { id: string; channelId: string; name: string; x: number; groundY: number; z: number; yaw: number
  baseRadius: number; middleRadius: number; headRadius: number; hat: 'TOP_HAT' | 'BEANIE' | 'NONE'
  scarf: 'RED' | 'GREEN' | 'BLUE' | 'GOLD'; face: 'SMILE' | 'WINK'; createdAt: string }
export type RollingBall = { id: string; x: number; groundY: number; z: number; radius: number; pushing: string[]; reserved: boolean }
export type BuildingState = { channelId: string; version: number; serverTime: string; balls: RollingBall[]; snowmen: Snowman[] }
export const useWinterCommunity = create<{ tree: TreeStatus | null; building: BuildingState | null; error: string }>(() => ({
  tree: null, building: null, error: '',
}))

const object = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('겨울 공원 응답을 확인하지 못했어요.')
  return raw as Record<string, unknown>
}
const number = (raw: unknown) => typeof raw === 'number' && Number.isFinite(raw)
const integer = (raw: unknown) => number(raw) && Number.isSafeInteger(raw) && Number(raw) >= 0
const stamp = (raw: unknown) => typeof raw === 'string' && Number.isFinite(Date.parse(raw))
const uuid = (raw: unknown) => typeof raw === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(raw)

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

export function acceptWinterBuilding(raw: unknown, expectedChannel: string) {
  const s = object(raw)
  if (s.channelId !== expectedChannel || !integer(s.version) || !stamp(s.serverTime) || !Array.isArray(s.balls)
    || s.balls.length > 24 || !Array.isArray(s.snowmen) || s.snowmen.length > 12) return false
  for (const raw of s.balls) {
    const ball = object(raw)
    if (!uuid(ball.id) || ![ball.x, ball.z, ball.groundY, ball.radius].every(number) || Number(ball.radius) < .25
      || Number(ball.radius) > 1.1 || typeof ball.reserved !== 'boolean' || !Array.isArray(ball.pushing)
      || ball.pushing.length > 64 || !ball.pushing.every(p => typeof p === 'string' && p.length <= 64)) return false
  }
  for (const raw of s.snowmen) {
    const man = object(raw)
    if (!uuid(man.id) || man.channelId !== expectedChannel || typeof man.name !== 'string' || [...man.name].length > 40
      || ![man.x, man.z, man.groundY, man.yaw, man.baseRadius, man.middleRadius, man.headRadius].every(number)
      || Number(man.baseRadius) < .65 || Number(man.baseRadius) > 1.1 || Number(man.middleRadius) < .4
      || Number(man.middleRadius) > Number(man.baseRadius) || Number(man.headRadius) < .25 || Number(man.headRadius) > Number(man.middleRadius)
      || !['TOP_HAT', 'BEANIE', 'NONE'].includes(String(man.hat)) || !['RED', 'GREEN', 'BLUE', 'GOLD'].includes(String(man.scarf))
      || !['SMILE', 'WINK'].includes(String(man.face)) || !stamp(man.createdAt)) return false
  }
  const next = s as unknown as BuildingState, previous = useWinterCommunity.getState().building
  if (previous?.channelId === expectedChannel && previous.version > next.version) return false
  if (previous?.channelId === expectedChannel && previous.snowmen.length === next.snowmen.length
    && previous.snowmen.every((man, i) => JSON.stringify(man) === JSON.stringify(next.snowmen[i]))) next.snowmen = previous.snowmen
  useWinterCommunity.setState({ building: next, error: '' }); return true
}

export function resetWinterCommunity() { useWinterCommunity.setState({ tree: null, building: null, error: '' }) }
