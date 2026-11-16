import { Color,DoubleSide, MeshBasicMaterial, MeshLambertMaterial } from 'three'
import type { BufferGeometry, Mesh } from 'three'
import { useFrame } from '@react-three/fiber'
import { PropBuilder, hipRoof, type PropFinish } from '../world/art/propGeometry'
import { PropSign } from '../world/art/CraftedProp'
import { closeSurface } from '../world/art/closedSurface'
import { createRankingRoofSeats } from './rankingBoardRoofSeats'
import { KIOSKS,SETTINGS } from './layout'
import { useMemo, useRef } from 'react'
import { rankingPage, RANKING_PAGE_MS, useRankingPages } from '../features/rankingBoard/pages'
import { formatRankingUpdatedAt, rankingColumns } from '../features/rankingBoard/service'
import { useRankingBoardFeed } from '../features/rankingBoard/state'
import { drawRankingBoardPanel, drawRankingTitle } from '../features/rankingBoard/rankingBoardCanvas'
export { drawRankingBoardPanel } from '../features/rankingBoard/rankingBoardCanvas'

const wood = '#694725'
const cream = '#f1e7cf'
const signFont = '700 32px "Malgun Gothic"'
const titleSize = { width: 3.02, height: .44 }

// Structure and lettering are separate. Later ranking data can redraw each of
// the display planes without rebuilding any roof, post, or panel geometry.
// The timber frame still has three bays; the four paper planes hang in front of
// it (and of the two inner posts), so adding a column never changes the baked
// structure or the server collision map.
export function buildRankingBoard() {
  const b = new PropBuilder([8, 6], 'ranking-board-structure-v3')

  for (const x of [-4.15, -1.38, 1.38, 4.15]) {
    b.box('stone', '#aaa395', [x, 0.21, 0], [0.56, 0.42, 0.62])
    b.box('wood', wood, [x, 2.24, 0], [0.29, 3.88, 0.38])
  }
  b.box('wood', wood, [0, 4.12, 0], [8.85, 0.31, 0.48])
  b.box('wood', '#87603b', [0, 3.84, 0], [8.65, .28, .44])
  b.box('wood', wood, [0, 0.56, 0], [8.65, 0.24, 0.42])
  for (const x of [-2.77, 0, 2.77]) {
    b.box('wood', wood, [x, 2.19, 0], [2.55, 3.15, .42])
    for(const side of [-1,1])b.box('paint', cream, [x, 2.19, side*.222], [2.39, 3.0, .035])
  }

  // The existing roof helper already uses broad low-poly faces. The separate
  // flat material below deliberately skips the park's mapped tile/wood detail.
  hipRoof(b, 10, 2.1, 4.2, 1.48)
  const roofColor=new Color('#414957')
  const roofSurfaces=b.parts.tile.filter(g=>{
    const c=g.getAttribute('color')
    return Math.abs(c.getX(0)-roofColor.r)+Math.abs(c.getY(0)-roofColor.g)+Math.abs(c.getZ(0)-roofColor.b)<1e-6
  })
  // Baked builds already contain these seats and expose no construction parts.
  if(roofSurfaces.length)b.add('wood',createRankingRoofSeats(roofSurfaces),'#8b602f')
  for(let i=0;i<b.parts.tile.length;i++){
    const surface=b.parts.tile[i]!
    b.parts.tile[i]=closeSurface(surface,.12);surface.dispose()
  }
  for(const x of [-1.12,1.12])b.box('wood', wood, [x,4.1,.34], [.16,.18,.78])
  b.box('wood', wood, [0, 4.06, .75], [3.28, .58, .18])
  b.box('paint', cream, [0, 4.06, .845], [titleSize.width, titleSize.height, .025])

  for (const x of [-4.58, 4.58]) {
    b.box('wood', wood, [Math.sign(x)*4.34,4.12,.43], [.66,.16,1.06])
    b.box('wood', wood, [x, 3.76, 0.86], [0.08, .8, 0.08])
    b.box('wood', wood, [x, 3.38, 0.86], [0.34, 0.09, 0.32])
    b.box('glow', '#ffe3a1', [x, 3.06, 0.86], [0.25, 0.57, 0.23])
    b.box('wood', wood, [x, 2.75, 0.86], [0.34, 0.09, 0.32])
  }
  return b.finish()
}

export const rankingBoardArt = buildRankingBoard()
const entries = Object.entries(rankingBoardArt) as [PropFinish, BufferGeometry][]
const flatMaterial = new MeshLambertMaterial({ vertexColors: true, flatShading: true, side: DoubleSide })
const lanternMaterial = new MeshBasicMaterial({ vertexColors: true })

