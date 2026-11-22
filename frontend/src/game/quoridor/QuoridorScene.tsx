import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { CanvasTexture, Color, ExtrudeGeometry, Matrix4, Path, Plane, Shape, SRGBColorSpace, Vector2, Vector3,
  type Group, type InstancedMesh, type MeshBasicMaterial } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { OmokWood } from '../omok/BoardWood'
import { clearRoamingInput, inputState, panelOwnsGameClicks, scenePointerOwners } from '../../world/inputOwnership'
import type { Cell, Quoridor, Wall } from './protocol'
import { BOARD_SPAN, CELL_PITCH, TILE_SIZE, PLAYER_COLORS, cellPoint, wallPoint, wallDimensions, sameWall } from './presentation'
import { legalDrop, type HeldPiece } from './drag'
import { rotateWall, WallWheelStep } from './wallRotation'

const noRaycast = () => {}
const blocked = () => panelOwnsGameClicks() || !!document.querySelector('dialog[open],[role="dialog"],.game-hud-menu details[open]')
export interface BoardPing extends Cell { eventId: string; until: number }
interface Props {
  state: Quoridor | null; ownId?: string; canAct?: boolean; spectator?: boolean; wallMode?: boolean;
  orientation?: Wall['orientation']; selected?: Wall | null; hover?: Wall | null; pings?: BoardPing[]; layer?: number; labelYaw?: number;
  onMove?(cell: Cell): void; onPlace?(wall: Wall): void; onSelect?(wall: Wall): void; onHover?(wall: Wall | null): void; onPing?(cell: Cell): void
  onOrientationChange?(orientation: Wall['orientation']): void
}
function roundedPath<T extends Shape | Path>(path: T, size: number, radius: number) {
  const h = size / 2
  path.moveTo(-h + radius, -h); path.lineTo(h - radius, -h); path.quadraticCurveTo(h, -h, h, -h + radius)
  path.lineTo(h, h - radius); path.quadraticCurveTo(h, h, h - radius, h)
  path.lineTo(-h + radius, h); path.quadraticCurveTo(-h, h, -h, h - radius)
  path.lineTo(-h, -h + radius); path.quadraticCurveTo(-h, -h, -h + radius, -h)
  return path
}

