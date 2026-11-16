import { PropSign } from '../../../../src/world/art/CraftedProp.tsx'
import { LED_SHAPES } from '../../../../src/features/rpsRoulette/ledHands.ts'
import { ROULETTE } from '../../../../src/features/rpsRoulette/protocol.ts'

/** 3D 정면 판. 대기 화면만 그린다(주변 관전 방송은 맵 확정 후 후속 작업). */
function rpsCabinetFace(c: CanvasRenderingContext2D, w: number, h: number) {
  const s = w / 400
  c.fillStyle = '#1f3fae'; c.fillRect(0, 0, w, h)
  c.strokeStyle = '#f2f2f2'; c.lineWidth = 8 * s; c.strokeRect(4 * s, 4 * s, w - 8 * s, h - 8 * s)
  c.textAlign = 'center'; c.textBaseline = 'middle'
  c.font = `800 ${32 * s}px "Malgun Gothic",sans-serif`; c.lineWidth = 6 * s; c.strokeStyle = '#b3121c'
  c.strokeText('가위바위보 룰렛', w / 2, 44 * s); c.fillStyle = '#ffd23f'; c.fillText('가위바위보 룰렛', w / 2, 44 * s)
  const cx = w / 2, cy = 250 * s, step = Math.PI * 2 / ROULETTE.length
  c.beginPath()
  for (let i = 0; i < ROULETTE.length * 2; i++) {
    const a = i * step / 2 - Math.PI / 2, r = (i % 2 ? 150 : 172) * s
    c.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
  }
  c.closePath(); c.fillStyle = '#ffd23f'; c.fill()
  c.font = `800 ${18 * s}px "Malgun Gothic",sans-serif`
  ROULETTE.forEach((value, i) => {
    const a = i * step - Math.PI / 2
    c.beginPath(); c.arc(cx, cy, 146 * s, a - step / 2, a + step / 2); c.arc(cx, cy, 96 * s, a + step / 2, a - step / 2, true); c.closePath()
    c.fillStyle = value === 10 ? '#ffd23f' : i % 2 ? '#7aa33a' : '#f7a8b8'; c.fill()
    c.strokeStyle = '#ffffff'; c.lineWidth = 2 * s; c.stroke()
    c.save(); c.translate(cx + Math.cos(a) * 121 * s, cy + Math.sin(a) * 121 * s); c.rotate(a + Math.PI / 2)
    c.fillStyle = '#c4121c'; c.fillText(String(value), 0, 0); c.restore()
  })
  c.beginPath(); c.arc(cx, cy, 92 * s, 0, Math.PI * 2); c.fillStyle = '#2a0404'; c.fill()
  c.strokeStyle = '#ffd23f'; c.lineWidth = 4 * s; c.stroke()
  c.save(); c.translate(cx - 92 * s, cy - 92 * s); c.scale(.92 * s, .92 * s)
  c.strokeStyle = '#ff4a3d'; c.lineWidth = 5; c.lineCap = 'round'; c.setLineDash([0, 7])
  c.stroke(new Path2D(LED_SHAPES.COIN.outline)); c.restore()
}

/** Shared visual asset. Placement and live interaction belong to the owning scene. */
export function RpsRouletteCabinetModel(){
  return <group name="rps-roulette-cabinet-model">
    <mesh position={[0, .45, -.05]} castShadow receiveShadow><boxGeometry args={[.92, .9, .7]} /><meshStandardMaterial color="#151515" roughness={.6} /></mesh>
    <mesh position={[0, 1.42, -.12]} castShadow><boxGeometry args={[.92, 1.06, .56]} /><meshStandardMaterial color="#151515" roughness={.6} /></mesh>
    <mesh position={[0, 1.98, -.08]} castShadow><boxGeometry args={[.98, .08, .66]} /><meshStandardMaterial color="#1e1e1e" roughness={.5} /></mesh>
    {[-.47, .47].map(x => <mesh key={x} position={[x, 1.05, .16]}><boxGeometry args={[.025, 1.9, .025]} /><meshStandardMaterial color="#ececec" /></mesh>)}
    <PropSign position={[0, 1.44, .165]} width={.8} height={.88} draw={rpsCabinetFace} />
    <mesh position={[0, .93, .2]} rotation={[-.35, 0, 0]} castShadow><boxGeometry args={[.9, .08, .36]} /><meshStandardMaterial color="#3a0b0b" roughness={.55} /></mesh>
    {[-.24, 0, .24].map(x => <mesh key={x} position={[x, 1.04, .32]} rotation={[-.35, 0, 0]}>
      <cylinderGeometry args={[.065, .07, .05, 20]} /><meshStandardMaterial color="#f4f4f4" roughness={.35} />
    </mesh>)}
  </group>
}
