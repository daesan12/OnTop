import { DoubleSide, MeshBasicMaterial, MeshLambertMaterial } from 'three'
import type { BufferGeometry } from 'three'
import { PropBuilder, hipRoof, type PropFinish } from '../world/art/propGeometry'
import { PropSign } from '../world/art/CraftedProp'
import { KIOSKS,SETTINGS } from './layout'

const wood = '#694725'
const cream = '#f1e7cf'
const green = '#254d3c'

// Structure and lettering are separate. Later ranking data can redraw each of
// the three planes without rebuilding any roof, post, or panel geometry.
function buildRankingBoard() {
  const b = new PropBuilder([8, 6], 'ranking-board-structure-v1')

  for (const x of [-4.15, -1.38, 1.38, 4.15]) {
    b.box('stone', '#aaa395', [x, 0.21, 0], [0.56, 0.42, 0.62])
    b.box('wood', wood, [x, 2.24, 0], [0.29, 3.88, 0.38])
  }
  b.box('wood', wood, [0, 4.12, 0], [8.85, 0.31, 0.48])
  b.box('wood', wood, [0, 0.56, 0], [8.65, 0.24, 0.42])
  for (const x of [-2.77, 0, 2.77]) {
    b.box('paint', cream, [x, 2.19, -0.2], [2.43, 3.06, 0.06])
    b.box('wood', wood, [x, 2.19, 0.12], [2.51, 3.15, 0.14])
    b.box('paint', cream, [x, 2.19, 0.21], [2.43, 3.06, 0.05])
  }

  // The existing roof helper already uses broad low-poly faces. The separate
  // flat material below deliberately skips the park's mapped tile/wood detail.
  hipRoof(b, 10, 2.1, 4.2, 1.48)
  b.box('wood', wood, [0, 4.64, 0.95], [3.0, 0.62, 0.12])
  b.box('paint', cream, [0, 4.64, 1.03], [2.82, 0.48, 0.05])

  for (const x of [-4.58, 4.58]) {
    b.box('wood', wood, [x, 3.63, 0.86], [0.08, 0.43, 0.08])
    b.box('wood', wood, [x, 3.38, 0.86], [0.34, 0.09, 0.32])
    b.box('glow', '#ffe3a1', [x, 3.06, 0.86], [0.25, 0.53, 0.23])
    b.box('wood', wood, [x, 2.75, 0.86], [0.34, 0.09, 0.32])
  }
  return b.finish()
}

const art = buildRankingBoard()
const entries = Object.entries(art) as [PropFinish, BufferGeometry][]
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
  { title: '승부사', x: 0 },
  { title: '승수', x: 2.77 },
] as const

const panelDraws = columns.map(({ title }) => (c: CanvasRenderingContext2D, w: number, h: number) => {
  c.fillStyle = cream
  c.fillRect(0, 0, w, h)
  const header = h * 0.16
  c.fillStyle = green
  c.fillRect(0, 0, w, header)
  c.fillStyle = '#fff9e9'
  c.font = `700 ${header * 0.47}px "Malgun Gothic", sans-serif`
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillText(title, w / 2, header / 2)
  c.textAlign = 'left'
  c.fillStyle = '#827967'
  c.font = `500 ${h * 0.032}px "Malgun Gothic", sans-serif`
  for (let i = 0; i < 10; i++) {
    const y = header + (i + 0.5) * (h - header) / 10
    c.fillText(String(i + 1), w * 0.06, y)
    c.fillStyle = '#d4cbb7'
    c.fillRect(w * 0.2, y + h * 0.012, w * 0.69, h * 0.003)
    c.fillStyle = '#827967'
  }
})

const drawTitle = (c: CanvasRenderingContext2D, w: number, h: number) => {
  c.fillStyle = cream
  c.fillRect(0, 0, w, h)
  c.fillStyle = '#382b20'
  c.font = `700 ${h * 0.58}px "Malgun Gothic", sans-serif`
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillText('온탑 랭킹', w / 2, h / 2)
}

export function RankingBoardModel() {
  const site = KIOSKS.find(kiosk => kiosk.kind === 'photo')!
  return <group name="ranking-board-preview" position={[site.x, 0, site.z]} rotation={[0, site.yaw, 0]} scale={SETTINGS.rankingBoard.scale}
    userData={{ assetId: 'procedural/ranking-board', previewRole: 'ranking-board' }}>
    {entries.map(([kind, geometry]) => <mesh key={kind} geometry={geometry} dispose={null} castShadow={kind !== 'glow'} receiveShadow>
      <primitive object={kind === 'glow' ? lanternMaterial : flatMaterial} attach="material" dispose={null} />
    </mesh>)}
    <PropSign position={[0, 4.64, 1.08]} width={2.82} height={0.48} draw={drawTitle} />
    {columns.map((column, index) => <PropSign key={column.title} position={[column.x, 2.19, 0.265]}
      width={2.43} height={3.06} draw={panelDraws[index]!} />)}
  </group>
}