/** 공원과 독립 프리뷰가 공유하는 실제 3D 판. DOM/CSS로 그린 게임판은 사용하지 않는다. */
export function QuoridorScene({ state, ownId = '', canAct = false, spectator = false, wallMode = false,
  orientation = 'HORIZONTAL', selected = null, hover = null, pings = [], layer = 0, labelYaw = 0, onMove, onPlace, onSelect, onHover, onPing, onOrientationChange }: Props) {
  const root = useRef<Group>(null)
  const [held, setHeld] = useState<HeldPiece | null>(null)
  const heldRef = useRef<HeldPiece | null>(null)
  const wheelStep = useRef(new WallWheelStep())
  const facing = useRef(orientation)
  const live = useRef({ canAct, wallMode, version: state?.version, onOrientationChange })
  useLayoutEffect(() => { live.current = { canAct, wallMode, version: state?.version, onOrientationChange } })
  useLayoutEffect(() => { facing.current = orientation; press.current = null }, [orientation])
  const capture = useRef<{ releasePointerCapture(id: number): void; hasPointerCapture(id: number): boolean } | null>(null)
  const cancelHeld = () => {
    const prior = heldRef.current; heldRef.current = null; setHeld(null); press.current = null
    wheelStep.current.reset()
    if (prior) { scenePointerOwners.delete(prior.pointerId)
      if (capture.current?.hasPointerCapture(prior.pointerId)) capture.current.releasePointerCapture(prior.pointerId) }
    capture.current = null
  }
  const tiles = useRef<InstancedMesh>(null)
  const canvas = useThree(s => s.gl.domElement)
  useEffect(() => {
    if (!canAct && !spectator) return
    const previous = canvas.style.touchAction; canvas.style.touchAction = 'none'
    return () => { canvas.style.touchAction = previous }
  }, [canvas, canAct, spectator])
  const press = useRef<{ version: number; key: string } | null>(null)
  const geometries = useMemo(() => {
    const rim = roundedPath(new Shape(), BOARD_SPAN, .07)
    rim.holes.push(roundedPath(new Path(), 1.225, .018))
    return { tile: new RoundedBoxGeometry(TILE_SIZE, .034, TILE_SIZE, 3, .006),
      base: new RoundedBoxGeometry(BOARD_SPAN, .07, BOARD_SPAN, 4, .02),
      rim: new ExtrudeGeometry(rim, { depth: .06, bevelEnabled: true, bevelSize: .006, bevelThickness: .006, bevelSegments: 3, steps: 1 }) }
  }, [])
  useEffect(() => () => Object.values(geometries).forEach(geometry => geometry.dispose()), [geometries])
  useLayoutEffect(() => {
    const mesh = tiles.current
    if (!mesh) return
    const matrix = new Matrix4(), color = new Color()
    for (let i = 0; i < 81; i++) {
      const cell = { x: i % 9, y: Math.floor(i / 9) }, p = cellPoint(cell)
      matrix.makeRotationY(i % 3 * Math.PI / 2); matrix.setPosition(p[0], .017, p[2]); mesh.setMatrixAt(i, matrix)
      mesh.setColorAt(i, color.setScalar(.91 + i % 5 * .022))
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [])
  useEffect(() => { cancelHeld() }, [state?.version, wallMode, canAct, spectator])
  useEffect(() => {
    const wheel = (event: WheelEvent) => {
      const current = live.current, piece = heldRef.current
      if (!current.canAct || !current.wallMode || !current.onOrientationChange || piece?.kind !== 'wall'
        || piece.version !== current.version || blocked() || inputState.chatOpen || document.hidden || event.ctrlKey || event.metaKey
        || !Number.isFinite(event.deltaY) || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)
        || document.elementFromPoint(event.clientX, event.clientY) !== canvas) return
      // 공원 카메라의 같은 Canvas 휠 리스너보다 먼저 이 제스처를 소유한다.
      event.preventDefault(); event.stopImmediatePropagation()
      if (!wheelStep.current.accept(event.deltaY, event.deltaMode, performance.now())) return
      facing.current = rotateWall(facing.current)
      press.current = null
      current.onOrientationChange(facing.current)
    }
    canvas.addEventListener('wheel', wheel, { capture: true, passive: false })
    return () => canvas.removeEventListener('wheel', wheel, true)
  }, [canvas])
  useEffect(() => {
    if (!held) return
    const prior = canvas.style.cursor; canvas.style.cursor = 'grabbing'
    return () => { canvas.style.cursor = prior }
  }, [!!held, canvas])
  useFrame(() => { if (heldRef.current && (blocked() || document.hidden)) cancelHeld() })
  useEffect(() => {
    const cancel = () => { cancelHeld() }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && heldRef.current) { event.preventDefault(); cancel() } }
    canvas.addEventListener('pointercancel', cancel); window.addEventListener('blur', cancel)
    window.addEventListener('keydown', escape); document.addEventListener('visibilitychange', cancel)
    return () => { cancel(); canvas.removeEventListener('pointercancel', cancel); window.removeEventListener('blur', cancel)
      window.removeEventListener('keydown', escape); document.removeEventListener('visibilitychange', cancel) }
  }, [canvas])
  const point = (event: ThreeEvent<PointerEvent>) => {
    if (!root.current) return null
    root.current.updateWorldMatrix(true, false)
    return event.ray.clone().applyMatrix4(root.current.matrixWorld.clone().invert())
      .intersectPlane(new Plane(new Vector3(0, 1, 0), -.034), new Vector3())
  }
  const grab = (event: ThreeEvent<PointerEvent>, kind: HeldPiece['kind']) => {
    event.stopPropagation()
    if (!state || !canAct || event.button !== 0 || blocked() || heldRef.current) return
    const p = point(event); if (!p) return
    press.current = null
    const next = { kind, version: state.version, pointerId: event.pointerId, x: p.x, z: p.z }
    heldRef.current = next; setHeld(next)
    const target = event.target as unknown as { setPointerCapture(id: number): void; releasePointerCapture(id: number): void; hasPointerCapture(id: number): boolean }
    capture.current = target; target.setPointerCapture(event.pointerId)
    clearRoamingInput(); scenePointerOwners.set(event.pointerId, 'quoridor')
  }
  const follow = (event: ThreeEvent<PointerEvent>) => {
    const prior = heldRef.current
    if (!prior || prior.pointerId !== event.pointerId) return
    event.stopPropagation()
    const p = point(event); if (!p) return
    const next = { ...prior, x: p.x, z: p.z }; heldRef.current = next; setHeld(next)
  }
  const drop = (event: ThreeEvent<PointerEvent>) => {
    const prior = heldRef.current
    if (!prior || prior.pointerId !== event.pointerId) return
    event.stopPropagation(); follow(event)
    const target = state && heldRef.current ? legalDrop(heldRef.current, state, facing.current) : null
    const overCanvas = document.elementFromPoint(event.clientX, event.clientY) === canvas
    cancelHeld()
    if (!target || !canAct || !overCanvas || blocked()) return
    if (target.kind === 'move') onMove?.(target)
    else onPlace?.(target)
  }
  const mask = 1 << layer
  const begin = (event: ThreeEvent<PointerEvent>, key: string) => {
    if (!state) return
    event.stopPropagation()
    if (event.button !== 0 || panelOwnsGameClicks()) return
    press.current = { version: state.version, key }
  }
  const confirm = (event: ThreeEvent<MouseEvent>, key: string, action: () => void) => {
    if (!state) return
    event.stopPropagation()
    const prior = press.current; press.current = null
    if (!prior || prior.version !== state.version || prior.key !== key || event.delta > 6 || panelOwnsGameClicks()) return
    action()
  }
  const walls = state?.walls ?? []
  const preview = canAct && wallMode && !held ? selected ?? hover : null
  const slots = canAct && wallMode ? state?.legalWalls.filter(wall => wall.orientation === orientation) ?? [] : []
  const validHeld = held && state ? legalDrop(held, state, orientation) : null
  return <group ref={root} name="quoridor-3d-board" onPointerMove={follow} onPointerUp={drop} onPointerCancel={cancelHeld}
    onPointerMissed={() => { press.current = null }}>
    <mesh name="quoridor-tray" geometry={geometries.base} position={[0, -.035, 0]} layers-mask={mask} receiveShadow raycast={noRaycast}>
      <OmokWood color="#523421" detail={.6} strength={.06} mapping="box" />
    </mesh>
    <mesh name="quoridor-rounded-rim" geometry={geometries.rim} rotation={[-Math.PI / 2, 0, 0]} position={[0, -.025, 0]} layers-mask={mask} castShadow receiveShadow raycast={noRaycast}>
      <OmokWood color="#68442d" detail={.58} strength={.045} mapping="box" />
    </mesh>
    <instancedMesh ref={tiles} name="quoridor-81-tiles" args={[geometries.tile, undefined, 81]} layers-mask={mask} receiveShadow
      onPointerDown={event => { if (event.instanceId !== undefined) begin(event, `cell:${event.instanceId}`) }}
      onClick={event => { if (event.instanceId === undefined) return
        const id = event.instanceId, cell = { x: id % 9, y: Math.floor(id / 9) }
        confirm(event, `cell:${id}`, () => {
          if (spectator) onPing?.(cell)
          else if (canAct && !wallMode && state?.legalMoves.some(move => move.x === cell.x && move.y === cell.y)) onMove?.(cell)
        })
      }}>
      <OmokWood color="#d2aa79" detail={.85} strength={.08} />
    </instancedMesh>
    <Coordinates layer={layer} yaw={labelYaw} />
    {state?.players.map((player, index) => player.active ? <group key={player.userId}
      onPointerDown={player.userId === ownId && canAct && !wallMode ? event => grab(event, 'move') : undefined}>
      <Pawn cell={player} color={PLAYER_COLORS[index]} own={player.userId === ownId} layer={layer}
        pickable={player.userId === ownId && canAct && !wallMode}
        held={player.userId === ownId && held?.kind === 'move' ? held : null} /></group> : null)}
    {canAct && wallMode ? <group name="quoridor-wall-supply" position={orientation === 'HORIZONTAL' ? [0, .04, .66] : [-.66, .04, 0]} onPointerDown={event => grab(event, 'wall')}>
      <mesh layers-mask={mask}><boxGeometry args={orientation === 'HORIZONTAL' ? [.28, .12, .065] : [.065,.12,.28]} /><meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} /></mesh>
      <Fence wall={{ x: 3, y: 3, orientation }} layer={layer} position={[0, .045, 0]} />
    </group> : null}
    {held?.kind === 'wall' ? <Fence wall={{ x: 0, y: 0, orientation }} preview layer={layer}
      position={[held.x, .19, held.z]} valid={!!validHeld} /> : null}
    {held && validHeld ? <mesh position={(validHeld.kind === 'move' ? cellPoint(validHeld) : wallPoint(validHeld)).map((v,i) => i === 1 ? .042 : v) as [number,number,number]}
      rotation={[-Math.PI/2,0,0]} layers-mask={mask} raycast={noRaycast}><ringGeometry args={[.045,.053,40]} /><meshBasicMaterial color="#8fe5ce" toneMapped={false} /></mesh> : null}
    {canAct && !wallMode ? state?.legalMoves.map(cell => <mesh key={`${cell.x}:${cell.y}`} name={`quoridor-move-${cell.x}-${cell.y}`}
      position={cellPoint(cell).map((v, i) => i === 1 ? v + .002 : v) as [number, number, number]} rotation={[-Math.PI / 2, 0, 0]} layers-mask={mask} raycast={noRaycast}>
      <ringGeometry args={[.016, .022, 32]} /><meshBasicMaterial color="#f3d678" toneMapped={false} />
    </mesh>) : null}
    {walls.map(wall => <Fence key={`${wall.x}:${wall.y}:${wall.orientation}`} wall={wall} layer={layer} />)}
    {preview && !walls.some(wall => sameWall(wall, preview)) ? <Fence wall={preview} preview layer={layer} /> : null}
    {slots.map(wall => {
      const key = `wall:${wall.x}:${wall.y}:${wall.orientation}`, p = wallPoint(wall)
      return <mesh key={key} name={`quoridor-slot-${wall.x}-${wall.y}`} position={[p[0], .04, p[2]]} layers-mask={mask}
        onPointerDown={event => begin(event, key)} onClick={event => confirm(event, key, () => onSelect?.(wall))}
        onPointerOver={event => { event.stopPropagation(); onHover?.(wall) }} onPointerOut={() => onHover?.(null)}>
        <boxGeometry args={orientation === 'HORIZONTAL' ? [.1, .012, .036] : [.036, .012, .1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        <mesh position={[0, .007, 0]} layers-mask={mask} raycast={noRaycast}>
          <boxGeometry args={orientation === 'HORIZONTAL' ? [.078, .004, .008] : [.008, .004, .078]} />
          <meshBasicMaterial color={selected && sameWall(selected, wall) ? '#fff0a5' : '#e5c377'} transparent opacity={selected && sameWall(selected, wall) ? .95 : .7} depthWrite={false} toneMapped={false} />
        </mesh>
      </mesh>
    })}
    {pings.map(ping => <Ping key={ping.eventId} ping={ping} layer={layer} />)}
  </group>
}

function Pawn({ cell, color, own, layer, pickable = false, held = null }: { cell: Cell; color: string; own: boolean; layer: number; pickable?: boolean; held?: HeldPiece | null }) {
  const root = useRef<Group>(null), travel = useRef({ from: new Vector3(), to: new Vector3(), elapsed: 1, mounted: false })
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)'), [])
  const points = useMemo(() => [new Vector2(0, 0), new Vector2(.039, 0), new Vector2(.043, .006), new Vector2(.04, .014),
    new Vector2(.026, .024), new Vector2(.018, .045), new Vector2(.014, .066), new Vector2(.018, .074),
    new Vector2(.026, .082), new Vector2(.029, .096), new Vector2(.024, .111), new Vector2(.014, .12), new Vector2(0, .124)], [])
  useLayoutEffect(() => {
    if (!root.current) return
    const t = travel.current, p = cellPoint(cell)
    t.from.copy(root.current.position); t.to.set(...p); t.elapsed = 0
    if (!t.mounted || reduced.matches) { root.current.position.copy(t.to); t.from.copy(t.to); t.elapsed = 1 }
    t.mounted = true
  }, [cell.x, cell.y, reduced, !!held])
  useFrame((_, delta) => {
    const t = travel.current
    if (root.current && held) { root.current.position.set(held.x, .14, held.z); return }
    if (!root.current || t.elapsed >= 1) return
    t.elapsed = Math.min(1, t.elapsed + delta / .24)
    const eased = 1 - (1 - t.elapsed) ** 3
    root.current.position.lerpVectors(t.from, t.to, eased)
    root.current.position.y += Math.sin(t.elapsed * Math.PI) * .045
  })
  return <group ref={root} name="quoridor-wood-pawn">
    <mesh layers-mask={1 << layer} castShadow receiveShadow {...(!pickable ? { raycast: noRaycast } : {})}>
      <latheGeometry args={[points, 32]} /><OmokWood color={color} detail={.18} strength={.02} />
    </mesh>
    {own ? <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .001, 0]} layers-mask={1 << layer} raycast={noRaycast}>
      <ringGeometry args={[.046, .05, 40]} /><meshBasicMaterial color="#efd488" toneMapped={false} />
    </mesh> : null}
  </group>
}

