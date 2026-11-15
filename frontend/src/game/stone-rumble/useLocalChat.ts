import { useCallback, useEffect, useRef, useState } from 'react'
import { filterChat } from '../../features/chat/filterChat'
import { spectatorText } from '../omok/spectatorEvents'
import type { StoneChatMessage, StoneChatPort } from './StoneRumbleChat'

/** loopback demo만 사용한다. 운영 전송은 공통 runtime.sendSpectatorChat이다. */
export function useLocalChat(gameId: string, role: string, clientId: string, connected: boolean, playing: boolean): StoneChatPort {
  const [feed, setFeed] = useState({ gameId: '', revision: -1, messages: [] as StoneChatMessage[] })
  const generation = useRef(0)
  const accept = useCallback((body: { revision: number; messages: StoneChatMessage[] }) => {
    if (!Number.isSafeInteger(body.revision) || !Array.isArray(body.messages)) return
    setFeed(previous => previous.gameId === gameId && previous.revision > body.revision ? previous : { gameId, ...body })
  }, [gameId])
  useEffect(() => {
    const epoch = ++generation.current, abort = new AbortController()
    if (!gameId || !connected) return
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const response = await fetch(`/dev/stone-rumble/chat?${new URLSearchParams({ gameId, role, clientId })}`, { signal: abort.signal })
        if (response.ok) { const body = await response.json(); if (generation.current === epoch) accept(body) }
      } catch { /* 다음 조회에서 복구하며 전송 내용을 재시도하지 않는다. */ }
      if (!abort.signal.aborted) timer = setTimeout(() => void poll(), 800)
    }
    void poll()
    return () => { generation.current++; abort.abort(); clearTimeout(timer) }
  }, [gameId, role, clientId, connected, accept])
  const send = useCallback(async (value: string) => {
    if (!gameId || !connected || !playing) return false
    const epoch = generation.current
    const response = await fetch(`/dev/stone-rumble/chat?${new URLSearchParams({ gameId, role, clientId })}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Stone-Rumble-Demo': 'local' },
      body: JSON.stringify({ eventId: crypto.randomUUID(), text: spectatorText(filterChat(value)) }),
    })
    if (!response.ok) return false
    const body = await response.json()
    if (generation.current !== epoch) return false
    accept(body); return true
  }, [gameId, role, clientId, connected, playing, accept])
  return { messages: feed.gameId === gameId ? feed.messages : [], canSend: connected && playing, send }
}
