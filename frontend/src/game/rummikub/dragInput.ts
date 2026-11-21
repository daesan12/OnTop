import { useEffect, useRef, useState, type RefObject } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Group, Plane, Raycaster, Vector2, Vector3 } from 'three'
import { useSession } from '../../network/worldClient'
import { panelOwnsKeys, scenePointerOwners } from '../../world/inputOwnership'
import { seatScope, useTableLobby } from '../../features/tableLobby/state'
import { useGame } from '../store'
import { canActRummikub } from './actions'
import { useRummikubDraft, toggleRummikubTile } from './draft'
import { editTiles } from './edit'
import { tileDropTarget } from './layout'
import type { Placed, Rummikub, Tile } from './protocol'

type Context = { enabled: boolean; gameId: string; version: number; state: Rummikub | null; melds: Placed[][]; hand: Tile[] }
type Drag = { pointerId: number; x: number; y: number; moved: boolean; tile: string; ids: string[]; context: Context; point: Vector3 | null }
const owner = 'supae-tile'
const hint = (message: string) => { if (useRummikubDraft.getState().hint !== message) useRummikubDraft.setState({hint:message}) }

/** Native capture keeps the tile attached to the pointer outside individual meshes.
 * Frequent positions stay in refs; only draft edits and drag start/end render React. */