function Fence({ wall, preview = false, layer, position, valid = true }: { wall: Wall; preview?: boolean; layer: number; position?: [number,number,number]; valid?: boolean }) {
  const geometry = useMemo(() => new RoundedBoxGeometry(...wallDimensions(wall), 3, .003), [wall.orientation])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh name={preview ? 'quoridor-wall-preview' : 'quoridor-standing-wall'} geometry={geometry} position={position ?? wallPoint(wall)} layers-mask={1 << layer} castShadow={!preview} receiveShadow raycast={noRaycast}>
    {preview ? <meshStandardMaterial color={valid ? '#f4cf76' : '#d76b58'} transparent opacity={.8} roughness={.45} emissive={valid ? '#b68d30' : '#ac3424'} emissiveIntensity={.2} depthWrite={false} />
      : <OmokWood color="#d7a757" detail={.3} strength={.035} mapping="box" />}
  </mesh>
}
function Ping({ ping, layer }: { ping: BoardPing; layer: number }) {
  const material = useRef<MeshBasicMaterial>(null)
  useFrame(() => { if (material.current) material.current.opacity = Math.min(.95, Math.max(0, (ping.until - performance.now()) / 450)) })
  const p = cellPoint(ping)
  return <mesh name="quoridor-spectator-ping" position={[p[0], .038, p[2]]} rotation={[-Math.PI / 2, 0, 0]} layers-mask={1 << layer} raycast={noRaycast}>
    <ringGeometry args={[.044, .05, 48]} /><meshBasicMaterial ref={material} color="#8fe5ce" transparent toneMapped={false} depthWrite={false} />
  </mesh>
}
function Coordinates({ layer, yaw }: { layer: number; yaw: number }) {
  const map = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024
    const ctx = canvas.getContext('2d')!
    const pixel = (v: number) => (v / BOARD_SPAN + .5) * 1024
    ctx.fillStyle = '#eed6a4'; ctx.font = '600 23px Georgia,serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    const label = (text: string, x: number, z: number) => { ctx.save();ctx.translate(pixel(x),pixel(z));ctx.rotate(-yaw);ctx.fillText(text,0,0);ctx.restore() }
    for (let i = 0; i < 9; i++) {
      const p = (i - 4) * CELL_PITCH
      for (const edge of [-.655, .655]) {
        label(String.fromCharCode(65 + i), p, edge)
        label(String(9 - i), edge, p)
      }
    }
    const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.anisotropy = 4
    return texture
  }, [yaw])
  useEffect(() => () => map.dispose(), [map])
  return <mesh name="quoridor-coordinate-labels" position={[0, .043, 0]} rotation={[-Math.PI / 2, 0, 0]} layers-mask={1 << layer} raycast={noRaycast}>
    <planeGeometry args={[BOARD_SPAN, BOARD_SPAN]} /><meshBasicMaterial map={map} transparent depthWrite={false} toneMapped={false} />
  </mesh>
}
