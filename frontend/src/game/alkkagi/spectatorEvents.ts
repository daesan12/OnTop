import { environmentClock } from '../../world/environmentState'
import { create } from 'zustand'
import { record, integer, type Envelope } from '../../network/protocol'
import type { SocialView } from './replay'

type Mark = { gameId: string; eventId: string; senderUserId: string; kind: 'CURSOR' | 'ADVICE';
  turnNumber: number; basedOnVersion: number; until: number; x: number; y: number; pieceId: string; dx: number; dy: number; power: number }
export const useAlkkagiSocial = create(() => ({ gameId: '', marks: [] as Mark[] }))
const seen = new Map<string, number>()
let timer: ReturnType<typeof setTimeout> | undefined
export function resetAlkkagiSocial() {
  clearTimeout(timer); seen.clear(); useAlkkagiSocial.setState({ gameId: '', marks: [] })
}
function prune() {
  const now = performance.now()
  useAlkkagiSocial.setState(s => ({ marks: s.marks.filter(m => m.until > now) }))
  for (const [id, until] of seen) if (until <= now) seen.delete(id)
  if (useAlkkagiSocial.getState().marks.length) timer = setTimeout(prune, 100)
}
export function acceptAlkkagiSocial(message: Envelope, gameId: string, version?: number, estimatedServerNow?: number) {
  if (message.type !== 'ALKKAGI_SPECTATOR_EVENT') return false
  const p = message.payload
  if (!record(p) || p.gameId !== gameId || typeof p.eventId !== 'string' || !/^[0-9a-f-]{36}$/.test(p.eventId)
    || typeof p.senderUserId !== 'string' || !/^[1-9][0-9]*$/.test(p.senderUserId)
    || !integer(p.basedOnVersion) || (version !== undefined && p.basedOnVersion < version) || !integer(p.turnNumber) || !integer(p.sentAt) || !integer(p.serverNow) || !integer(p.expiresAt)
    || p.serverNow < p.sentAt || p.expiresAt <= p.serverNow || !['CURSOR', 'ADVICE'].includes(String(p.kind))) return true
  const ttl = p.expiresAt - p.sentAt
  if (ttl <= 0 || ttl > (p.kind === 'CURSOR' ? 2000 : 4000)) return true
  const finite = (key: string) => typeof p[key] === 'number' && Number.isFinite(p[key])
  if (p.kind === 'CURSOR' ? !finite('x') || !finite('y') || Math.abs(Number(p.x)) > 4.5 || Math.abs(Number(p.y)) > 5
    : typeof p.pieceId !== 'string' || !finite('dx') || !finite('dy') || !finite('power')
      || Math.hypot(Number(p.dx), Number(p.dy)) > 1.0001 || Math.hypot(Number(p.dx), Number(p.dy)) < .9999
      || Number(p.power) <= 0 || Number(p.power) > 1) return true
  if (useAlkkagiSocial.getState().gameId !== gameId) resetAlkkagiSocial()
  if (seen.has(p.eventId)) return true
  const mono = performance.now()
  const serverNow = Math.max(p.serverNow, estimatedServerNow ?? (environmentClock.ready ? environmentClock.now(mono) : p.serverNow))
  if (p.expiresAt <= serverNow) return true
  const until = mono + p.expiresAt - serverNow
  seen.set(p.eventId, until)
  if (seen.size > 512) seen.delete(seen.keys().next().value!)
  const mark = { ...p, until } as unknown as Mark
  useAlkkagiSocial.setState(s => ({ gameId, marks: [...s.marks.filter(m => m.until > performance.now()
    && !(m.senderUserId === mark.senderUserId && m.kind === mark.kind)), mark].slice(-64) }))
  clearTimeout(timer); timer = setTimeout(prune, 100)
  return true
}
export function syncAlkkagiSocial(gameId: string, version: number, aiming: boolean) {
  const feed = useAlkkagiSocial.getState()
  if (feed.gameId && feed.gameId !== gameId) { resetAlkkagiSocial(); return }
  const marks = aiming ? feed.marks.filter(m => m.basedOnVersion === version) : []
  if (marks.length !== feed.marks.length) useAlkkagiSocial.setState({ marks })
}
export function alkkagiSocialView(gameId: string, turnNumber: number, aiming: boolean, ownId: string): SocialView {
  const feed = useAlkkagiSocial.getState()
  const marks = feed.gameId === gameId && aiming ? feed.marks.filter(m => m.turnNumber === turnNumber && m.until > performance.now()) : []
  return { chat: [], cursors: marks.filter(m => m.kind === 'CURSOR' && m.senderUserId !== ownId).map(m => ({
    id: m.eventId, label: m.senderUserId, actor: -1, x: m.x, y: m.y, expiresAt: m.until })),
    advice: marks.filter(m => m.kind === 'ADVICE').slice(-3).map(m => ({ id: m.eventId, label: m.senderUserId,
      turnNumber, pieceId: m.pieceId, dx: m.dx, dy: m.dy, power: m.power, expiresAt: m.until })) }
}
