import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { WORLD, PARK_SIZE, NETWORK } from '../../park/mapConfig'
import { avatars, useSession } from '../../network/worldClient'
import { inputState } from '../../world/inputOwnership'
import { ParkMapBackground } from './ParkMapBackground'
import type { Destination } from './parkNavigation'
import { PARK_MAP_PLACES, type MapPlace } from './mapPlaces'
import { useNavigation, cancelNavigation, useParkMap, openParkMap, closeParkMap, selectDestination } from './navigationState'
import './navigation.css'
import mapIcon from '../parkMenus/icons/dock-map.svg'
import { gameplayMenusLocked, useGameplayMenusLocked } from '../parkMenus/gameplayLock'
import { displayNickname } from '../gameMaster/displayName'
function canOpen() {
  return !gameplayMenusLocked() && useSession.getState().status === 'connected' && !Object.entries(inputState).some(([key, value]) => key !== 'mapOpen' && value)
    && !document.querySelector('dialog[open], [role="dialog"]')
}
export function ParkMap() {
  const gameplayLocked = useGameplayMenusLocked()
  const open = useParkMap(s => s.open), path = useNavigation(s => s.path), destination = useNavigation(s => s.target)
  const status = useSession(s => s.status), compatible = useSession(s => s.mapCompatible)
  const panel = useRef<HTMLDialogElement>(null), launcher = useRef<HTMLButtonElement>(null), previousFocus = useRef<HTMLElement | null>(null)
  const [position, setPosition] = useState<{ x: number; z: number } | null>(null)
  const [players, setPlayers] = useState<{ id: string; x: number; z: number; nickname: string }[]>([])
  const [hovered, setHovered] = useState('')
  const [selectedPlayerId, setSelectedPlayerId] = useState('')
  const displayedPlayer = players.find(player => player.id === (hovered || selectedPlayerId))
  useLayoutEffect(() => { if (gameplayLocked) { closeParkMap(); cancelNavigation() } }, [gameplayLocked])
  const choose = (target: Destination) => {
    const s = useSession.getState()
    if (s.status === 'connected' && s.mapCompatible) selectDestination(target, s.sessionId, s.roomId)
  }
  const choosePlace = (place: MapPlace) => choose(place.destination)
  const selectedPlace = destination ? PARK_MAP_PLACES.find(place => place.destination.x === destination.x && place.destination.z === destination.z)?.id : undefined
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(target.tagName))) return
      if (event.code !== 'KeyM' && !(event.code === 'Escape' && useParkMap.getState().open)) return
      if (!useParkMap.getState().open && !canOpen()) return
      event.preventDefault(); event.stopImmediatePropagation()
      if (useParkMap.getState().open) closeParkMap(); else openParkMap()
    }
    window.addEventListener('keydown', key, true)
    window.addEventListener('ontop-manual-open', closeParkMap)
    const unsubscribe = useSession.subscribe((s, old) => {
      if (s.status !== 'connected') closeParkMap()
      if (s.sessionId !== old.sessionId || s.roomId !== old.roomId) { closeParkMap(); cancelNavigation() }
    })
    return () => { window.removeEventListener('keydown', key, true); window.removeEventListener('ontop-manual-open', closeParkMap); unsubscribe(); closeParkMap(); cancelNavigation() }
  }, [])
  useLayoutEffect(() => {
    const dialog = panel.current
    if (open && dialog && !dialog.open) {
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      if (document.pointerLockElement) document.exitPointerLock()
      dialog.showModal()
    } else if (!open && dialog?.open) {
      dialog.close(); setHovered(''); setSelectedPlayerId('')
      if (!inputState.manualOpen) (previousFocus.current?.isConnected ? previousFocus.current : document.querySelector<HTMLCanvasElement>('canvas') ?? launcher.current)?.focus({ preventScroll: true })
    }
  }, [open])
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'
    const read = () => {
      const s = useSession.getState(), own = avatars.get(s.sessionId)?.current
      setPosition(own ? { x: own.x, z: own.z } : null)
      const nextPlayers = s.ids.slice(0, NETWORK.maxClients).flatMap(id => {
        const avatar = avatars.get(id)
        return avatar?.connected && id !== s.sessionId ? [{ id, x: avatar.current.x, z: avatar.current.z,
          nickname: displayNickname(s.profiles[id], avatar.nickname) }] : []
      })
      setPlayers(nextPlayers)
      setSelectedPlayerId(id => nextPlayers.some(player => player.id === id) ? id : '')
      setHovered(id => nextPlayers.some(player => player.id === id) ? id : '')
    }
    read(); const timer = setInterval(read, 500)
    return () => { clearInterval(timer); document.body.style.overflow = previous }
  }, [open])
  return <aside className="park-map" aria-label="공원 안내 지도">
    <button ref={launcher} className="park-quick-button" aria-label="공원 지도" aria-keyshortcuts="M" aria-controls="park-map-panel" aria-expanded={open} disabled={status !== 'connected' || gameplayLocked} title={gameplayLocked ? '게임 중에는 지도를 사용할 수 없어요.' : undefined} onClick={() => { if (open) closeParkMap(); else if (canOpen()) openParkMap() }}>
      <img src={mapIcon} alt="" /><span>지도</span><kbd>M</kbd>
    </button>
    <dialog ref={panel} id="park-map-panel" className="park-map-panel" aria-label="공원 지도창" onCancel={event => { event.preventDefault(); closeParkMap() }} onClose={() => { if (!panel.current?.open) closeParkMap() }} onKeyDown={event=>{
      event.stopPropagation()
      if(event.key!=='Tab')return
      const items=[...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]')].filter(el=>el.getClientRects().length>0)
      const first=items[0],last=items.at(-1)
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
    }}>
      {open && <>
        <header className="park-map-heading">
          <span className="park-map-heading__icon" aria-hidden="true"><img src={mapIcon} alt="" /></span>
          <div><h2>공원 지도</h2><p>장소를 누르면 길 안내, 이용자를 누르면 닉네임을 확인해요</p></div>
          <button className="park-map-close" aria-label="지도 닫기" onClick={closeParkMap}>×</button>
        </header>
        {!compatible && <p className="park-map-alert" role="alert">현재 서버의 맵 버전을 확인하지 못해 길 안내를 사용할 수 없어요.</p>}
        <div className="park-map-body">
        <figure className="park-map-figure">
        <svg viewBox={`${-WORLD.halfSize - 10} ${-WORLD.halfSize - 10} ${PARK_SIZE + 20} ${PARK_SIZE + 20}`} role="group" aria-label="공원 구역과 현재 위치" onClick={event => {
          const matrix = event.currentTarget.getScreenCTM(); if (!matrix) return
          const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
          choose({ x: point.x, z: point.y, name: '선택한 지점' })
        }}>
          <ParkMapBackground />
          {path.length > 1 && <polyline className="navigation-map-route" points={path.map(p => `${p.x},${p.z}`).join(' ')} fill="none" stroke="#06bfc1" strokeWidth={2} strokeLinejoin="round" pointerEvents="none" />}
          {destination && <circle cx={destination.x} cy={destination.z} r={3.2} fill="#06bfc1" stroke="#fff" strokeWidth={1.2} pointerEvents="none" />}
          {PARK_MAP_PLACES.map((place,index) => <g key={place.id} className="park-map-zone" data-place-id={place.id} data-selected={place.id===selectedPlace} role="button" tabIndex={compatible ? 0 : -1} aria-disabled={!compatible} aria-label={`${place.name} 길 안내`} style={{cursor:compatible?'pointer':'default'}} onClick={event=>{event.stopPropagation();choosePlace(place)}} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();choosePlace(place)}}}>
            <circle cx={place.x} cy={place.z} r={place.small?2.7:4.2} /><text x={place.x} y={place.z+(place.small?1.2:1.75)} textAnchor="middle" fontSize={place.small?3.6:5}>{index+1}</text><title>{place.name}</title>
          </g>)}
          {/* Keep live positions exact. Player markers take clicks over zones;
              the matching place remains available in the destination list. */}
          {players.map(player=><g key={player.id} className="park-map-player" role="button" aria-label={`${player.nickname} 위치`} aria-pressed={player.id===selectedPlayerId} tabIndex={0}
            onClick={event=>{event.stopPropagation();setSelectedPlayerId(player.id)}}
            onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();setSelectedPlayerId(player.id)}}}
            onMouseEnter={()=>setHovered(player.id)} onMouseLeave={()=>setHovered('')} onFocus={()=>setHovered(player.id)} onBlur={()=>setHovered('')}>
            <circle cx={player.x} cy={player.z} r={3.2} fill="#efb84f" stroke="#fff9e7" strokeWidth={1.2}/><title>{player.nickname}</title>
          </g>)}
          {position && <circle aria-label="현재 내 위치" cx={position.x} cy={position.z} r={2.6} fill="#267cef" stroke="white" strokeWidth={1.6} />}
        </svg>
        <p className="park-map-player-info" role="status">{displayedPlayer ? <><strong>{displayedPlayer.nickname}</strong><span>현재 위치</span></> : '노란 이용자 표시를 누르면 닉네임이 보여요.'}</p>
        {/* Legend and compass share the strip under the map, so neither covers it. */}
        <figcaption className="park-map-footer">
          <span className="park-map-legend"><span><i data-kind="me" />내 위치</span><span><i data-kind="player" />다른 이용자</span><span><i data-kind="target" />목적지</span></span>
          <svg className="park-map-compass" viewBox="0 0 48 48" role="img" aria-label="북쪽이 지도 위쪽">
            <circle cx="24" cy="24" r="21" className="park-map-compass__ring" />
            <path d="M24 17 28.5 27 19.5 27Z" className="park-map-compass__north" />
            <path d="M24 40 28.5 27 19.5 27Z" className="park-map-compass__south" />
            <text x="24" y="14" textAnchor="middle" className="park-map-compass__label">N</text>
          </svg>
        </figcaption>
        </figure>
        <div className="park-map-side">
          {destination && <section className="park-map-route" aria-label="안내 중인 목적지">
            <small>길 안내 중</small><b>{destination.name}</b>
            <button type="button" onClick={cancelNavigation}>안내 취소</button>
          </section>}
          <h3>장소 바로가기</h3>
          <div className="map-destinations" role="group" aria-label="장소 바로가기 목록" tabIndex={0}>{PARK_MAP_PLACES.map((place,index)=><button key={place.id} className="map-destination" aria-label={`${index+1}. ${place.name}`} aria-pressed={place.id===selectedPlace} disabled={!compatible} onClick={()=>choosePlace(place)}>
            <span aria-hidden="true">{index+1}</span>{place.name}
          </button>)}</div>
        </div>
        </div>
        <p className="park-map-note">호수의 나뉜 돌 표시는 징검다리, 갈색 판자는 나무다리예요.<br/>M / Esc로 닫고 직접 이동해요. 전망대는 지상 입구까지, 장애물 지점은 통행 가능한 주변 약 3m까지 안내해요.</p>
      </>}
    </dialog>
  </aside>
}
