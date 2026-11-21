import { useRef } from 'react'
import { useLoader, type ThreeEvent } from '@react-three/fiber'
import { BoxGeometry, CanvasTexture, ExtrudeGeometry, Group, LinearFilter, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Shape, SRGBColorSpace, TextureLoader, type Texture } from 'three'
import { useShallow } from 'zustand/react/shallow'
import ontopLogo from '../../assets/entry/ontop-logo.webp'
import type { TableAnchor } from '../../park/tablePlacement'
import { tableSeats } from '../../park/tablePlacement'
import { useSession } from '../../network/worldClient'
import { useGame } from '../store'
import { useTableGameCode } from '../../features/tableLobby/tableGamePresentation'
import { canActRummikub } from './actions'
import { useRummikubDraft, sortRummikubTiles } from './draft'
import type { Tile, Placed } from './protocol'
import { layoutMelds, rackLayout } from './layout'
import { useTileDrag } from './dragInput'

const ink = { BLACK: '#1d2522', BLUE: '#123e9b', RED: '#ae201a', YELLOW: '#965400' }
function bevel(width: number, length: number, depth: number, radius: number) {
  const x = -width / 2, z = -length / 2, s = new Shape()
  s.moveTo(x + radius, z); s.lineTo(x + width - radius, z)
  s.quadraticCurveTo(x + width, z, x + width, z + radius)
  s.lineTo(x + width, z + length - radius)
  s.quadraticCurveTo(x + width, z + length, x + width - radius, z + length)
  s.lineTo(x + radius, z + length)
  s.quadraticCurveTo(x, z + length, x, z + length - radius)
  s.lineTo(x, z + radius); s.quadraticCurveTo(x, z, x + radius, z)
  const geometry = new ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: .006, bevelSize: .006, bevelSegments: 2, curveSegments: 5, steps: 1 })
  geometry.rotateX(-Math.PI / 2)
  return geometry
}
const tileBody = bevel(.185, .25, .055, .02), selectedBody = bevel(.207, .272, .006, .022)
const rackBody = bevel(2.07, .82, .075, .04), rackStep = bevel(2.07, .38, .07, .025)
const rail = new BoxGeometry(2.08, .045, .045), feet = new BoxGeometry(.08, .025, .76)
const labelPlane = new PlaneGeometry(.157, .211), logoPlane = new PlaneGeometry(.165, .111)
const badgePlane = new PlaneGeometry(.085, .085), rolePlane = new PlaneGeometry(.065, .07)
const ivory = new MeshBasicMaterial({ color: '#fff3d7' })
const edge = new MeshStandardMaterial({ color: '#9a633b', roughness: .38, metalness: .12 })
const wood = new MeshStandardMaterial({ color: '#62402b', roughness: .42 })
const gold = new MeshStandardMaterial({ color: '#c6a262', metalness: .55, roughness: .27 })
const selection = new MeshBasicMaterial({ color: '#ffcf66' })
const tileMaterials = [ivory, edge]
const labels = new Map<string, MeshBasicMaterial>(), logos = new WeakMap<Texture, MeshBasicMaterial>()
function label(text: string, color: string, badge = false) {
  const key = `${text}:${color}:${badge}`
  if (!labels.has(key)) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512
    const ctx = canvas.getContext('2d')!
    if (badge) { ctx.fillStyle = '#214c3c'; ctx.beginPath(); ctx.arc(256, 256, 246, 0, Math.PI * 2); ctx.fill() }
    ctx.font = `900 ${text.length > 1 ? 380 : 420}px Arial, sans-serif`
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 275)
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace; texture.minFilter = LinearFilter; texture.magFilter = LinearFilter
    texture.generateMipmaps = false; texture.anisotropy = 8
    labels.set(key, new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }))
  }
  return labels.get(key)!
}
function logoMaterial(texture: Texture) {
  if (!logos.has(texture)) {
    texture.colorSpace = SRGBColorSpace; texture.anisotropy = 8
    logos.set(texture, new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }))
  }
  return logos.get(texture)!
}
const noRaycast = () => {}
function Block({ tile, x, z, y = 0, selected, enabled, held = false, logo, begin, ghost = false }: {
  tile: Tile | Placed; x: number; z: number; y?: number; selected: boolean; enabled: boolean; held?: boolean; logo: Texture
  begin?(event: ThreeEvent<PointerEvent>, tile: Tile | Placed): void; ghost?: boolean
}) {
  const joker = tile.id.startsWith('JOKER')
  return <group name={`${ghost ? 'supae-ghost' : 'supae-tile'}-${tile.id}`} position={[x, y + (selected ? .09 : .01), z]} rotation={[held ? .42 : 0, 0, 0]} scale={held ? 1.17 : 1}
    onPointerDown={e => { if (enabled) begin?.(e,tile); else e.stopPropagation() }} onClick={e => e.stopPropagation()}>
    {selected && <mesh geometry={selectedBody} material={selection} dispose={null} position={[0, -.012, 0]} raycast={ghost ? noRaycast : undefined} />}
    <mesh geometry={tileBody} material={tileMaterials} dispose={null} raycast={ghost ? noRaycast : undefined} />
    <mesh geometry={joker ? logoPlane : labelPlane} material={joker ? logoMaterial(logo) : label(String(tile.number), ink[tile.color!])}
      dispose={null} raycast={ghost ? noRaycast : undefined} renderOrder={2} rotation={[-Math.PI / 2, 0, 0]} position={[0, .064, joker ? -.025 : 0]} />
    {joker && <mesh geometry={rolePlane} material={label(tile.number ? String(tile.number) : 'J', ink[tile.color ?? 'BLACK'])}
      dispose={null} raycast={ghost ? noRaycast : undefined} renderOrder={3} rotation={[-Math.PI / 2, 0, 0]} position={[.045, .066, .08]} />}
  </group>
}

