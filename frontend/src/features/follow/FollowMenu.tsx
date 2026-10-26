import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { avatars, useSession } from '../../network/worldClient'
import { clearRoamingInput, inputState } from '../../world/inputOwnership'
import { canControlRoamingCamera } from '../../world/roamingCamera'
import { followAvailability, requestFollow } from './controller'
import { followService } from './service'
import { sameFollowScope, useFollow } from './state'
import './follow.css'

export interface AvatarMenuRequest { id: string; x: number; y: number }
export function openAvatarMenu(detail: AvatarMenuRequest) {
  if (typeof window !== 'undefined' && canControlRoamingCamera() && detail.id !== useSession.getState().sessionId)
    window.dispatchEvent(new CustomEvent('ontop-avatar-menu', { detail }))
}
export function FollowMenu() {
  const session = useSession(useShallow(s => ({ sessionId: s.sessionId, roomId: s.roomId, status: s.status, profiles: s.profiles })))
  const state = useFollow()
  // Opened by right-clicking an avatar; the HUD has no separate 이웃 메뉴 launcher.
  const [menu, setMenu] = useState<AvatarMenuRequest | null>(null)
  const element = useRef<HTMLDivElement>(null), previousFocus = useRef<HTMLElement | null>(null)
  const isOpen = !!menu
  const target = sameFollowScope(state.scope, { userId: session.sessionId, channelId: session.roomId })
    ? state.links.find(link => link.followerId === session.sessionId)?.targetId : undefined
  useEffect(() => {
    const show = (event: Event) => setMenu((event as CustomEvent<AvatarMenuRequest>).detail)
    window.addEventListener('ontop-avatar-menu', show)
    return () => window.removeEventListener('ontop-avatar-menu', show)
  }, [])
  useEffect(() => { setMenu(null) }, [session.sessionId, session.roomId, session.status])
  useEffect(() => {
    if (!isOpen) return
    previousFocus.current = document.activeElement as HTMLElement | null
    inputState.followMenuOpen = true; clearRoamingInput()
    element.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus()
    const outside = (event: PointerEvent) => { if (!element.current?.contains(event.target as Node)) setMenu(null) }
    const timer = setInterval(() => {
      if (inputState.manualOpen || inputState.mapOpen || inputState.feedbackOpen || inputState.notesOpen
        || session.status !== 'connected' || menu && !avatars.get(menu.id)?.connected) setMenu(null)
    }, 200)
    window.addEventListener('pointerdown', outside)
    return () => {
      window.removeEventListener('pointerdown', outside); clearInterval(timer)
      inputState.followMenuOpen = false; clearRoamingInput()
      if (!inputState.manualOpen && useSession.getState().status === 'connected')
        (previousFocus.current?.isConnected ? previousFocus.current : document.querySelector<HTMLCanvasElement>('canvas'))?.focus({ preventScroll: true })
    }
  }, [isOpen, menu, session.status])
  const close = () => setMenu(null)
  const nickname = (id: string) => session.profiles[id]?.nickname ?? '산책자 ' + id.slice(-6)
  const reason = menu ? followAvailability(menu.id) : ''
  return <>
    {menu && <div ref={element} className="follow-menu" role="menu" aria-label={`${nickname(menu.id)} 메뉴`}
      style={{ left: Math.max(8, Math.min(innerWidth - 288, menu.x)), top: Math.max(8, Math.min(innerHeight - 260, menu.y)) }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || event.code === 'F1') return
        event.stopPropagation()
        const controls = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
        const index = controls.indexOf(document.activeElement as HTMLButtonElement)
        if (event.key === 'Escape' || event.key === 'Tab') { if (event.key === 'Escape') event.preventDefault(); close() }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); controls[(index + (event.key === 'ArrowDown' ? 1 : controls.length - 1)) % controls.length]?.focus()
        }
      }}>
      <strong>{nickname(menu.id)}</strong>
      <button type="button" role="menuitem" disabled={!!reason || state.pending || followService.mode === 'unavailable' || followService.mode === 'server' && (!state.ready || state.checking)}
        onClick={() => { void requestFollow(menu.id); close() }}>따라가기</button>
      <small>{reason || (followService.mode === 'unavailable' ? '따라가기 서버 연결이 준비 중이에요.' : followService.mode === 'preview' ? '개발 미리보기 · 실제 자동 이동은 하지 않아요.' : !state.ready || state.checking ? '따라가기 상태를 확인하고 있어요.' : '서버 승인 후 따라가요.')}</small>
      <button type="button" role="menuitem" onClick={close}>닫기</button>
    </div>}
    {target && <aside className="follow-status" aria-label="따라가기 상태"><span>{nickname(target)} 따라가는 중</span>
      {followService.mode === 'preview' && <small>개발 미리보기 · 관계·줄 표시만 확인 / 실제 자동 이동 없음</small>}
      <button type="button" disabled={state.pending || followService.mode === 'unavailable' || followService.mode === 'server' && (!state.ready || state.checking)} onClick={() => void requestFollow(null)}>따라가기 종료</button></aside>}
    {state.error && <aside className="follow-status follow-error" role="alert">{state.error}
      {followService.mode === 'server' && <button type="button" disabled={state.pending || state.checking}
        onClick={() => { void followService.check?.().catch(() => {}) }}>따라가기 상태 재조회</button>}
      <button type="button" onClick={() => useFollow.setState({ error: '' })}>닫기</button></aside>}
  </>
}
