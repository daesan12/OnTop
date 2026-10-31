import { alkkagiLabelElements } from './AlkkagiSpectatorLabels'
import { intersectAlkkagiBoard } from './boardSpace'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ArrowHelper, Group, Mesh, OrthographicCamera, Plane, Ray, Vector2, Vector3 } from 'three'
import { AlkkagiReplay, type Piece, type Snapshot } from './replay'
import { draggedShot, launchResponse } from './aimInput'
import { exitFlight } from './flight'
import { AlkkagiPiece, PieceAppearanceProvider } from './AlkkagiPiece'
import { AlkkagiBoardSurface } from './AlkkagiBoardSurface'
import { fitBoardCamera } from './boardLayout'

/** 전송·인증·URL에 의존하지 않는 공용 게임판. 호출자가 승인 상태와 명령 콜백을 공급한다. */
export function AlkkagiBoard(props: Parameters<typeof Scene>[0]) {
  return <Canvas orthographic shadows camera={{ position: [0, 14, 0], up: [0, 0, -1], zoom: 50, near: .1, far: 100 }}>
    <BoardProjection />
    <color attach="background" args={['#253d37']} /><ambientLight intensity={1.8} />
    <directionalLight position={[3, 10, 6]} intensity={2.5} castShadow shadow-mapSize={[1024, 1024]} />
    <AlkkagiScene {...props} />
  </Canvas>
}

/** 기존 화면 높이 범위는 유지하고 높이에 따른 원근 확대만 제거한다. */
function BoardProjection() {
  const { camera, size } = useThree()
  useLayoutEffect(() => {
    if (!(camera instanceof OrthographicCamera)) return
    fitBoardCamera(camera, size.height)
  }, [camera, size.height])
  return null
}

export function AlkkagiScene(props: Parameters<typeof Scene>[0]) {
  return <PieceAppearanceProvider><Scene {...props} /></PieceAppearanceProvider>
}

type Aim = { piece: Piece; origin: Vector3; end: Vector3; start: { x: number; y: number }
  moved: number; pointerId: number; gameId: string; version: number }
