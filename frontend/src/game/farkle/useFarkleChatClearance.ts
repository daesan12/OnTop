import { useLayoutEffect } from 'react'

/** Reserve space for the unmodified park chat instead of shrinking its skin. */
export function useFarkleChatClearance(gameId: string) {
  useLayoutEffect(() => {
    if (!gameId) return
    const root = document.querySelector<HTMLElement>('.farkle-player-hud')
    const chat = document.querySelector<HTMLElement>('.park-chat')
    if (!root || !chat) return
    const update = () => {
      const bounds = chat.getBoundingClientRect()
      root.dataset.chatLayout = !bounds.width ? 'clear' : innerWidth < 700 ? 'above' : innerWidth < 1290 ? 'beside' : 'clear'
      root.style.setProperty('--farkle-chat-right', `${Math.ceil(bounds.right + 12)}px`)
      root.style.setProperty('--farkle-chat-bottom', `${Math.ceil(innerHeight - bounds.top + 12)}px`)
      root.style.setProperty('--farkle-chat-space', `${Math.max(112, Math.floor(bounds.top - 252))}px`)
    }
    let frame = 0
    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; update() }) }
    const observer = new ResizeObserver(schedule)
    observer.observe(chat)
    window.addEventListener('resize', schedule)
    update()
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', schedule)
      delete root.dataset.chatLayout
      for (const key of ['--farkle-chat-right', '--farkle-chat-bottom', '--farkle-chat-space']) root.style.removeProperty(key)
    }
  }, [gameId])
}
