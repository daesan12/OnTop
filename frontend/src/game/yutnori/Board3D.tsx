import { Suspense, Component, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { ACESFilmicToneMapping, CanvasTexture, ExtrudeGeometry, PerspectiveCamera, Shape, SRGBColorSpace, TextureLoader, type Group } from 'three'
import { Board, boardJunctions, boardNodes, type BoardProps } from './Board'
import { teamName } from './contracts'
import { boardWorldPoint, fitYutCamera, projectYutPoint, YUT_SURFACE_Y, YUT_TEAM_COLORS, YUT_TOKEN_HEIGHT } from './board3dMath'
import boardArt from './art/board.webp'
import './board3d.css'

type Point = { x: number; y: number }
type Projection = { nodes: Record<number, Point>; pieces: Record<string, Point> }

class BoardBoundary extends Component<{ children: ReactNode; board: BoardProps }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? <div className="yut-board-fallback"><p role="status">3D 화면을 사용할 수 없어 기본 윷판으로 표시합니다.</p><Board {...this.props.board} /></div> : this.props.children
  }
}

/** 별도 게임 캔버스다. 공원 맵·카메라·입력 컨트롤러에 연결하지 않는다. */
export function Board3D(props: BoardProps) {
  return <BoardBoundary board={props}><BoardCanvas {...props} /></BoardBoundary>
}
function BoardCanvas(props: BoardProps) {
  const [projection, setProjection] = useState<Projection | null>(null)
  const [lost, setLost] = useState(false)
  const [ready, setReady] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  if (lost) throw new Error('Yut WebGL context lost')
  const { state, selected, destinations, onPiece, onMove, onPing } = props
  return <div className="yut-board yut-board-3d" aria-label="3D 29칸 윷판" data-renderer="three" data-ready={ready}>
    <Canvas frameloop="demand" shadows dpr={[1, 1.5]} camera={{ position: [0, 10, 6.2], fov: 34 }}
      gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
      onCreated={({ gl }) => { gl.toneMapping = ACESFilmicToneMapping; gl.toneMappingExposure = 1.15 }}>
      <Suspense fallback={null}><TableScene {...props} onProject={setProjection} onReady={() => setReady(true)} onLost={() => setLost(true)} reducedMotion={reducedMotion} /></Suspense>
    </Canvas>
    {!ready && <p className="yut-3d-loading" role="status">입체 윷판을 준비하고 있어요…</p>}
    {projection && <div className="yut-3d-controls">
      {boardNodes.map(node => {
        const p = projection.nodes[node], destination = destinations.find(move => move.to === node)
        return <button key={node} data-node={node} className={`yut-board-node${destination ? ' yut-3d-target' : ''}`} style={{ left: `${p.x}%`, top: `${p.y}%` }}
          aria-label={destination ? `${node}번 칸으로 ${destination.shortcut ? '지름길' : '기본 길'} 이동` : `${node}번 칸 핑 보내기`}
          onClick={() => destination ? onMove(destination) : onPing(node)} />
      })}
      {state.pieces.flatMap((tokens, team) => tokens.map((node, piece) => {
        if (node === 0 || node === 30 || tokens.indexOf(node) !== piece) return null
        const p = projection.pieces[`${team}:${piece}`]
        if (!p) return null
        const count = tokens.filter(at => at === node).length, destination = destinations.find(move => move.to === node)
        const base = projection.nodes[node], hitY = (base.y + p.y) / 2, hitHeight = 7 + Math.abs(base.y - p.y)
        return <button key={`${team}:${piece}`} className={`yut-3d-piece-hit yut-team-${team}`} style={{ left: `${p.x}%`, top: `${hitY}%`, height: `${hitHeight}%` }}
          aria-label={`${teamName(team)} ${piece + 1}번 말${count > 1 ? ` ${count}개 업힘` : ''}`}
          aria-pressed={team === state.team && tokens[selected] === node}
          onClick={() => destination ? onMove(destination) : onPiece(team, piece)} />
      }))}
    </div>}
  </div>
}

