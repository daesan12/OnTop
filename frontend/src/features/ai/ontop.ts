import { create } from 'zustand'

export interface OntopActor {
  channelId: string; version: number; id: string; name: string
  x: number; y: number; z: number; yaw: number; action: string
  opponentId: string; result: string; endsAt: number; speech: string; speechUntil: number
}
export interface OntopReply {
  channelId: string; userId: string; id: string; text: string; speech: string
  source: string; closed: boolean; pending: boolean; invited: boolean
}
export const useOntop = create<{
  actor: OntopActor | null; receivedAt: number; talking: boolean; replies: OntopReply[]
}>(() => ({ actor: null, receivedAt: 0, talking: false, replies: [] }))

export const isOntopCommand = (text: string) => /^\/온탑(?:\s|$)/u.test(text.trim())
export function ontopChatText(text: string, talking: boolean) {
  return talking && !isOntopCommand(text) ? '/온탑 ' + text.trim() : text.trim()
}
export function acceptOntopActor(p: Record<string, unknown>, channel: string) {
  const previous = useOntop.getState().actor
  if (p.channelId !== channel || !Number.isSafeInteger(p.version) || Number(p.version) < 1
    || previous && Number(p.version) <= previous.version || typeof p.id !== 'string' || !p.id.startsWith('npc-ontop-')
    || p.name !== '온탑' || !['x', 'y', 'z', 'yaw', 'endsAt', 'speechUntil'].every(k => typeof p[k] === 'number' && Number.isFinite(p[k]))
    || !['action', 'opponentId', 'result', 'speech'].every(k => typeof p[k] === 'string') || String(p.speech).length > 400) return false
  useOntop.setState({ actor: p as unknown as OntopActor, receivedAt: performance.now() })
  return true
}
export function acceptOntopReply(p: Record<string, unknown>, channel: string, self: string) {
  if (p.channelId !== channel || p.userId !== self || typeof p.id !== 'string' || p.id.length > 100
    || !['text', 'speech', 'source'].every(k => typeof p[k] === 'string') || String(p.text).length > 400
    || String(p.speech).length > 700 || !['closed', 'pending', 'invited'].every(k => typeof p[k] === 'boolean')) return false
  const reply = p as unknown as OntopReply
  useOntop.setState(s => ({ talking: !reply.closed,
    replies: [...s.replies.filter(previous => previous.id !== reply.id), reply].slice(-30) }))
  return true
}
export function resetOntop() {
  useOntop.setState({ actor: null, receivedAt: 0, talking: false, replies: [] })
}

export const ontopResult = (result: string) => ({
  PLAYER_WON: '도전자가 이겼어요!', ONTOP_WON: '온탑이 이겼어요!', TIMEOUT: '시간 종료 · 무승부',
  STOPPED: '눈싸움을 마쳤어요', LEFT: '눈싸움 상대가 떠났어요',
}[result] ?? '')
