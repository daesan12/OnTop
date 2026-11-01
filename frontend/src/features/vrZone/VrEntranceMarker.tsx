import { PropSign } from '../../world/art/CraftedProp'
import type { VrEntrance } from './anchors'

const ink = '#31544a', brass = '#ad9764'
const font = '700 32px "BusanDandiMyeongjo"'

/** Stone joints, small jade inlays and engraved lettering; no poster background. */
function drawVrInlay(c: CanvasRenderingContext2D, w: number, h: number) {
  c.clearRect(0, 0, w, h)
  c.save()
  c.translate(w / 2, h / 2)
  const point = (radius: number, angle: number) => [Math.cos(angle) * radius * w, Math.sin(angle) * radius * h] as const
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + i * Math.PI / 4, b = a + Math.PI / 4
    c.beginPath()
    for (const [n, [x, y]] of [point(.414, a), point(.497, a), point(.497, b), point(.414, b)].entries()) {
      if (n === 0) c.moveTo(x, y); else c.lineTo(x, y)
    }
    c.closePath(); c.fillStyle = i % 2 ? '#ede8d333' : '#878d7c1f'; c.fill()
    const start = point(.425, a), end = point(.495, a)
    c.beginPath(); c.moveTo(...start); c.lineTo(...end)
    c.strokeStyle = '#727b6d70'; c.lineWidth = w * .0025; c.stroke()
  }
  for (let i = 0; i < 4; i++) {
    const [x, y] = point(.438, i * Math.PI / 2)
    c.save(); c.translate(x, y); c.rotate(Math.PI / 4)
    c.fillStyle = ink; c.fillRect(-w * .012, -h * .012, w * .024, h * .024)
    c.restore()
  }
  c.restore()

  // A headset engraved into the centre makes the destination recognisable at a glance.
  c.save(); c.translate(w / 2, h * .34)
  c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = ink; c.lineWidth = w * .009
  c.beginPath(); c.roundRect(-w * .16, -h * .065, w * .32, h * .13, w * .025); c.stroke()
  for (const x of [-.097, .097]) {
    c.beginPath(); c.roundRect(w * (x - .044), -h * .032, w * .088, h * .06, w * .012); c.stroke()
  }
  c.beginPath(); c.moveTo(-w * .16, -h * .01); c.lineTo(-w * .19, -h * .01)
  c.moveTo(w * .16, -h * .01); c.lineTo(w * .19, -h * .01); c.stroke()
  c.strokeStyle = brass; c.lineWidth = w * .005
  c.beginPath(); c.moveTo(-w * .072, -h * .09); c.lineTo(w * .072, -h * .09); c.stroke()
  c.restore()

  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = ink
  c.font = `700 ${h * .087}px "BusanDandiMyeongjo","Batang",serif`
  c.fillText('VR 체험 시작', w / 2, h * .60, w * .66)
  c.fillStyle = '#626b58'; c.font = `500 ${h * .044}px "BusanDandiMyeongjo","Batang",serif`
  c.fillText('E · 게임 선택', w / 2, h * .71, w * .54)
  c.strokeStyle = brass; c.lineWidth = w * .003
  for (const direction of [-1, 1]) {
    c.beginPath(); c.moveTo(w * (.5 + direction * .04), h * .80)
    c.lineTo(w * (.5 + direction * .12), h * .80); c.stroke()
  }
  c.fillStyle = ink
  c.beginPath(); c.moveTo(w * .5, h * .775); c.lineTo(w * .52, h * .80)
  c.lineTo(w * .5, h * .825); c.lineTo(w * .48, h * .80); c.closePath(); c.fill()
}

/** Visual inlay only; the existing entrance position, reach and walking surface stay unchanged. */
export function VrEntranceMarker({ entrance }: { entrance: VrEntrance }) {
  return <group name="vr-entrance-marker" position={[entrance.x, .18, entrance.z]} rotation={[0, entrance.yaw, 0]} userData={{walkable:false}}>
    <mesh position={[0, -.004, 0]} rotation={[0, Math.PI / 8, 0]} receiveShadow>
      <cylinderGeometry args={[1.5, 1.5, .02, 8]} />
      <meshStandardMaterial color="#c9c4b0" roughness={1} />
    </mesh>
    <mesh position={[0, .008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[1.23, 1.25, 8, 1, Math.PI / 8]} />
      <meshStandardMaterial color={brass} roughness={.9} />
    </mesh>
    <PropSign position={[0, .012, 0]} rotation={[-Math.PI / 2, 0, 0]} width={3} height={3}
      draw={drawVrInlay} transparent font={font} />
  </group>
}