export const rankingBoardModelMetrics = {
  meshCount: entries.length,
  triangleCount: entries.reduce((total, [, geometry]) =>
    total + (geometry.index?.count ?? geometry.getAttribute('position').count) / 3, 0),
  structureTextureCount: 0,
  displayPlaneCount: 4,
} as const

// Four planes across the 7.91m the three old planes spanned, 7cm apart.
const panelSize = { width: 1.925, height: 2.98 }
const columns = [
  { title: '총자산', x: -2.9925 },
  { title: '두더지 잡기', x: -.9975 },
  { title: '스피드 두더지 잡기', x: .9975 },
  { title: '구구구 줄넘기', x: 2.9925 },
] as const

function RankingPageBar({ back = false }: { back?: boolean }) {
  const bar = useRef<Mesh>(null)
  useFrame(() => {
    const deadline = useRankingPages.getState().deadline
    const remaining = deadline === null ? 0 : Math.max(0, Math.min(1, (deadline - performance.now()) / RANKING_PAGE_MS))
    if (bar.current) { bar.current.scale.x = remaining; bar.current.position.x = -3.94 * (1 - remaining) }
  })
  return <group position={[0,.66,back?-.28:.28]} rotation={[0,back?Math.PI:0,0]}>
    <mesh position={[0,0,-.003]}><planeGeometry args={[7.88,.045]} /><meshBasicMaterial color="#345040" /></mesh>
    <mesh ref={bar}><planeGeometry args={[7.88,.045]} /><meshBasicMaterial color="#d7b66d" /></mesh>
  </group>
}

export function RankingBoardPanels({ bothSides = false }: { bothSides?: boolean } = {}) {
  const snapshot=useRankingBoardFeed(state=>state.snapshot)
  // Background polling must not recreate the canvas textures every 15 seconds.
  // Only the first-load/error presentation changes while no snapshot exists.
  const loading=useRankingBoardFeed(state=>!state.snapshot&&state.loading)
  const error=useRankingBoardFeed(state=>state.snapshot?'':state.error)
  const stale=useRankingBoardFeed(state=>state.stale)
  const page=useRankingPages(state=>state.boardPage)
  const definitions = page === 0 ? columns : [
    { title: '점프맵', x: -2.66 }, { title: '붕어빵 굽기', x: 0 }, { title: '온탑 꼬치왕', x: 2.66 },
  ]
  const panelDraws=useMemo(()=>{
    const data=snapshot?rankingPage(rankingColumns(snapshot),page):[]
    const message=loading?'랭킹 불러오는 중':error||'랭킹 준비 중'
    const time=snapshot?formatRankingUpdatedAt(snapshot.updatedAt):''
    const titles=page===0?columns.map(c=>c.title):['점프맵','붕어빵 굽기','온탑 꼬치왕']
    return titles.map((title,index)=>drawRankingBoardPanel({title,column:data[index]??null,message,updatedAt:time,stale,page}))
  },[snapshot,loading,error,stale,page])
  return <><PropSign position={[0,4.06,.859]} width={titleSize.width} height={titleSize.height} draw={drawRankingTitle} font={signFont}/>{definitions.map((column, index) => <PropSign key={column.title} position={[column.x, 2.19, .241]}
    backPosition={bothSides ? [-column.x, 2.19, -.25] : undefined}
    width={page===0?panelSize.width:2.59} height={panelSize.height} draw={panelDraws[index]!} font={signFont}/>)}
    <RankingPageBar />{bothSides&&<RankingPageBar back />}</>
}

export function RankingBoardModel({onInteract}:{onInteract?:()=>void}={}) {
  const site = KIOSKS.find(kiosk => kiosk.kind === 'photo')!
  return <group name="ranking-board-preview" position={[site.x, 0, site.z]} rotation={[0, site.yaw, 0]} scale={SETTINGS.rankingBoard.scale}
    userData={{ assetId: 'procedural/ranking-board', previewRole: 'ranking-board' }} onClick={event=>{
      event.stopPropagation()
      onInteract?.()
    }}>
    {entries.map(([kind, geometry]) => <mesh key={kind} geometry={geometry} dispose={null} castShadow={kind !== 'glow'} receiveShadow>
      <primitive object={kind === 'glow' ? lanternMaterial : flatMaterial} attach="material" dispose={null} />
    </mesh>)}
    <RankingBoardPanels />
  </group>
}
