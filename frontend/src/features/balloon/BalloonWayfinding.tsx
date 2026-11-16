import { STATION_STAIRS } from '../../../park-renewal-preview/plan'
import { groundSurfaceHeight } from '../../../park-renewal-preview/groundSurface'
import { PropSign } from '../../world/art/CraftedProp'
import { BALLOON_GATE_Z_OFFSET } from './wayfinding'

const green = '#173b30'
const gold = '#e3ba75'
const cream = '#fff1cd'
const timber = '#583c2a'
const signFont = '800 48px "Malgun Gothic", sans-serif'

function paintedBoard(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = green
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = gold
  ctx.lineWidth = h * .034
  ctx.strokeRect(h * .07, h * .07, w - h * .14, h * .86)
}

function wayfindingSign(ctx: CanvasRenderingContext2D, w: number, h: number) {
  paintedBoard(ctx, w, h)
  ctx.save()
  ctx.translate(w * .16, h * .48)
  ctx.fillStyle = gold
  ctx.beginPath()
  ctx.ellipse(0, -h * .09, h * .18, h * .22, 0, 0, 2 * Math.PI)
  ctx.fill()
  ctx.strokeStyle = cream
  ctx.lineWidth = h * .024
  ctx.beginPath()
  ctx.moveTo(-h * .09, h * .09)
  ctx.lineTo(-h * .045, h * .22)
  ctx.moveTo(h * .09, h * .09)
  ctx.lineTo(h * .045, h * .22)
  ctx.stroke()
  ctx.fillStyle = cream
  ctx.fillRect(-h * .058, h * .215, h * .116, h * .075)
  ctx.restore()

  ctx.fillStyle = cream
  ctx.font = `800 ${h * .36}px "Malgun Gothic", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('열기구 탑승', w * .5, h * .515, w * .51)
  ctx.fillStyle = gold
  ctx.save()
  ctx.translate(w * .845, h * .5)
  ctx.beginPath()
  ctx.moveTo(0, -h * .28)
  ctx.lineTo(h * .14, -h * .06)
  ctx.lineTo(h * .052, -h * .06)
  ctx.lineTo(h * .052, h * .27)
  ctx.lineTo(-h * .052, h * .27)
  ctx.lineTo(-h * .052, -h * .06)
  ctx.lineTo(-h * .14, -h * .06)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function boardingGateSign(ctx: CanvasRenderingContext2D, w: number, h: number) {
  paintedBoard(ctx, w, h)
  ctx.fillStyle = cream
  ctx.font = `800 ${h * .56}px "Malgun Gothic", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('탑승장', w / 2, h * .52)
}

function StairLantern({ position }: { position: [number, number, number] }) {
  return <group name="balloon-stair-lantern" position={position}>
    <mesh position-y={.13}>
      <boxGeometry args={[.46, .26, .46]} />
      <meshStandardMaterial color="#55483a" />
    </mesh>
    <mesh position-y={.46}>
      <boxGeometry args={[.29, .4, .29]} />
      <meshBasicMaterial color="#ffd494" toneMapped={false} />
    </mesh>
    <mesh position-y={.75} rotation-y={Math.PI / 4}>
      <coneGeometry args={[.32, .22, 4]} />
      <meshStandardMaterial color={green} />
    </mesh>
    <pointLight position={[0, .66, .07]} color="#ffc37e" intensity={7} distance={4} decay={2} />
  </group>
}

export function BalloonWayfinding({ x, y, z }: { x: number; y: number; z: number }) {
  const ground = (dx: number, dz: number) => groundSurfaceHeight(x + dx, z + dz) - y - .02
  const signX = -4.45, signZ = STATION_STAIRS.zBottom + 1.7
  const lampZ = STATION_STAIRS.zBottom + .18
  // This group is decorative. Movement continues to use the existing station colliders.
  return <group name="balloon-wayfinding">
    <group name="balloon-approach-sign" position={[signX, ground(signX, signZ), signZ]} rotation-y={.21}>
      {[-1.15, 1.15].map(post => <mesh key={post} position={[post, .86, 0]}>
        <boxGeometry args={[.16, 1.76, .16]} />
        <meshStandardMaterial color={timber} />
      </mesh>)}
      <mesh position-y={1.63}>
        <boxGeometry args={[3.44, 1.02, .17]} />
        <meshStandardMaterial color={timber} />
      </mesh>
      <PropSign width={3.32} height={.9} position={[0, 1.63, .087]} draw={wayfindingSign} font={signFont} />
    </group>
    {[-4.02, 4.02].map(lampX => <StairLantern key={lampX} position={[lampX, ground(lampX, lampZ), lampZ]} />)}
    <group name="balloon-boarding-gate" position={[0, STATION_STAIRS.top, BALLOON_GATE_Z_OFFSET]}>
      {[-2.24, 2.24].map(post => <mesh key={post} position={[post, 1.25, 0]}>
        <boxGeometry args={[.18, 2.5, .24]} />
        <meshStandardMaterial color={timber} />
      </mesh>)}
      <mesh position-y={2.52}>
        <boxGeometry args={[4.9, .18, .3]} />
        <meshStandardMaterial color={timber} />
      </mesh>
      <mesh position-y={2.52}>
        <boxGeometry args={[1.96, .66, .34]} />
        <meshStandardMaterial color={timber} />
      </mesh>
      <PropSign width={1.86} height={.57} position={[0, 2.52, .173]} draw={boardingGateSign} font={signFont} />
    </group>
  </group>
}
