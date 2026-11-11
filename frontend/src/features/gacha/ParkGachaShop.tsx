import { ExtrudeGeometry, Shape } from 'three'
import { PropSign } from '../../world/art/CraftedProp'
import { PropModel } from '../../world/art/PropModel'
import { PropBuilder } from '../../world/art/propGeometry'
import { PARK_DEFINITION, PARK_LAYOUT } from '../../map/park'
import { openConstructionNotice } from '../construction/model'

const { width, depth } = PARK_DEFINITION.kiosks.shop
const front = depth / 2
const shopArt = new PropBuilder()
shopArt.box('stone', '#a69a85', [0, .09, 0], [width, .18, depth])
shopArt.box('wood', '#655043', [0, 1.35, -.09], [width - .14, 2.42, depth - .18])
shopArt.box('wood', '#614134', [0, 2.55, 0], [width + .12, .16, depth + .13])
shopArt.box('wood', '#84634e', [0, 2.37, front - .06], [width - .16, .17, .14])
for (const side of [-1, 1]) {
  shopArt.box('wood', '#5a3828', [side * (width / 2 - .15), 1.34, front - .08], [.17, 2.3, .16])
  shopArt.box('paint', '#d7bc88', [side * 1.06, 1.34, front - .16], [.84, 1.21, .041])
  for (const x of [-.39, -.20, 0, .20, .39]) {
    shopArt.box('wood', '#7b4d37', [side * 1.06 + x, 1.34, front - .125], [.035, 1.2, .032])
  }
  for (const y of [.75, 1.12, 1.52, 1.93]) {
    shopArt.box('wood', '#7b4d37', [side * 1.06, y, front - .124], [.81, .04, .032])
  }
  shopArt.cylinder('gold', '#9d774d', [side * 1.52, 2.26, front - .11], .016, .016, .18)
  shopArt.box('glow', '#ffe0a5', [side * 1.52, 2.08, front - .11], [.21, .24, .17])
  for (const y of [1.95, 2.21]) {
    shopArt.box('wood', '#653a26', [side * 1.52, y, front - .11], [.235, .034, .20])
  }
}
shopArt.box('wood', '#744635', [0, 2.35, front + .015], [1.44, .25, .08])

const roof = new Shape()
const halfRoof = width / 2 + .21, roofDepth = depth + .42, eave = 2.62
const roofHeight = (t: number) => .12 + .52 * (1 - Math.abs(t)) ** 1.7 + .055 * t ** 8
roof.moveTo(-halfRoof, 0)
for (let i = -10; i <= 10; i++) {
  const t = i / 10
  roof.lineTo(t * halfRoof, roofHeight(t))
}
roof.lineTo(halfRoof, 0)
roof.closePath()
shopArt.add('tile', new ExtrudeGeometry(roof, { depth: roofDepth, bevelEnabled: false }), '#334b50',
  [0, eave, -roofDepth / 2])
for (let i = -10; i <= 10; i++) {
  const t = i / 10
  shopArt.cylinder('tile', '#475e5e', [t * halfRoof, eave + roofHeight(t), 0], .026, .026,
    roofDepth + .04, [Math.PI / 2, 0, 0], 8)
}
const building = shopArt.finish()

const cabinet = new PropBuilder()
cabinet.box('wood', '#503329', [0, 1.02, .02], [1.02, 1.94, .09])
cabinet.box('wood', '#7f352b', [0, .5, .09], [.94, .9, .19])
cabinet.box('wood', '#2c4640', [0, 1.43, .076], [.88, .85, .025])
cabinet.box('wood', '#1c2b2a', [0, .13, .06], [1.08, .19, .26])
for (const x of [-.48, .48]) {
  cabinet.box('wood', '#6b4736', [x, 1.12, .064], [.09, 1.96, .21])
  cabinet.box('gold', '#d3a35e', [x * .84, 1.42, .134], [.035, .79, .045])
}
for (const y of [.96, 1.05, 1.81]) {
  cabinet.box('gold', '#d3a35e', [0, y, .142], [.85, .035, .048])
}
// Short eaves, gold window trim and a recessed capsule outlet.
cabinet.box('wood', '#572d26', [0, 2, .059], [1.08, .15, .29])
cabinet.box('wood', '#572d26', [0, 1.915, .157], [.87, .169, .102])
cabinet.box('tile', '#24413c', [0, 2.105, .049], [1.16, .08, .34], [.13, 0, 0])
for (let i = -6; i <= 6; i++) {
  cabinet.cylinder('tile', '#304c46', [i * .088, 2.143, .049], .034, .034, .334, [Math.PI / 2 + .13, 0, 0], 8)
}
cabinet.box('gold', '#b2834b', [0, .45, .181], [.37, .23, .023])
cabinet.box('wood', '#271f1b', [0, .46, .196], [.31, .16, .023])
cabinet.box('wood', '#a44a34', [0, .38, .199], [.31, .03, .04])
cabinet.box('gold', '#d3a35e', [.28, .71, .183], [.18, .105, .025])
cabinet.box('wood', '#332822', [.28, .71, .2], [.1, .021, .01])

const capsules = [
  [-.28, 1.18, '#b4443f'], [-.09, 1.19, '#d4a64f'], [.11, 1.18, '#5479b6'], [.29, 1.18, '#679663'],
  [-.20, 1.34, '#678aab'], [.02, 1.35, '#bd6766'], [.21, 1.34, '#8a6eac'],
  [-.09, 1.5, '#638e64'], [.12, 1.5, '#bf9042'],
] as const
for (const [x, y, color] of capsules) {
  cabinet.ball('paint', color, [x, y, .122], [.092, .092, .049])
  cabinet.cylinder('gold', '#d9b977', [x, y - .012, .12], .093, .093, .014, [0, 0, 0], 12)
}
const art = cabinet.finish()

function gachaSign(context: CanvasRenderingContext2D, width: number, height: number) {
  context.fillStyle = '#28463d'
  context.fillRect(0, 0, width, height)
  context.strokeStyle = '#ddb577'
  context.lineWidth = height * .06
  context.strokeRect(width * .02, height * .09, width * .96, height * .82)
  context.fillStyle = '#fff2cc'
  context.font = `700 ${height * .52}px "Malgun Gothic", sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText('의상 뽑기', width / 2, height * .52, width * .88)
}

export function ParkGachaShop({ live }: { live: boolean }) {
  const shop = PARK_LAYOUT.KIOSKS.find(kiosk => kiosk.kind === 'shop')
  if (!shop) return null
  return <group name="park-gacha-shop" position={[shop.x, 0, shop.z]}
    rotation={[0, shop.yaw, 0]} onClick={event => {
      if (event.delta >= 5) return
      event.stopPropagation()
      if (!live) {
        openConstructionNotice('layout-shop')
        return
      }
      void import('../interactions/parkInteraction').then(({ getParkInteraction, interactWithPark }) => {
        if (getParkInteraction()?.id === 'layout-shop') interactWithPark()
      })
    }}>
    <PropModel art={building} name="park-gacha-shop-building" />
    <PropSign position={[0, 2.35, front + .058]} width={1.38} height={.21} draw={gachaSign} />
    <group name="park-gacha-machine" position={[0, .10, front - .15]}>
      <PropModel art={art} name="park-gacha-cabinet" shadow={false} />
      <mesh name="park-gacha-glass" position={[0, 1.43, .218]} renderOrder={2}>
        <planeGeometry args={[.77, .74]} />
        <meshBasicMaterial color="#c2e4dc" transparent opacity={.16} depthWrite={false} />
      </mesh>
    </group>
  </group>
}
