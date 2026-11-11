import { PropSign } from '../../world/art/CraftedProp'
import { PropModel } from '../../world/art/PropModel'
import { PropBuilder } from '../../world/art/propGeometry'
import { PARK_GACHA_MACHINE } from './parkMachinePlacement'

const cabinet = new PropBuilder()
cabinet.box('wood', '#503329', [0, 1.02, -.16], [1.02, 1.94, .45])
cabinet.box('wood', '#7f352b', [0, .5, .09], [.94, .9, .19])
cabinet.box('wood', '#2c4640', [0, 1.43, .076], [.88, .85, .025])
cabinet.box('wood', '#1c2b2a', [0, .11, -.105], [1.08, .20, .59])
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
cabinet.box('tile', '#24413c', [0, 2.105, -.15], [1.16, .08, .74], [.05, 0, 0])
for (let i = -6; i <= 6; i++) {
  cabinet.cylinder('tile', '#304c46', [i * .088, 2.143, -.15], .034, .034, .74, [Math.PI / 2 + .05, 0, 0], 8)
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

export function ParkGachaMachine({ live }: { live: boolean }) {
  const { id, x, z, yaw } = PARK_GACHA_MACHINE
  return <group name="park-gacha-machine" position={[x, 0, z]}
    rotation={[0, yaw, 0]} onClick={live ? event => {
      if (event.delta >= 5) return
      event.stopPropagation()
      void import('../interactions/parkInteraction').then(({ interactWithPark }) => {
        interactWithPark(id)
      })
    } : undefined}>
    <PropModel art={art} name="park-gacha-cabinet" shadow={false} />
    <PropSign position={[0, 1.915, .211]} width={.83} height={.145} draw={gachaSign} />
    <mesh name="park-gacha-glass" position={[0, 1.43, .218]} renderOrder={2}>
      <planeGeometry args={[.77, .74]} />
      <meshBasicMaterial color="#c2e4dc" transparent opacity={.16} depthWrite={false} />
    </mesh>
  </group>
}
