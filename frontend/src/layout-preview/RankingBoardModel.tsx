import { Color,DoubleSide, MeshBasicMaterial, MeshLambertMaterial } from 'three'
import type { BufferGeometry } from 'three'
import { PropBuilder, hipRoof, type PropFinish } from '../world/art/propGeometry'
import { PropSign } from '../world/art/CraftedProp'
import { closeSurface } from '../world/art/closedSurface'
import { createRankingRoofSeats } from './rankingBoardRoofSeats'
import { KIOSKS,SETTINGS } from './layout'
import { useMemo } from 'react'
import { formatRankingUpdatedAt, rankingColumns, type RankingDisplayColumn } from '../features/rankingBoard/service'
import { useRankingBoardFeed } from '../features/rankingBoard/state'

const wood = '#694725'
const cream = '#f1e7cf'
const green = '#254d3c'
const signFont = '700 32px "Malgun Gothic"'
const titleSize = { width: 3.02, height: .44 }

// Structure and lettering are separate. Later ranking data can redraw each of
// the three planes without rebuilding any roof, post, or panel geometry.
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
  displayPlaneCount: 3,
} as const

const columns = [
  { title: '보유량', x: -2.77 },
  { title: '두더지 잡기', x: 0 },
  { title: '스피드 두더지 잡기', x: 2.77 },
] as const

type BoardPanelState = { title: string; column: RankingDisplayColumn | null; message: string; updatedAt: string; stale: boolean }

export const drawRankingBoardPanel = ({ title, column, message, updatedAt, stale }: BoardPanelState) =>
  (c: CanvasRenderingContext2D, w: number, h: number) => {
  c.fillStyle = cream
  c.fillRect(0, 0, w, h)
  const pad=w*.035,header=h*.17
  c.strokeStyle='#cfbf9e';c.lineWidth=w*.004
  c.strokeRect(pad/2,pad/2,w-pad,h-pad)
  c.fillStyle = green
  c.fillRect(pad,pad,w-pad*2,header-pad)
  c.fillStyle = '#fff9e9'
  c.font = `700 ${header * 0.42}px "Malgun Gothic", sans-serif`
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillText(column?.title ?? title, w / 2, (header+pad) / 2)
  c.fillStyle='#c5a266';c.fillRect(pad,header,w-pad*2,h*.004)
  if (!column || !column.rows.length) {
    c.fillStyle='#726957';c.font=`600 ${h*.038}px "Malgun Gothic", sans-serif`;c.textAlign='center'
    c.fillText(column ? '아직 기록이 없습니다' : message, w/2, h*.52, w*.82)
  } else {
    c.font = `600 ${h * 0.031}px "Malgun Gothic", sans-serif`
    for (let i = 0; i < column.rows.length; i++) {
      const row=(h-header-pad*2.6)/10,top=header+pad*.55+i*row,y=top+row/2
      if(i%2===0){c.fillStyle='#eae2d0';c.fillRect(pad,top,w-pad*2,row)}
      const item=column.rows[i]!
      c.textAlign='left';c.fillStyle=i<3?'#7c5522':'#827967';c.font=`700 ${h*.034}px "Malgun Gothic", sans-serif`
      c.fillText(String(item.rank),w*.075,y,w*.08)
      c.fillStyle='#4f4a40';c.font=`600 ${h*.029}px "Malgun Gothic", sans-serif`
      c.fillText(item.nickname,w*.18,y,w*.42)
      c.textAlign='right';c.font=`600 ${h*.027}px "Malgun Gothic", sans-serif`
      c.fillText(item.value,w*.92,y,w*.29)
      c.fillStyle = '#d4cbb7';c.fillRect(w*.18,top+row*.86,w*.74,h*.002)
    }
  }
  c.textAlign='center';c.fillStyle=stale?'#9a5f26':'#776f60';c.font=`500 ${h*.021}px "Malgun Gothic", sans-serif`
  c.fillText(stale?'이전 집계 표시 중':updatedAt?`집계 ${updatedAt}`:'',w/2,h*.965,w*.88)
}

const drawTitle = (c: CanvasRenderingContext2D, w: number, h: number) => {
  c.fillStyle = cream
  c.fillRect(0, 0, w, h)
  c.strokeStyle='#b79b68';c.lineWidth=h*.025
  c.strokeRect(w*.018,h*.09,w*.964,h*.82)
  c.fillStyle = green
  c.font = `700 ${h * 0.58}px "Malgun Gothic", sans-serif`
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  // PropSign's minimum canvas height otherwise stretches this wide plaque's text.
  c.save();c.translate(w/2,h/2);c.scale(w/h/(titleSize.width/titleSize.height),1)
  c.fillText('온탑 랭킹', 0, 0);c.restore()
  for(const x of [w*.09,w*.91]){c.save();c.translate(x,h/2);c.rotate(Math.PI/4);c.fillRect(-h*.045,-h*.045,h*.09,h*.09);c.restore()}
}

export function RankingBoardPanels() {
  const snapshot=useRankingBoardFeed(state=>state.snapshot)
  // Background polling must not recreate three canvas textures every 15 seconds.
  // Only the first-load/error presentation changes while no snapshot exists.
  const loading=useRankingBoardFeed(state=>!state.snapshot&&state.loading)
  const error=useRankingBoardFeed(state=>state.snapshot?'':state.error)
  const stale=useRankingBoardFeed(state=>state.stale)
  const panelDraws=useMemo(()=>{
    const data=snapshot?rankingColumns(snapshot):[]
    const message=loading?'랭킹 불러오는 중':error||'랭킹 준비 중'
    const time=snapshot?formatRankingUpdatedAt(snapshot.updatedAt):''
    return columns.map((definition,index)=>drawRankingBoardPanel({title:definition.title,column:data[index]??null,message,updatedAt:time,stale}))
  },[snapshot,loading,error,stale])
  return <>{columns.map((column, index) => <PropSign key={column.title} position={[column.x, 2.19, .241]}
    width={2.37} height={2.98} draw={panelDraws[index]!} font={signFont}/>)}</>
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
    <PropSign position={[0,4.06,.859]} width={titleSize.width} height={titleSize.height} draw={drawTitle} font={signFont}/>
    <RankingBoardPanels />
  </group>
}
