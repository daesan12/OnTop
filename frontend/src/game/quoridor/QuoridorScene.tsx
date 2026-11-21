import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { CanvasTexture, Color, ExtrudeGeometry, Matrix4, Path, Shape, SRGBColorSpace, Vector2, Vector3,
  type Group, type InstancedMesh, type MeshBasicMaterial } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { OmokWood } from '../omok/BoardWood'
import { panelOwnsGameClicks } from '../../world/inputOwnership'
import type { Cell, Quoridor, Wall } from './protocol'
import { BOARD_SPAN, CELL_PITCH, TILE_SIZE, PLAYER_COLORS, cellPoint, wallPoint, wallDimensions, sameWall } from './presentation'

const noRaycast = () => {}
export interface BoardPing extends Cell { eventId: string; until: number }
interface Props {
  state: Quoridor | null; ownId?: string; canAct?: boolean; spectator?: boolean; wallMode?: boolean;
  orientation?: Wall['orientation']; selected?: Wall | null; hover?: Wall | null; pings?: BoardPing[]; layer?: number; labelYaw?: number;
  onMove?(cell: Cell): void; onSelect?(wall: Wall): void; onHover?(wall: Wall | null): void; onPing?(cell: Cell): void
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
  orientation = 'HORIZONTAL', selected = null, hover = null, pings = [], layer = 0, labelYaw = 0, onMove, onSelect, onHover, onPing }: Props) {
  const tiles = useRef<InstancedMesh>(null)
  const canvas = useThree(s => s.gl.domElement)
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
  useEffect(() => { press.current = null }, [state?.version, wallMode, orientation, canAct, spectator])
  useEffect(() => {
    const cancel = () => { press.current = null }
    canvas.addEventListener('pointercancel', cancel); window.addEventListener('blur', cancel)
    return () => { canvas.removeEventListener('pointercancel', cancel); window.removeEventListener('blur', cancel) }
  }, [canvas])
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
  const preview = canAct && wallMode ? selected ?? hover : null
  const slots = canAct && wallMode ? state?.legalWalls.filter(wall => wall.orientation === orientation) ?? [] : []
  return <group name="quoridor-3d-board" onPointerMissed={() => { press.current = null }}>
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
    {state?.players.map((player, index) => player.active ? <Pawn key={player.userId} cell={player} color={PLAYER_COLORS[index]} own={player.userId === ownId} layer={layer} /> : null)}
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

function Pawn({ cell, color, own, layer }: { cell: Cell; color: string; own: boolean; layer: number }) {
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
  }, [cell.x, cell.y, reduced])
  useFrame((_, delta) => {
    const t = travel.current
    if (!root.current || t.elapsed >= 1) return
    t.elapsed = Math.min(1, t.elapsed + delta / .24)
    const eased = 1 - (1 - t.elapsed) ** 3
    root.current.position.lerpVectors(t.from, t.to, eased)
    root.current.position.y += Math.sin(t.elapsed * Math.PI) * .045
  })
  return <group ref={root} name="quoridor-wood-pawn">
    <mesh layers-mask={1 << layer} castShadow receiveShadow raycast={noRaycast}>
      <latheGeometry args={[points, 32]} /><OmokWood color={color} detail={.18} strength={.02} />
    </mesh>
    {own ? <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .001, 0]} layers-mask={1 << layer} raycast={noRaycast}>
      <ringGeometry args={[.046, .05, 40]} /><meshBasicMaterial color="#efd488" toneMapped={false} />
    </mesh> : null}
  </group>
}

function Fence({ wall, preview = false, layer }: { wall: Wall; preview?: boolean; layer: number }) {
  const geometry = useMemo(() => new RoundedBoxGeometry(...wallDimensions(wall), 3, .003), [wall.orientation])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh name={preview ? 'quoridor-wall-preview' : 'quoridor-standing-wall'} geometry={geometry} position={wallPoint(wall)} layers-mask={1 << layer} castShadow={!preview} receiveShadow raycast={noRaycast}>
    {preview ? <meshStandardMaterial color="#f4cf76" transparent opacity={.65} roughness={.45} emissive="#b68d30" emissiveIntensity={.2} depthWrite={false} />
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