export function useTileDrag(root: RefObject<Group | null>, context: Context) {
  const { gl, camera } = useThree(), latest = useRef(context)
  latest.current = context
  const drag = useRef<Drag | null>(null), ghost = useRef<Group>(null), marker = useRef<Group>(null)
  const [carried, setCarried] = useState<Placed[]>([])
  const projector = useRef({ ray: new Raycaster(), plane: new Plane(), point: new Vector3(), normal: new Vector3(0,1,0), ndc: new Vector2() })
  const available = (c: Context) => {
    const s = useSession.getState(), g = useGame.getState().game
    return c.enabled && g?.gameId === c.gameId && g.version === c.version && g.rummikub === c.state
      && s.status === 'connected' && canActRummikub(s.sessionId, {kind:'draw'})
      && useTableLobby.getState().lookScope !== seatScope(s) && !panelOwnsKeys()
      && !document.activeElement?.matches('input,textarea,[contenteditable="true"]')
  }
  const current = () => {
    const d = drag.current, c = latest.current, ui = useRummikubDraft.getState()
    return !!d && available(c) && d.context.state === c.state && d.context.melds === c.melds && ui.source === c.state
  }
  const project = (event: PointerEvent) => {
    if (!root.current) return null
    const p = projector.current, rect = gl.domElement.getBoundingClientRect()
    p.ndc.set((event.clientX-rect.left)/rect.width*2-1, -(event.clientY-rect.top)/rect.height*2+1)
    p.ray.setFromCamera(p.ndc, camera)
    root.current.updateWorldMatrix(true, false)
    p.plane.set(p.normal, 0).applyMatrix4(root.current.matrixWorld)
    return p.ray.ray.intersectPlane(p.plane, p.point) ? root.current.worldToLocal(p.point.clone()) : null
  }
  const destination = (p: Vector3 | null) => {
    const c = latest.current, placed = new Set(c.melds.flat().map(t=>t.id))
    return p ? tileDropTarget(c.melds,c.hand.filter(t=>!placed.has(t.id)).length,p.x,p.z) : null
  }
  const clear = () => {
    const d = drag.current
    drag.current = null
    if (d && scenePointerOwners.get(d.pointerId) === owner) scenePointerOwners.delete(d.pointerId)
    if (d && gl.domElement.hasPointerCapture(d.pointerId)) { try { gl.domElement.releasePointerCapture(d.pointerId) } catch {} }
    gl.domElement.style.cursor = ''
    if (ghost.current) ghost.current.visible = false
    if (marker.current) marker.current.visible = false
    if (d) setCarried([])
  }
  const show = (d: Drag) => {
    if (!d.moved || !d.point) return
    const to = destination(d.point)
    if (ghost.current) { ghost.current.visible = true; ghost.current.position.set(d.point.x, .28, d.point.z) }
    if (marker.current) {
      marker.current.visible = !!to
      if (to) {
        marker.current.position.set(to.x, .006, to.z)
        marker.current.scale.set(to.width, 1, to.depth)
      }
    }
    hint(!to ? '테이블 밖입니다. 놓으면 이동을 취소합니다.' : to.destination.kind === 'rack' ? '받침대로 돌려놓기 · 기존 공개 타일은 가져올 수 없어요.'
      : to.destination.kind === 'new' ? '놓으면 새 조합 · Esc 취소' : `${to.destination.index+1}번 조합에 놓기 · Esc 취소`)
  }
  useFrame(() => {
    const d = drag.current
    if (!d) return
    if (!current()) { clear(); hint('차례나 화면 상태가 바뀌어 드래그를 취소했습니다.'); return }
    show(d)
  })
  useEffect(() => {
    if (!context.enabled) return
    const canvas = gl.domElement
    const move = (event: PointerEvent) => {
      const d = drag.current
      if (!d || event.pointerId !== d.pointerId) return
      if (!current()) { clear(); return }
      d.moved ||= Math.hypot(event.clientX-d.x,event.clientY-d.y) >= 7
      d.point = project(event)
      if (d.moved) { event.preventDefault(); canvas.style.cursor='grabbing'; show(d) }
    }
    const up = (event: PointerEvent) => {
      const d = drag.current
      if (!d || event.pointerId !== d.pointerId) return
      const allowed = current() && event.button === 0
      // Capture changes event.target; check the actual element to avoid dropping through panels.
      const overCanvas = document.elementFromPoint(event.clientX,event.clientY) === canvas
      const target = overCanvas ? destination(project(event)) : null
      clear()
      if (!allowed) return
      if (!d.moved) { if (overCanvas) toggleRummikubTile(d.tile); return }
      if (!target) { hint('테이블 밖에 놓아 이동을 취소했습니다.'); return }
      const c = latest.current, ui = useRummikubDraft.getState()
      const result = editTiles(c.state!, c.melds, c.hand, useSession.getState().sessionId, d.ids, target.destination,
        {color:ui.jokerColor,number:ui.jokerNumber}, true)
      useRummikubDraft.setState({draft:result.melds,selected:[],hint:result.message})
    }
    const cancel = () => { if (drag.current) { clear(); hint('드래그를 취소했습니다. 타일은 원래 자리에 있습니다.') } }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && drag.current) { e.preventDefault(); e.stopPropagation(); cancel() } }
    const hidden = () => { if (document.hidden) cancel() }
    window.addEventListener('pointermove',move,{passive:false}); window.addEventListener('pointerup',up)
    window.addEventListener('pointercancel',cancel); window.addEventListener('blur',cancel)
    window.addEventListener('ontop-clear-input',cancel); window.addEventListener('keydown',key,true)
    canvas.addEventListener('lostpointercapture',cancel); canvas.addEventListener('contextmenu',cancel)
    document.addEventListener('visibilitychange',hidden)
    return () => {
      clear()
      window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up)
      window.removeEventListener('pointercancel',cancel); window.removeEventListener('blur',cancel)
      window.removeEventListener('ontop-clear-input',cancel); window.removeEventListener('keydown',key,true)
      canvas.removeEventListener('lostpointercapture',cancel); canvas.removeEventListener('contextmenu',cancel)
      document.removeEventListener('visibilitychange',hidden)
    }
  }, [gl,camera,context.enabled])
  function begin(event: ThreeEvent<PointerEvent>, tile: Tile | Placed) {
    if (event.button !== 0) return
    event.stopPropagation()
    const c = latest.current
    if (drag.current || !available(c) || !c.state) return
    const ui = useRummikubDraft.getState(), original = new Set(c.state.melds.flat().map(t=>t.id))
    const ids = ui.selected.includes(tile.id) ? ui.selected : [tile.id]
    if (!c.state.players.find(p=>p.userId === useSession.getState().sessionId)?.registered && ids.some(id=>original.has(id))) {
      hint('첫 등록 턴에는 내 손패로만 새 조합을 만드세요.'); return
    }
    if (ui.source !== c.state) return
    if (!ui.selected.includes(tile.id) && tile.id.startsWith('JOKER') && tile.color)
      useRummikubDraft.setState({jokerColor:tile.color,jokerNumber:tile.number})
    const role = useRummikubDraft.getState()
    setCarried(ids.flatMap(id=>{
      const t=c.melds.flat().find(t=>t.id===id)??c.hand.find(t=>t.id===id)
      return t ? [{id,color:t.color??role.jokerColor,number:t.number||role.jokerNumber}] : []
    }))
    drag.current = {pointerId:event.pointerId,x:event.clientX,y:event.clientY,moved:false,tile:tile.id,ids,context:c,point:null}
    scenePointerOwners.set(event.pointerId,owner)
    gl.domElement.setPointerCapture(event.pointerId)
    gl.domElement.focus({preventScroll:true})
  }
  return {begin, ghost, marker, carried}
}