function TableScene({ state, selected, destinations, onProject, onReady, onLost, reducedMotion }: BoardProps & {
  onProject(value: Projection): void; onReady(): void; onLost(): void; reducedMotion: boolean
}) {
  const { camera, size, gl, invalidate } = useThree()
  const ready = useRef(false)
  const piecesKey = state.pieces.map(tokens => tokens.join(',')).join(':')
  useLayoutEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    fitYutCamera(camera, size.width, size.height)
    const nodes = Object.fromEntries(boardNodes.map(node => [node, projectYutPoint(camera, node)]))
    const pieces: Record<string, Point> = {}
    state.pieces.forEach((tokens, team) => tokens.forEach((node, piece) => {
      if (node > 0 && node < 30 && tokens.indexOf(node) === piece) {
        const count = tokens.filter(at => at === node).length
        pieces[`${team}:${piece}`] = projectYutPoint(camera, node, YUT_SURFACE_Y + count * YUT_TOKEN_HEIGHT)
      }
    }))
    onProject({ nodes, pieces })
    invalidate()
  }, [camera, size.width, size.height, piecesKey, onProject, invalidate])
  useEffect(() => {
    const canvas = gl.domElement
    const lost = (event: Event) => { event.preventDefault(); onLost() }
    canvas.addEventListener('webglcontextlost', lost)
    return () => canvas.removeEventListener('webglcontextlost', lost)
  }, [gl, onLost])
  useFrame(() => { if (!ready.current) { ready.current = true; onReady() } })
  return <>
    <hemisphereLight args={['#fff4df', '#213b32', 1.1]} />
    <directionalLight position={[-3.5, 8, -4]} intensity={2.5} color="#fff1d4" castShadow
      shadow-mapSize={[1024, 1024]} shadow-camera-left={-5} shadow-camera-right={5} shadow-camera-top={5} shadow-camera-bottom={-5}
      shadow-bias={-.0004} shadow-normalBias={.025} />
    <directionalLight position={[4, 4, 3]} intensity={.6} color="#dae7ff" />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.635, 0]} receiveShadow><planeGeometry args={[30, 30]} /><shadowMaterial transparent opacity={.34} /></mesh>
    <Slab />
    {[[5, 10], [10, 15], [15, 20], [20, 5], [5, 15], [10, 20]].map(([a, b]) => <Track key={`${a}:${b}`} from={a} to={b} />)}
    {boardNodes.map(node => <Space key={node} node={node} active={destinations.some(move => move.to === node)} />)}
    <BoardLetter text="방" position={[0, .08, .5]} width={1} />
    <BoardLetter text="첫 도 ↑" position={[1.5, .08, .95]} width={1.2} />
    <BoardLetter text="출발·참먹이" position={[1.5, .08, 2.56]} width={1.2} />
    {state.pieces.flatMap((tokens, team) => tokens.map((node, piece) => {
      if (node === 0 || node === 30 || tokens.indexOf(node) !== piece) return null
      const count = tokens.filter(at => at === node).length
      return <Piece key={`${team}:${piece}`} node={node} team={team} count={count} label={count > 1 ? count : piece + 1}
        selected={state.team === team && tokens[selected] === node} target={destinations.some(move => move.to === node)} reducedMotion={reducedMotion} />
    }))}
  </>
}
function Slab() {
  const original = useLoader(TextureLoader, boardArt)
  const texture = useMemo(() => { const map = original.clone(); map.colorSpace = SRGBColorSpace; map.anisotropy = 4; map.needsUpdate = true; return map }, [original])
  const geometry = useMemo(() => {
    const s = new Shape(), h = 2.99, r = .14
    s.moveTo(-h + r, -h); s.lineTo(h - r, -h); s.quadraticCurveTo(h, -h, h, -h + r)
    s.lineTo(h, h - r); s.quadraticCurveTo(h, h, h - r, h); s.lineTo(-h + r, h)
    s.quadraticCurveTo(-h, h, -h, h - r); s.lineTo(-h, -h + r); s.quadraticCurveTo(-h, -h, -h + r, -h)
    return new ExtrudeGeometry(s, { depth: .55, bevelEnabled: true, bevelThickness: .04, bevelSize: .045, bevelSegments: 3, steps: 1 })
  }, [])
  useEffect(() => { texture.needsUpdate = true; return () => { texture.dispose(); geometry.dispose() } }, [texture, geometry])
  return <>
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, -.59, 0]} castShadow receiveShadow><meshStandardMaterial color="#69432a" roughness={.65} metalness={.08} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .022, 0]} receiveShadow><planeGeometry args={[6, 6]} /><meshStandardMaterial map={texture} roughness={.82} /></mesh>
    <mesh position={[0, -.16, 3.035]}><boxGeometry args={[5.65, .025, .012]} /><meshStandardMaterial color="#b18b47" metalness={.55} roughness={.4} /></mesh>
  </>
}
function Track({ from, to }: { from: number; to: number }) {
  const [ax, az] = boardWorldPoint(from), [bx, bz] = boardWorldPoint(to)
  return <mesh position={[(ax + bx) / 2, .032, (az + bz) / 2]} rotation={[0, Math.atan2(bx - ax, bz - az), 0]}><boxGeometry args={[.026, .006, Math.hypot(bx - ax, bz - az)]} /><meshStandardMaterial color="#244f3c" roughness={1} /></mesh>
}
function Space({ node, active }: { node: number; active: boolean }) {
  const [x, z] = boardWorldPoint(node), r = boardJunctions.includes(node) ? .208 : .15
  return <group position={[x, YUT_SURFACE_Y - .004, z]}>
    <mesh receiveShadow><cylinderGeometry args={[r, r, .012, 40]} /><meshStandardMaterial color={active ? '#e9cb77' : '#f0e7cb'} roughness={.95} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .008, 0]}><torusGeometry args={[r, .013, 8, 40]} /><meshStandardMaterial color={active ? '#b58724' : '#294f3b'} roughness={.65} metalness={active ? .25 : 0} /></mesh>
  </group>
}
function useLabel(text: string, color: string, token = false) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = token ? 256 : 64
    const ctx = canvas.getContext('2d')!
    if (token) {
      ctx.fillStyle = '#fff2d3'; ctx.fillRect(0, 0, 256, 256)
      ctx.strokeStyle = color; ctx.lineWidth = 15; ctx.beginPath(); ctx.arc(128, 128, 112, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.fillStyle = token ? '#233d31' : '#244f3c'
    ctx.font = token ? '700 150px Arial, sans-serif' : 'bold 40px BusanDandiMyeongjo, serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 128, token ? 139 : 35)
    const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace
    return map
  }, [text, color, token])
  useEffect(() => { texture.needsUpdate = true; return () => texture.dispose() }, [texture])
  return texture
}
function BoardLetter({ text, position, width }: { text: string; position: [number, number, number]; width: number }) {
  const map = useLabel(text, '#244f3c')
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={position}><planeGeometry args={[width, width / 4]} /><meshBasicMaterial map={map} transparent depthWrite={false} /></mesh>
}
function Piece({ node, team, count, label, selected, target, reducedMotion }: { node: number; team: number; count: number; label: number; selected: boolean; target: boolean; reducedMotion: boolean }) {
  const group = useRef<Group>(null), remaining = useRef(0)
  const invalidate = useThree(s => s.invalidate)
  const color = YUT_TEAM_COLORS[team], map = useLabel(String(label), color, true)
  const [x, z] = boardWorldPoint(node)
  useLayoutEffect(() => { remaining.current = reducedMotion ? 0 : .32; invalidate() }, [node, count, reducedMotion, invalidate])
  useFrame((_state, delta) => {
    if (!group.current) return
    remaining.current = Math.max(0, remaining.current - Math.min(delta, .05))
    group.current.position.y = YUT_SURFACE_Y + Math.sin(remaining.current / .32 * Math.PI) * .12
    if (remaining.current > 0) invalidate()
  })
  return <group ref={group} position={[x, YUT_SURFACE_Y, z]}>
    {Array.from({ length: count }, (_, i) => <group key={i} position={[0, YUT_TOKEN_HEIGHT * (i + .5), 0]}>
      <mesh castShadow receiveShadow><cylinderGeometry args={[.222, .235, .145, 48]} /><meshStandardMaterial color={color} roughness={.35} metalness={.12} /></mesh>
      <mesh position={[0, .071, 0]}><cylinderGeometry args={[.214, .222, .027, 48]} /><meshStandardMaterial color={color} roughness={.25} metalness={.18} /></mesh>
    </group>)}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, count * YUT_TOKEN_HEIGHT + .003, 0]}><circleGeometry args={[.18, 48]} /><meshStandardMaterial map={map} roughness={.6} /></mesh>
    {(selected || target) && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .003, 0]}><torusGeometry args={[.28, .025, 10, 48]} /><meshStandardMaterial color="#efd17b" emissive="#9a671b" emissiveIntensity={.25} /></mesh>}
  </group>
}
