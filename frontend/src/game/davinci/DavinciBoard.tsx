import { memo, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { CanvasTexture, Group, MathUtils, PerspectiveCamera, RepeatWrapping, SRGBColorSpace, TextureLoader } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import ontopLogo from '../../assets/entry/ontop-logo.webp'
import type { CodeTile, DavinciHand, DavinciState, TileColor } from './protocol'

const TILE = new RoundedBoxGeometry(.57, .87, .24, 3, .06)
const railGeometry = new RoundedBoxGeometry(1, 1, 1, 2, .05)
type Selection = { userId: string; tileId: string } | null
export interface BoardProps {
  state: DavinciState; hand: DavinciHand | null; viewerId: string; selected: Selection
  enabled: boolean; canPing?: boolean; pingTileId?: string | null; select(userId: string, tileId: string): void
  draw(tileId: string): void; reveal(tileId: string): void
}

/** 숫자를 모르는 타일에는 숫자 텍스처 자체를 생성하지 않는다. */
function faceTexture(color: TileColor, value: number | null, back: boolean) {
  const canvas = document.createElement('canvas')
  canvas.width = 256; canvas.height = 384
  const c = canvas.getContext('2d')!
  // 원목 액자와 기와/상아색 면. 뒷면 문양은 숫자·조커에 관계없이 동일하다.
  const wood = c.createLinearGradient(0, 0, 256, 384)
  wood.addColorStop(0, '#a27b4d'); wood.addColorStop(.45, '#60432c'); wood.addColorStop(1, '#8c653d')
  c.fillStyle = wood; c.fillRect(0, 0, 256, 384)
  c.strokeStyle = '#d5ad6b55'; c.lineWidth = 1
  for (let i = 0; i < 28; i++) { c.beginPath(); c.moveTo(i * 11, 0); c.bezierCurveTo(i * 11 - 9, 100, i * 11 + 8, 270, i * 11 - 2, 384); c.stroke() }
  c.fillStyle = color === 'BLACK' ? '#202d29' : '#eee4cc'; c.beginPath(); c.roundRect(17, 18, 222, 348, 18); c.fill()
  c.strokeStyle = color === 'BLACK' ? '#c3a96a' : '#8f7954'; c.lineWidth = 2; c.beginPath(); c.roundRect(25, 26, 206, 332, 12); c.stroke()
  c.globalAlpha = .12; c.strokeStyle = color === 'BLACK' ? '#e4d3a1' : '#6e7959'
  for (let y = 45; y < 354; y += 13) { c.beginPath(); c.moveTo(30, y); c.bezierCurveTo(82, y - 3, 172, y + 3, 226, y); c.stroke() }
  c.globalAlpha = 1
  // 윗부분의 구름 장식은 숫자의 읽는 영역을 침범하지 않는다.
  c.strokeStyle = '#b89b63'; c.lineWidth = 3; c.beginPath(); c.moveTo(86, 64); c.bezierCurveTo(90, 51, 108, 51, 113, 61); c.bezierCurveTo(122, 43, 145, 49, 146, 62); c.lineTo(172, 62); c.stroke()
  if (!back && value !== null) {
    c.fillStyle = color === 'BLACK' ? '#fff7e2' : '#18281e'
    c.textAlign = 'center'; c.textBaseline = 'middle'
    if (value === -1) {
      c.fillStyle = color === 'BLACK' ? '#fff7e2' : '#18281e'; c.font = '500 148px Georgia, serif'; c.fillText('−', 128, 224)
      c.font = '600 25px "Malgun Gothic", sans-serif'; c.fillText('조커', 128, 291)
    } else { c.font = `500 ${value >= 10 ? 176 : 218}px Georgia, serif`; c.fillText(String(value), 128, 194) }
    c.fillRect(95, 320, 66, 4)
  } else {
    c.save(); c.translate(128, 202); c.rotate(Math.PI / 4); c.strokeStyle = color === 'BLACK' ? '#c1a56a' : '#8c805e'; c.lineWidth = 3
    c.strokeRect(-43, -43, 86, 86); c.strokeRect(-33, -33, 66, 66)
    c.beginPath(); c.moveTo(-33, 0); c.lineTo(33, 0); c.moveTo(0, -33); c.lineTo(0, 33); c.stroke(); c.restore()
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function surfaceTexture(kind: 'wood' | 'felt' | 'stone') {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512
  const c = canvas.getContext('2d')!, image = c.createImageData(512, 512)
  const base = kind === 'wood' ? [113, 73, 43] : kind === 'felt' ? [45, 68, 47] : [133, 135, 119]
  let seed = 781
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const noise = (seed / 4294967296 - .5) * (kind === 'felt' ? 13 : 8)
    const grain = kind === 'wood' ? Math.sin(y * .16 + Math.sin(x * .012) * 4) * 9 : 0
    const index = (y * 512 + x) * 4
    for (let channel = 0; channel < 3; channel++) image.data[index + channel] = base[channel]! + noise + grain
    image.data[index + 3] = 255
  }
  c.putImageData(image, 0, 0)
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.repeat.set(kind === 'wood' ? 2 : 4, kind === 'wood' ? 2 : 4)
  return texture
}

/** 원본 로고의 비율·투명도를 유지하며 본인 또는 공개된 조커 앞면에만 붙인다. */
function JokerLogo() {
  const map = useLoader(TextureLoader, ontopLogo)
  useLayoutEffect(() => { map.colorSpace = SRGBColorSpace; map.needsUpdate = true }, [map])
  return <mesh name="secret-joker-logo" position={[0, .56, .126]}>
    <planeGeometry args={[.4, .4 * map.image.height / map.image.width]} />
    <meshStandardMaterial map={map} transparent depthWrite={false} roughness={.82} />
  </mesh>
}

export const Tile = memo(function Tile({ tile, hidden, faceUp, selected, scale = 1, onClick, clickable, flat = false }: {
  tile: CodeTile; hidden: boolean; faceUp: boolean; selected: boolean; scale?: number; onClick(): void; clickable: boolean; flat?: boolean
}) {
  const pivot = useRef<Group>(null)
  const [hovered, setHovered] = useState(false)
  const reduce = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const textures = useMemo(() => ({ front: faceTexture(tile.color, hidden ? null : tile.value, false), back: faceTexture(tile.color, null, true) }), [tile.color, tile.value, hidden])
  useEffect(() => () => { textures.front.dispose(); textures.back.dispose(); document.body.style.cursor = '' }, [textures])
  useFrame((_, delta) => {
    if (!pivot.current) return
    const target = flat ? Math.PI / 2 : faceUp ? -Math.PI / 2 : 0
    const alpha = reduce ? 1 : 1 - Math.exp(-12 * Math.min(delta, .1))
    pivot.current.rotation.x = MathUtils.lerp(pivot.current.rotation.x, target, alpha)
    pivot.current.position.y = MathUtils.lerp(pivot.current.position.y, selected ? .18 : hovered && clickable ? .12 : 0, alpha)
  })
  return <group scale={scale}>
    <group ref={pivot} onClick={e => { e.stopPropagation(); if (clickable) onClick() }}
      onPointerOver={e => { e.stopPropagation(); if (clickable) { setHovered(true); document.body.style.cursor = 'pointer' } }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = '' }}>
      <mesh geometry={TILE} dispose={null} position={[0, .445, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={tile.color === 'BLACK' ? '#28372f' : '#e6dcc4'} roughness={.72} metalness={.02}
          emissive={selected || hovered && clickable ? '#aa742b' : '#000000'} emissiveIntensity={selected ? .4 : hovered && clickable ? .22 : 0} />
      </mesh>
      <mesh position={[0, .445, .123]}><planeGeometry args={[.51, .78]} /><meshStandardMaterial map={textures.front} roughness={.82} /></mesh>
      {!hidden && tile.value === -1 && <Suspense fallback={null}><JokerLogo /></Suspense>}
      <mesh position={[0, .445, -.123]} rotation={[0, Math.PI, 0]}><planeGeometry args={[.51, .78]} /><meshStandardMaterial map={textures.back} roughness={.82} /></mesh>
      {[.045, .845].map(y => <mesh key={y} geometry={railGeometry} dispose={null} position={[0, y, 0]} scale={[.59, .055, .26]} castShadow>
        <meshStandardMaterial color="#85603e" roughness={.72} />
      </mesh>)}
    </group>
  </group>
})

function CameraFit() {
  const { camera, size } = useThree()
  useLayoutEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    const aspect = size.width / Math.max(1, size.height)
    const distance = aspect < 1.1 ? 13.8 : 11.1
    camera.position.set(0, distance * .85, distance * .8)
    camera.lookAt(0, .05, 0)
    camera.fov = aspect < .7 ? 58 : 46
    camera.updateProjectionMatrix()
  }, [camera, size.width, size.height])
  return null
}

function Scene({ state, hand, viewerId, selected, enabled, canPing, pingTileId, select, draw, reveal }: BoardProps) {
  const textures = useMemo(() => ({ wood: surfaceTexture('wood'), felt: surfaceTexture('felt'), stone: surfaceTexture('stone') }), [])
  useEffect(() => () => { Object.values(textures).forEach(t => t.dispose()); document.body.style.cursor = '' }, [textures])
  const anchor = Math.max(0, state.players.findIndex(p => p.userId === viewerId))
  const slots = state.players.length === 2 ? [0, 2] : state.players.length === 3 ? [0, 1, 3] : [0, 1, 2, 3]
  const positions: [number, number, number][] = [[0, .11, 2.85], [-3.7, .11, -.1], [0, .11, -3.0], [3.7, .11, -.1]]
  return <>
    <color attach="background" args={['#576554']} /><fog attach="fog" args={['#89927b', 19, 35]} />
    <ambientLight intensity={1.4} /><hemisphereLight args={['#fff7dd', '#465540', 1.1]} />
    <directionalLight position={[-5, 12, 6]} intensity={2.5} castShadow shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={10} shadow-camera-bottom={-10} shadow-bias={-.0002} />
    <CameraFit />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.15, 0]} receiveShadow><planeGeometry args={[70, 70]} /><meshStandardMaterial map={textures.stone} roughness={1} /></mesh>
    {[-7, 7].map(x => <group key={x} position={[x, -1, -6]}>
      <mesh castShadow position={[0, 1.9, 0]}><cylinderGeometry args={[.18, .23, 5, 10]} /><meshStandardMaterial color="#674833" /></mesh>
      {[0, 1, 2].map(level => <mesh key={level} position={[0, 2.8 + level * .85, 0]} castShadow><coneGeometry args={[1.8 - level * .32, 1.8, 8]} /><meshStandardMaterial color={level % 2 ? '#49664a' : '#36563c'} roughness={1} /></mesh>)}
    </group>)}
    {[-5.9, 5.9].map(x => <group key={x} position={[x, -1, -4.8]}>
      <mesh position={[0, 1.7, 0]} castShadow><boxGeometry args={[.28, 5.1, .28]} /><meshStandardMaterial color="#644830" /></mesh>
      {[.8, 1.5].map(y => <mesh key={y} position={[-x / 2, y, 0]}><boxGeometry args={[Math.abs(x), .16, .13]} /><meshStandardMaterial color="#294e3a" /></mesh>)}
    </group>)}
    <mesh position={[0, -.22, 0]} geometry={railGeometry} scale={[10.7, .42, 8.1]} castShadow receiveShadow><meshStandardMaterial map={textures.wood} roughness={.6} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .003, 0]} receiveShadow><planeGeometry args={[9.8, 7.25]} /><meshStandardMaterial map={textures.felt} roughness={1} /></mesh>
    {[-5, 5].map(x => <mesh key={x} position={[x, .08, 0]} geometry={railGeometry} scale={[.22, .2, 7.7]} castShadow><meshStandardMaterial map={textures.wood} /></mesh>)}
    {[-3.75, 3.75].map(z => <mesh key={z} position={[0, .08, z]} geometry={railGeometry} scale={[10.2, .2, .23]} castShadow><meshStandardMaterial map={textures.wood} /></mesh>)}
    {state.players.map((player, index) => {
      const slot = slots[(index - anchor + state.players.length) % state.players.length]!
      const own = player.userId === viewerId
      const tiles = own && hand ? hand.tiles : player.tiles
      const display = state.stage === 'SETUP' && !own ? Array.from({ length: player.tileCount }, (_, i): CodeTile => ({ id: `setup-${i}`, color: i % 2 ? 'WHITE' : 'BLACK', value: null, revealed: false })) : tiles
      const scale = Math.min(1.2, (slot % 2 ? 5.1 : 7.1) / Math.max(1, display.length * .69))
      return <group key={player.userId} position={positions[slot]} rotation={[0, slot === 1 ? Math.PI / 2 : slot === 2 ? Math.PI : slot === 3 ? -Math.PI / 2 : 0, 0]}>
        <mesh position={[0, -.015, .05]} geometry={railGeometry} scale={[Math.max(1.3, display.length * .69 * scale + .22), .09, .43]} receiveShadow><meshStandardMaterial map={textures.wood} /></mesh>
        {display.map((tile, i) => <group key={tile.id} position={[(i - (display.length - 1) / 2) * .69 * scale, 0, 0]}>
          <Tile tile={tile} hidden={tile.value === null} faceUp={tile.revealed} selected={selected?.tileId === tile.id || pingTileId === tile.id}
            scale={scale} clickable={!!canPing || enabled && (!own && !tile.revealed && ['GUESS', 'CONTINUE'].includes(state.stage) || own && !tile.revealed && state.stage === 'REVEAL')}
            onClick={() => own ? reveal(tile.id) : select(player.userId, tile.id)} />
        </group>)}
      </group>
    })}
    {state.supply.map((tile, i) => <group key={tile.id} position={[((i % 6) - 2.5) * .67, .15 + Math.floor(i / 18) * .03, (Math.floor(i / 6) - 1.5) * .55]}
      rotation={[0, Math.sin(i * 4.2) * .15, 0]}>
      <Tile tile={{ ...tile, value: null, revealed: false }} hidden faceUp={false} flat scale={.72} selected={false}
        clickable={enabled && state.stage === 'DRAW'} onClick={() => draw(tile.id)} />
    </group>)}
  </>
}

export function DavinciBoard(props: BoardProps) {
  return <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 9.5, 9], fov: 46, near: .1, far: 80 }}
    gl={{ antialias: true, alpha: false }} aria-label="흑백수사 3D 게임판">
    <Scene {...props} />
  </Canvas>
}