function Scene({ layer = 0, actor, state, replay, enabled, shoot, explain, blockedReason, itemMode, itemTargets, pickTarget, cancelItem, placement, pickPlacement, pinned, previewValid, rotatePlacement, cursor }: { layer?: number; actor: number; state: Snapshot | null; replay: AlkkagiReplay; enabled: boolean
  shoot(p: Piece, dx: number, dy: number, power: number): void; explain(message: string): void; blockedReason: string; itemMode: string | null; itemTargets: string[]; pickTarget(piece: Piece): void; cancelItem(): void; placement: { x: number; y: number; angle: number } | null; pickPlacement(x: number, y: number, pin?: boolean): void; pinned: boolean; previewValid: boolean; rotatePlacement(delta: number): void; cursor(x: number, y: number): void }) {
  const space = useRef<Group>(null)
  const localPoint = (point: Vector3) => space.current!.worldToLocal(point.clone())
  const hitPlane = (ray: Ray) => {
    if (!space.current) return null
    space.current.updateWorldMatrix(true, false)
    return intersectAlkkagiBoard(ray, space.current.matrixWorld, floor)
  }
  const groups = useRef(new Map<string, Group>())
  const displayed = useRef({ gameId: '', generation: -1, alive: new Map<string, boolean>(), flights: new Map<string, number>() })
  const { gl, camera, raycaster } = useThree()
  const aim = useRef<Aim | null>(null), arrow = useMemo(() => new ArrowHelper(new Vector3(0, 0, -1), new Vector3(), 1, '#f3c16d'), [])
  const selected = useRef<Piece | null>(null), selectionRing = useRef<Mesh>(null)
  const floor = useMemo(() => new Plane(new Vector3(0, 1, 0), -.36), [])
  const pieces = state?.pieces ?? []
  // Local UI changes can mount new meshes without a server version update.
  useLayoutEffect(() => { space.current?.traverse(object => object.layers.set(layer)) })
  const clearAim = () => { aim.current = null; arrow.visible = false }
  const clear = () => { clearAim(); selected.current = null; if (selectionRing.current) selectionRing.current.visible = false }
  useEffect(() => {
    const canvas = gl.domElement
    const point = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      raycaster.setFromCamera(new Vector2((event.clientX - rect.left) / rect.width * 2 - 1,
        -(event.clientY - rect.top) / rect.height * 2 + 1), camera)
      return hitPlane(raycaster.ray)
    }
    const move = (event: PointerEvent) => {
      const a = aim.current, p = point(event)
      if (a && p && event.pointerId === a.pointerId) {
        a.end.copy(p); a.moved = Math.hypot(event.clientX - a.start.x, event.clientY - a.start.y)
      }
    }
    const up = (event: PointerEvent) => {
      const a = aim.current
      if (!a || event.pointerId !== a.pointerId) return
      clearAim()
      if (event.button !== 0 || !a || !enabled || a.gameId !== state?.gameId || a.version !== state.version) return
      const shot = draggedShot(a.start, { x: event.clientX, y: event.clientY }, a.origin, point(event) ?? a.end)
      if (shot) {
        clear(); shoot(a.piece, shot.dx, shot.dy, shot.power)
      }
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { clear(); cancelItem() }
      if (itemMode === 'WALL' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)
        && ['q', 'e', 'Q', 'E'].includes(e.key)) { e.preventDefault(); rotatePlacement(e.key.toLowerCase() === 'q' ? -Math.PI / 12 : Math.PI / 12) }
    }
    const wheel = (e: WheelEvent) => { if (itemMode === 'WALL') { e.preventDefault(); rotatePlacement(e.deltaY > 0 ? Math.PI / 12 : -Math.PI / 12) } }
    const cancel = (e: Event) => { e.preventDefault(); clear(); cancelItem() }
    canvas.addEventListener('wheel', wheel, { passive: false }); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', clear); canvas.addEventListener('contextmenu', cancel)
    window.addEventListener('keydown', key); window.addEventListener('blur', clear)
    return () => { canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', clear); canvas.removeEventListener('contextmenu', cancel)
      window.removeEventListener('keydown', key); window.removeEventListener('blur', clear) }
  }, [camera, gl, raycaster, floor, enabled, state?.gameId, state?.version, shoot, itemMode, cancelItem, rotatePlacement])
  useEffect(clear, [enabled, state?.gameId, state?.version, itemMode])
  useFrame((_, delta) => {
    const frame = replay.sample(performance.now())
    if (!frame) return
    if (displayed.current.gameId !== frame.gameId || displayed.current.generation !== replay.generation) {
      displayed.current = { gameId: frame.gameId, generation: replay.generation, alive: new Map(), flights: new Map() }
    }
    for (const p of frame.pieces) {
      const group = groups.current.get(p.id)
      if (!group) continue
      const wasAlive = displayed.current.alive.get(p.id)
      if (p.alive) { group.position.set(p.x, 0, p.y); group.rotation.set(0, 0, 0); group.visible = true }
      else {
        // 이미 탈락한 복구 상태는 숨기고, 화면에서 새 탈락을 본 경우만 속도를 이어 재생한다.
        if (wasAlive) displayed.current.flights.set(p.id, 0)
        const elapsed = displayed.current.flights.get(p.id)
        if (elapsed === undefined) group.visible = false
        else {
          const flight = exitFlight(p, elapsed)
          group.position.set(flight.x, flight.height, flight.z)
          group.rotation.set(flight.spin, 0, flight.spin * .35)
          group.scale.setScalar(Math.max(.05, flight.opacity))
          group.visible = flight.visible
          displayed.current.flights.set(p.id, elapsed + delta)
        }
      }
      displayed.current.alive.set(p.id, p.alive)
    }
    if (space.current && state?.social) {
      const rect = gl.domElement.getBoundingClientRect(), point = new Vector3()
      const positionLabel = (id: string, x: number, y: number) => {
        const label = alkkagiLabelElements.get(id)
        if (!label) return
        point.set(x, .62, y); space.current!.localToWorld(point); point.project(camera)
        const visible = point.z >= -1 && point.z <= 1 && Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1
        label.style.display = visible ? '' : 'none'
        label.style.left = rect.left + (point.x + 1) / 2 * rect.width + 'px'
        label.style.top = rect.top + (1 - point.y) / 2 * rect.height + 'px'
      }
      for (const cursor of state.social.cursors) positionLabel(cursor.id, cursor.x, cursor.y)
      for (const advice of state.social.advice) {
        const piece = pieces.find(p => p.id === advice.pieceId)
        if (piece) positionLabel(advice.id, piece.x + advice.dx * (.5 + advice.power * 2), piece.y + advice.dy * (.5 + advice.power * 2))
      }
    }
    if (selectionRing.current) {
      selectionRing.current.visible = !!selected.current && enabled
      if (selected.current) {
        selectionRing.current.position.set(selected.current.x, .31, selected.current.y)
        selectionRing.current.scale.setScalar(selected.current.radius * 1.18)
      }
    }
    if (aim.current) {
      const a = aim.current, direction = new Vector3(a.origin.x - a.end.x, 0, a.origin.z - a.end.z)
      const length = direction.length(); arrow.visible = a.moved >= 12 && length >= .08
      arrow.position.set(a.piece.x, .45, a.piece.y); arrow.setDirection(direction.normalize())
      arrow.setLength(2.5 * launchResponse(Math.min(1, length / 2.5), state?.inputCurveBoost ?? 0), .25, .14)
    }
  })
  return <group ref={space}>
    <AlkkagiBoardSurface onPointerDown={e => {
      if (e.button === 0 && enabled && (itemMode === 'WALL' || itemMode === 'RELOCATE')) {
        e.stopPropagation(); pickPlacement(localPoint(e.point).x, localPoint(e.point).z, true)
      }
    }} onPointerMove={e => {
      cursor(localPoint(e.point).x, localPoint(e.point).z)
      if (enabled && (itemMode === 'WALL' || itemMode === 'RELOCATE') && !pinned) pickPlacement(localPoint(e.point).x, localPoint(e.point).z)
    }} />
    {pieces.map(piece => <group key={`${state!.gameId}-${piece.id}-${piece.radius}`} ref={g => { if (g) groups.current.set(piece.id, g); else groups.current.delete(piece.id) }}>
      <AlkkagiPiece piece={piece} onPointerDown={e => {
        if (e.button !== 0) return
        e.stopPropagation()
        if (!enabled) { explain(blockedReason); return }
        const anyTarget = itemMode && ['SWAP', 'RELOCATE', 'GROW', 'SHRINK'].includes(itemMode)
        if (!piece.alive || (!anyTarget && piece.owner !== (actor < 0 ? state?.turn : actor))) { explain(actor < 0 ? '현재 차례의 살아 있는 알을 골라주세요.' : '상대 알입니다. 내 팀 색깔의 알을 골라주세요.'); return }
        if (!itemMode) window.dispatchEvent(new CustomEvent('alkkagi:feedback', { detail: {
          id: `${state!.gameId}:select:${crypto.randomUUID()}`, type: 'PIECE_SELECTED', at: Date.now(), pieceId: piece.id,
        } }))
        if (itemMode) {
          clear()
          if (itemMode !== 'WALL' && itemMode !== 'EXTRA_SHOT') pickTarget(piece)
          else explain('아이템 확정 또는 취소를 먼저 눌러주세요.')
          return
        }
        const origin = hitPlane(e.ray)
        if (!origin) return
        gl.domElement.setPointerCapture(e.pointerId)
        selected.current = piece
        explain('')
        aim.current = { piece, origin, end: origin.clone(), start: { x: e.clientX, y: e.clientY },
          moved: 0, pointerId: e.pointerId, gameId: state!.gameId, version: state!.version }
      }} />
      {piece.alive && <PieceEffect radius={piece.radius} type={piece.modifier ?? null} />}
      {piece.alive && piece.powerUp && <PieceEffect radius={piece.radius * 1.12} type="POWER_UP" />}
    </group>)}
    {itemTargets.map(id => {
      const piece = pieces.find(p => p.id === id && p.alive)
      return piece ? <group key={id} position={[piece.x, 0, piece.y]}>
        <TargetHalo radius={piece.radius} valid={previewValid} />
        {itemMode && ['GROW', 'SHRINK', 'DEFEND', 'POWER_UP'].includes(itemMode) &&
          <PieceEffect radius={piece.radius * (itemMode === 'GROW' ? state?.itemRules?.growScale ?? 1.25 : itemMode === 'SHRINK' ? state?.itemRules?.shrinkScale ?? .8 : 1)} type={itemMode} />}
      </group> : null
    })}
    {itemMode === 'SWAP' && itemTargets.length === 2 && itemTargets.map((id, i) => {
      const p = pieces.find(p => p.id === id), to = pieces.find(p => p.id === itemTargets[1-i])
      return p && to ? <DestinationGhost key={'swap-'+id} x={to.x} y={to.y} radius={p.radius} valid={previewValid} /> : null
    })}
    {state?.wall && <mesh position={[state.wall.x, .25, state.wall.y]} rotation={[0, -state.wall.angle, 0]} castShadow>
      <boxGeometry args={[state.wall.length, .5, state.wall.thickness]} /><meshStandardMaterial color="#67503d" /></mesh>}
    {placement && itemMode === 'WALL' && <mesh position={[placement.x, .26, placement.y]} rotation={[0, -placement.angle, 0]} raycast={() => {}}>
      <boxGeometry args={[state?.itemRules?.wallLength ?? 1.6, .5, state?.itemRules?.wallThickness ?? .18]} />
      <meshStandardMaterial color={previewValid ? "#47ddca" : "#ec604c"} transparent opacity={.55} />
    </mesh>}
    {placement && itemMode === 'RELOCATE' && itemTargets.length === 1 && <DestinationGhost x={placement.x} y={placement.y}
      radius={pieces.find(p => p.id === itemTargets[0])?.radius ?? .24} valid={previewValid} />}
    {state?.social?.cursors.filter(c => c.actor !== actor || actor < 0).map(c => <mesh key={c.id} position={[c.x, .38, c.y]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
      <ringGeometry args={[.08, .13, 16]} /><meshBasicMaterial color={c.actor === 0 ? '#e78770' : c.actor === 1 ? '#6ecea0' : '#79afff'} />
    </mesh>)}
    {state?.social?.advice.map(a => { const p = pieces.find(p => p.id === a.pieceId); return p && <AdviceArrow key={a.id} x={p.x} y={p.y} dx={a.dx} dy={a.dy} power={a.power} /> })}
    {state?.impacts?.filter(i => state.serverNow - i.at < 220).map(i => <mesh key={i.id} position={[i.x, .4, i.y]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
      <ringGeometry args={[.12, .19 + Math.min(.15, i.impulse * .01), 20]} /><meshBasicMaterial color="#ffe0a0" transparent opacity={.6} depthWrite={false} />
    </mesh>)}
    <primitive object={arrow} />
    <mesh ref={selectionRing} visible={false} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
      <ringGeometry args={[1, 1.13, 48]} /><meshBasicMaterial color="#fff38b" depthWrite={false} />
    </mesh>
  </group>
}

function AdviceArrow({ x, y, dx, dy, power }: { x: number; y: number; dx: number; dy: number; power: number }) {
  const arrow = useMemo(() => new ArrowHelper(new Vector3(dx, 0, dy), new Vector3(x, .55, y), .5 + power * 2, '#75b4ff'), [x, y, dx, dy, power])
  useEffect(() => () => arrow.dispose(), [arrow])
  return <primitive object={arrow} />
}

function PieceEffect({ radius, type }: { radius: number; type: string | null }) {
  const ring = useRef<Mesh>(null)
  useFrame(({ clock }) => { if (ring.current) { ring.current.rotation.z = clock.elapsedTime * 1.4; ring.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 5) * .08) } })
  if (!type) return null
  const color = type === 'DEFEND' ? '#6bc9ff' : type === 'POWER_UP' ? '#ff913f' : type === 'GROW' ? '#d49aff' : '#72f2dc'
  return <group raycast={() => {}}>
    <mesh ref={ring} position={[0, .07, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
      <torusGeometry args={[radius * 1.25, .035, 8, 40]} /><meshBasicMaterial color={color} transparent opacity={.85} depthWrite={false} />
    </mesh>
    {type === 'DEFEND' ? <mesh position={[0, .18, 0]} raycast={() => {}}>
      <sphereGeometry args={[radius * 1.35, 16, 10]} /><meshBasicMaterial color={color} wireframe transparent opacity={.24} depthWrite={false} />
    </mesh> : Array.from({ length: type === 'POWER_UP' ? 5 : 3 }, (_, i) => <mesh key={i} raycast={() => {}}
      position={[Math.cos(i * Math.PI * 2 / (type === 'POWER_UP' ? 5 : 3)) * radius * 1.3, .35, Math.sin(i * Math.PI * 2 / (type === 'POWER_UP' ? 5 : 3)) * radius * 1.3]}
      rotation={[type === 'SHRINK' ? Math.PI : 0, 0, 0]}>
      <coneGeometry args={[.055, type === 'POWER_UP' ? .3 : .17, 5]} /><meshBasicMaterial color={color} transparent opacity={.85} depthWrite={false} />
    </mesh>)}
  </group>
}

/** Non-interactive overlays never steal board/piece pointer events. */
function TargetHalo({radius,valid}:{radius:number;valid:boolean}) {
  const ring=useRef<Mesh>(null)
  useFrame(({clock})=>{if(ring.current)ring.current.scale.setScalar(1+Math.sin(clock.elapsedTime*7)*.05)})
  return <mesh ref={ring} position={[0,.43,0]} rotation={[-Math.PI/2,0,0]} raycast={()=>{}} renderOrder={10}>
    <ringGeometry args={[radius*1.08,radius*1.35,64]} /><meshBasicMaterial color={valid?'#55ffdb':'#ff735f'} depthTest={false} depthWrite={false} transparent opacity={.9} />
  </mesh>
}
function DestinationGhost({x,y,radius,valid}:{x:number;y:number;radius:number;valid:boolean}) {
  return <mesh position={[x,.2,y]} raycast={()=>{}} renderOrder={9}>
    <cylinderGeometry args={[radius,radius,.34,48]} /><meshBasicMaterial color={valid?'#55ffdb':'#ff735f'} transparent opacity={.5} depthWrite={false} />
  </mesh>
}
