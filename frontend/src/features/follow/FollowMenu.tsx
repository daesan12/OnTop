import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { avatars, useSession } from '../../network/worldClient'
import { clearRoamingInput, inputState, panelOwnsKeys } from '../../world/inputOwnership'
import { canControlRoamingCamera } from '../../world/roamingCamera'
import { followAvailability, requestFollow } from './controller'
import { followService } from './service'
import { resetFollow, sameFollowScope, useFollow } from './state'
import './follow.css'

export interface AvatarMenuRequest { id: string; x: number; y: number }
export function openAvatarMenu(detail: AvatarMenuRequest) {
  if (typeof window !== 'undefined' && canControlRoamingCamera() && detail.id !== useSession.getState().sessionId)
    window.dispatchEvent(new CustomEvent('ontop-avatar-menu', { detail }))
}
export function FollowMenu() {
  const session = useSession(useShallow(s => ({ sessionId: s.sessionId, roomId: s.roomId, status: s.status,
    ids: s.ids, profiles: s.profiles, tableId: s.tableId, benchId: s.benchId, fitnessId: s.fitnessId, telescopeId: s.telescopeId })))
  const state = useFollow()
  const [menu, setMenu] = useState<AvatarMenuRequest | null>(null), [nearby, setNearby] = useState(false)
  const element = useRef<HTMLDivElement>(null), previousFocus = useRef<HTMLElement | null>(null)
  const isOpen = !!menu || nearby
  const target = sameFollowScope(state.scope, { userId: session.sessionId, channelId: session.roomId })
    ? state.links.find(link => link.followerId === session.sessionId)?.targetId : undefined
  useEffect(() => {
    const show = (event: Event) => { setNearby(false); setMenu((event as CustomEvent<AvatarMenuRequest>).detail) }
    window.addEventListener('ontop-avatar-menu', show)
    return () => window.removeEventListener('ontop-avatar-menu', show)
  }, [])
  useEffect(() => { resetFollow(); setMenu(null); setNearby(false); return resetFollow }, [session.sessionId, session.roomId, session.status])
  useEffect(() => {
    if (!isOpen) return
    previousFocus.current = document.activeElement as HTMLElement | null
    inputState.followMenuOpen = true; clearRoamingInput()
    element.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus()
    const outside = (event: PointerEvent) => { if (!element.current?.contains(event.target as Node)) { setMenu(null); setNearby(false) } }
    const timer = setInterval(() => {
      if (inputState.manualOpen || inputState.mapOpen || inputState.feedbackOpen || inputState.notesOpen
        || session.status !== 'connected' || menu && !avatars.get(menu.id)?.connected) { setMenu(null); setNearby(false) }
    }, 200)
    window.addEventListener('pointerdown', outside)
    return () => {
      window.removeEventListener('pointerdown', outside); clearInterval(timer)
      inputState.followMenuOpen = false; clearRoamingInput()
      if (!inputState.manualOpen && useSession.getState().status === 'connected')
        (previousFocus.current?.isConnected ? previousFocus.current : document.querySelector<HTMLCanvasElement>('canvas'))?.focus({ preventScroll: true })
    }
  }, [isOpen, menu, session.status])
  const close = () => { setMenu(null); setNearby(false) }
  const nickname = (id: string) => session.profiles[id]?.nickname ?? '산책자 ' + id.slice(-6)
  const candidates = session.ids.filter(id => id !== session.sessionId && !followAvailability(id))
  const reason = menu ? followAvailability(menu.id) : ''
  return <>
    {session.status === 'connected' && !session.tableId && !session.benchId && !session.fitnessId && !session.telescopeId && <button
      type="button" className="follow-launcher" aria-expanded={isOpen} aria-label="이웃 메뉴 열기"
      onClick={() => { if (!panelOwnsKeys() || isOpen) { setMenu(null); setNearby(!nearby) } }}>이웃 메뉴</button>}
    {isOpen && <div ref={element} className="follow-menu" role="menu" aria-label={menu ? `${nickname(menu.id)} 메뉴` : '주변 이용자'}
      style={menu ? { left: Math.max(8, Math.min(innerWidth - 288, menu.x)), top: Math.max(8, Math.min(innerHeight - 260, menu.y)) } : undefined}
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
      <strong>{menu ? nickname(menu.id) : '가까운 이웃'}</strong>
      {menu ? <>
        <button type="button" role="menuitem" disabled={!!reason || state.pending || followService.mode === 'unavailable'}
          onClick={() => { void requestFollow(menu.id); close() }}>따라가기</button>
        <small>{reason || (followService.mode === 'unavailable' ? '따라가기 서버 연결이 준비 중이에요.' : followService.mode === 'preview' ? '개발 미리보기 · 실제 자동 이동은 하지 않아요.' : '서버 승인 후 따라가요.')}</small>
      </> : candidates.length ? candidates.map(id => <button key={id} type="button" role="menuitem"
        onClick={() => { setNearby(false); setMenu({ id, x: innerWidth - 304, y: 180 }) }}>{nickname(id)}</button>) : <small>가까이 산책 중인 이웃이 없어요.</small>}
      <button type="button" role="menuitem" onClick={close}>닫기</button>
    </div>}
    {target && <aside className="follow-status" aria-label="따라가기 상태"><span>{nickname(target)} 따라가는 중</span>
      {followService.mode === 'preview' && <small>개발 미리보기 · 관계·줄 표시만 확인 / 실제 자동 이동 없음</small>}
      <button type="button" disabled={state.pending || followService.mode === 'unavailable'} onClick={() => void requestFollow(null)}>따라가기 종료</button></aside>}
    {state.error && <aside className="follow-status follow-error" role="alert">{state.error}
      <button type="button" onClick={() => useFollow.setState({ error: '' })}>닫기</button></aside>}
  </>
}