/** 기존 테이블 표시 영역만 사용하고 충돌체를 추가하지 않는다. */
export function RummikubSurface({ anchor }: { anchor: TableAnchor }) {
  const root = useRef<Group>(null)
  const s = useSession(useShallow(s => ({ bindings: s.bindings, roomId: s.roomId, tableId: s.tableId, watchedTableId: s.watchedTableId, seatIndex: s.seatIndex, status: s.status, sessionId: s.sessionId })))
  const g = useGame(v => v.game?.rummikub ? v.game : null), ui = useRummikubDraft()
  const selectedGame = useTableGameCode(anchor.id) === 'RUMMIKUB', logo = useLoader(TextureLoader, ontopLogo)
  const binding = s.bindings.find(b => b.channelId === s.roomId && b.anchorId === anchor.id)
  const relevant = !!g && !!binding && (g.role === 'PLAYER' ? s.tableId : s.watchedTableId) === binding.tableId
  const seat = relevant && g?.role === 'PLAYER' ? tableSeats(anchor)[s.seatIndex] : undefined
  const melds = relevant ? (ui.source === g!.rummikub ? ui.draft ?? g!.rummikub.melds : g!.rummikub.melds) : []
  const publicIds = new Set(melds.flat().map(t => t.id))
  const hand = sortRummikubTiles(relevant && g?.role === 'PLAYER' ? (g.rummikubHand?.tiles ?? []).filter(t => !publicIds.has(t.id)) : [], ui.sort)
  const enabled = relevant && s.status === 'connected' && canActRummikub(s.sessionId, { kind: 'draw' })
  const drag = useTileDrag(root, {enabled,gameId:g?.gameId??'',version:g?.version??-1,state:relevant ? g!.rummikub : null,melds,
    hand:relevant && g?.role==='PLAYER' ? g.rummikubHand?.tiles??[] : []})
  const layout = layoutMelds(melds.map(m => m.length))
  const {racks:rackCount,scale:rackScale,z:rackZ} = rackLayout(hand.length)
  if (!selectedGame && !relevant) return null
  return <group ref={root} name={`supae-table-${anchor.id}`} scale={.6} position={[0, 1.1, 0]} rotation={[0, seat ? Math.atan2(seat.x, seat.z) : 0, 0]}>
    <mesh position={[0, -.018, -.15]}><boxGeometry args={[2.35, .025, 1.65]} /><meshStandardMaterial color="#244d40" roughness={.85} /></mesh>
    <group ref={drag.marker} visible={false} raycast={noRaycast}><mesh raycast={noRaycast}><boxGeometry args={[1,.005,1]}/><meshBasicMaterial color="#ffdb83" transparent opacity={.35} depthWrite={false}/></mesh></group>
    <group scale={layout.scale} position={[0, 0, -.65]}>{melds.map((meld, row) => <group key={row} position={[layout.positions[row]!.x, 0, layout.positions[row]!.z]}>
      <mesh geometry={badgePlane} material={label(String(row + 1), '#ffe1a2', true)} dispose={null} rotation={[-Math.PI / 2, 0, 0]} position={[-(meld.length - 1) * .106 - .19, .065, 0]} />
      {meld.map((tile, i) => <Block key={tile.id} tile={tile} x={(i - (meld.length - 1) / 2) * .212} z={0} logo={logo}
        begin={drag.begin} selected={ui.selected.includes(tile.id)} enabled={enabled && (g!.rummikub.players.find(p => p.userId === s.sessionId)?.registered === true || !!g!.rummikubHand?.tiles.some(t => t.id === tile.id))} />)}
    </group>)}</group>
    {relevant && !!g?.rummikubHand?.tiles.length && <group position={[0, .025, rackZ]} scale={rackScale}>
      {Array.from({ length: rackCount }, (_, rack) => <group key={rack} position={[0, 0, rack * .85]}>
        <mesh geometry={rackBody} material={wood} dispose={null} />
        <mesh geometry={rackStep} material={wood} dispose={null} position={[0, .075, -.2]} />
        <mesh geometry={rail} material={gold} dispose={null} position={[0, .075, .4]} />
        <mesh geometry={rail} material={gold} dispose={null} position={[0, .16, 0]} />
        {[-.96, .96].map(x => <mesh key={x} geometry={feet} material={gold} dispose={null} position={[x, -.012, 0]} />)}
        {hand.slice(rack * 14, rack * 14 + 14).map((tile, i) => <Block key={tile.id} tile={tile} x={(i % 7 - 3) * .275}
          z={i < 7 ? -.2 : .19} y={i < 7 ? .17 : .08} logo={logo} begin={drag.begin} held selected={ui.selected.includes(tile.id)} enabled={enabled} />)}
      </group>)}
    </group>}
    <group ref={drag.ghost} visible={false}>{drag.carried.map((tile,i)=><Block key={tile.id} tile={tile} x={(i%7)*.21} z={Math.floor(i/7)*.27} logo={logo} selected={false} enabled={false} ghost/>)}</group>
  </group>
}
