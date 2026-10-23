import type { EmoteId } from '../catalog'

/** Missing actions only, local to this page. Never broadcasts or falls back on a server error. */
export function mockEmote(motion: EmoteId, channelId: string, userId: string, signal: AbortSignal) {
  return new Promise<{ motion: EmoteId; eventId: string; channelId: string; userId: string; sentAt: string }>((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(new Error('감정표현 목업 요청이 취소되었습니다.')) }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel)
      if (signal.aborted) return cancel()
      resolve({ motion, eventId: crypto.randomUUID(), channelId, userId, sentAt: new Date().toISOString() })
    }, 160)
    if (signal.aborted) cancel()
    else signal.addEventListener('abort', cancel, { once: true })
  })
}
