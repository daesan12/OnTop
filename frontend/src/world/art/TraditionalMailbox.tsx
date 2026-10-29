import { MAILBOX } from '../../config/parkPlan'
import { CraftedPropLod, PropSign } from './CraftedProp'
import { mailboxArt, mailboxTitle } from './mailboxGeometry'

/** Tiled-roof wooden letterbox; the original world anchor and collision identity are preserved. */
export function TraditionalMailbox() {
  return (
    <group
      name="feedback-mailbox"
      position={[MAILBOX.x, 0, MAILBOX.z]}
      userData={{
        assetId: 'user/red-mailbox',
        source: 'code/mailboxGeometry',
      }}
    >
      <group name="code-mailbox" scale={MAILBOX.height / 1.8}>
        <CraftedPropLod name="mailbox-craft" near={mailboxArt.near} far={mailboxArt.far} distance={18} heritage />
        <PropSign position={[0, 1.355, 0.298]} width={0.57} height={0.225} draw={mailboxTitle} transparent font={'700 32px "BusanDandiMyeongjo"'} />
      </group>
    </group>
  )
}
