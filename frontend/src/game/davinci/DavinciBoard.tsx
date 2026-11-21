import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CanvasTexture, Group, MathUtils, PerspectiveCamera, RepeatWrapping, SRGBColorSpace } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { CodeTile, DavinciHand, DavinciState, TileColor } from './protocol'

const TILE = new RoundedBoxGeometry(.57, .87, .22, 3, .045)
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
  c.fillStyle = color === 'BLACK' ? '#242622' : '#eee4cf'; c.fillRect(0, 0, 256, 384)
  c.strokeStyle = color === 'BLACK' ? '#ae8b4b' : '#8f7753'
  c.lineWidth = 2; c.strokeRect(13, 16, 230, 352); c.strokeRect(19, 23, 218, 338)
  c.clearRect(0, 0, 6, 6)
  if (!back && value !== null) {
    c.fillStyle = color === 'BLACK' ? '#fff7e2' : '#18281e'
    c.font = `500 ${value >= 10 ? 190 : 246}px Georgia, serif`
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(value === -1 ? '−' : String(value), 128, 192)
    c.fillRect(92, 313, 72, 4)
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

export const Tile = memo(function Tile({ tile, hidden, faceUp, selected, scale = 1, onClick, clickable, flat = false }: {
  tile: CodeTile; hidden: boolean; faceUp: boolean; selected: boolean; scale?: number; onClick(): void; clickable: boolean; flat?: boolean
}) {
  const pivot = useRef<Group>(null)
  const reduce = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const textures = useMemo(() => ({ front: faceTexture(tile.color, hidden ? null : tile.value, false), back: faceTexture(tile.color, null, true) }), [tile.color, tile.value, hidden])
  useEffect(() => () => { textures.front.dispose(); textures.back.dispose() }, [textures])
  useFrame((_, delta) => {
    if (!pivot.current) return
    const target = flat ? Math.PI / 2 : faceUp ? -Math.PI / 2 : 0
    const alpha = reduce ? 1 : 1 - Math.exp(-12 * Math.min(delta, .1))
    pivot.current.rotation.x = MathUtils.lerp(pivot.current.rotation.x, target, alpha)
    pivot.current.position.y = MathUtils.lerp(pivot.current.position.y, selected ? .18 : 0, alpha)
  })
  return <group scale={scale}>
    <group ref={pivot} onClick={e => { e.stopPropagation(); if (clickable) onClick() }}
      onPointerOver={e => { e.stopPropagation(); if (clickable) document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { document.body.style.cursor = '' }}>
      <mesh geometry={TILE} dispose={null} position={[0, .445, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={tile.color === 'BLACK' ? '#1f2520' : '#e9dfca'} roughness={.4} metalness={.04}
          emissive={selected ? '#aa742b' : '#000000'} emissiveIntensity={selected ? .4 : 0} />
      </mesh>
      <mesh position={[0, .445, .113]}><planeGeometry args={[.51, .78]} /><meshStandardMaterial map={textures.front} roughness={.6} /></mesh>
      <mesh position={[0, .445, -.113]} rotation={[0, Math.PI, 0]}><planeGeometry args={[.51, .78]} /><meshStandardMaterial map={textures.back} roughness={.6} /></mesh>
      <mesh position={[0, .052, .115]}><boxGeometry args={[.49, .045, .025]} /><meshStandardMaterial color="#b58e4b" metalness={.55} roughness={.4} /></mesh>
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
