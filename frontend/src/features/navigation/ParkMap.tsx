import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { WORLD, PARK_SIZE, PARK_ZONES, NETWORK } from '../../park/mapConfig'
import { avatars, useSession } from '../../network/worldClient'
import { inputState } from '../../world/inputOwnership'
import { ParkMapBackground } from './ParkMapBackground'
import { placeMapMarkers } from './mapMarkers'
import { PARK_DESTINATIONS, type Destination } from './parkNavigation'
import { useNavigation, cancelNavigation, useParkMap, openParkMap, closeParkMap, selectDestination } from './navigationState'
import './navigation.css'

const zoneName = (zone: typeof PARK_ZONES[number]) => zone.id === 'vr' ? 'VR 구역 · 주변' : zone.name
function canOpen() {
  return useSession.getState().status === 'connected' && !Object.entries(inputState).some(([key, value]) => key !== 'mapOpen' && value)
    && !document.querySelector('dialog[open], [role="dialog"]')
}
export function ParkMap() {
  const open = useParkMap(s => s.open), path = useNavigation(s => s.path), destination = useNavigation(s => s.target)
  const status = useSession(s => s.status), compatible = useSession(s => s.mapCompatible)
  const panel = useRef<HTMLDialogElement>(null), launcher = useRef<HTMLButtonElement>(null), previousFocus = useRef<HTMLElement | null>(null)
  const [position, setPosition] = useState<{ x: number; z: number } | null>(null)
  const [players, setPlayers] = useState<{ id: string; x: number; z: number; nickname: string }[]>([])
  const [hovered, setHovered] = useState('')
  const choose = (target: Destination) => {
    const s = useSession.getState()
    if (s.status === 'connected' && s.mapCompatible) selectDestination(target, s.sessionId, s.roomId)
  }
  const chooseZone = (zone: typeof PARK_ZONES[number]) => choose({ ...PARK_DESTINATIONS[zone.id]!, name: zoneName(zone) + ' · 입구/주변' })
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
      dialog.close(); setHovered('')
      if (!inputState.manualOpen) (previousFocus.current?.isConnected ? previousFocus.current : document.querySelector<HTMLCanvasElement>('canvas') ?? launcher.current)?.focus({ preventScroll: true })
    }
  }, [open])
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'
    const read = () => {
      const s = useSession.getState(), own = avatars.get(s.sessionId)?.current
      setPosition(own ? { x: own.x, z: own.z } : null)
      setPlayers(s.ids.slice(0, NETWORK.maxClients).flatMap(id => {
        const avatar = avatars.get(id)
        return avatar?.connected && id !== s.sessionId ? [{ id, x: avatar.current.x, z: avatar.current.z, nickname: avatar.nickname }] : []
      }))
    }
    read(); const timer = setInterval(read, 500)
    return () => { clearInterval(timer); document.body.style.overflow = previous }
  }, [open])
  return <aside className="park-map" aria-label="공원 안내 지도">
    <button ref={launcher} className="park-quick-button" aria-label="공원 지도" aria-keyshortcuts="M" aria-controls="park-map-panel" aria-expanded={open} disabled={status !== 'connected'} onClick={() => { if (open) closeParkMap(); else if (canOpen()) openParkMap() }}>
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Z" /><path d="M9 3v16M15 5v16" /></svg><span>지도</span><kbd>M</kbd>
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
        <div className="park-map-heading"><strong>공원 지도</strong><button aria-label="지도 닫기" onClick={closeParkMap}>×</button></div>
        <p className="park-map-note">북쪽 ↑ · 장소나 지도 위 지점을 눌러 길 안내</p>
        {!compatible && <p role="alert">현재 서버의 맵 버전을 확인하지 못해 길 안내를 사용할 수 없어요.</p>}
        <svg viewBox={`${-WORLD.halfSize - 10} ${-WORLD.halfSize - 10} ${PARK_SIZE + 20} ${PARK_SIZE + 20}`} role="group" aria-label="공원 구역과 현재 위치" onClick={event => {
          const matrix = event.currentTarget.getScreenCTM(); if (!matrix) return
          const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
          choose({ x: point.x, z: point.y, name: '선택한 지점' })
        }}>
          <ParkMapBackground />
          {path.length > 1 && <polyline className="navigation-map-route" points={path.map(p => `${p.x},${p.z}`).join(' ')} fill="none" stroke="#06bfc1" strokeWidth={2} strokeLinejoin="round" pointerEvents="none" />}
          {destination && <circle cx={destination.x} cy={destination.z} r={4} fill="#06bfc1" stroke="#fff" strokeWidth={1.5} pointerEvents="none" />}
          {PARK_ZONES.map((zone,index) => <g key={zone.id} role="button" tabIndex={compatible ? 0 : -1} aria-disabled={!compatible} aria-label={`${zoneName(zone)} 길 안내`} style={{cursor:compatible?'pointer':'default'}} onClick={event=>{event.stopPropagation();chooseZone(zone)}} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();chooseZone(zone)}}}>
            <circle cx={zone.x} cy={zone.z} r={5.5} fill="#294d40" /><text x={zone.x} y={zone.z+2.2} textAnchor="middle" fill="#fff9e1" fontSize={6.5}>{index+1}</text>
          </g>)}
          {position && <circle aria-label="현재 내 위치" cx={position.x} cy={position.z} r={3} fill="#267cef" stroke="white" strokeWidth={2} />}
          {placeMapMarkers(players,position,PARK_ZONES).map(player=>{
            const x=player.drawX,z=player.drawZ,offset=x!==player.x||z!==player.z
            return <g key={player.id}>
              {offset&&<line x1={player.x} y1={player.z} x2={x} y2={z} stroke="#896e3f" strokeWidth={0.7} pointerEvents="none"/>}
              <g role="img" aria-label={`${player.nickname} 위치`} tabIndex={0} onClick={event=>event.stopPropagation()} onMouseEnter={()=>setHovered(player.id)} onMouseLeave={()=>setHovered('')} onFocus={()=>setHovered(player.id)} onBlur={()=>setHovered('')}>
                <circle cx={x} cy={z} r={4.3} fill="#efb84f" stroke="#fff9e7" strokeWidth={1.5}/><title>{player.nickname}</title>
              </g>
            </g>
          })}
        </svg>
        <p className="park-map-hover" role="status">{hovered?`${players.find(p=>p.id===hovered)?.nickname??'이용자'} · 현재 위치`:'\u00a0'}</p>
        <div className="map-destinations">{PARK_ZONES.map((zone,index)=><button key={zone.id} className="map-destination" disabled={!compatible} onClick={()=>chooseZone(zone)}>{index+1}. {zoneName(zone)}</button>)}</div>
        <p className="park-map-note">M / Esc로 닫고 직접 이동해요. 전망대는 지상 입구까지, 장애물 지점은 통행 가능한 주변 약 3m까지 안내해요.</p>
      </>}
    </dialog>
  </aside>
}
