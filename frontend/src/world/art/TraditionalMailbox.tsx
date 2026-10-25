import { MAILBOX } from '../../config/parkPlan'
import { CraftedPropLod, PropSign } from './CraftedProp'
import { mailboxArt, mailboxNote, mailboxTitle } from './mailboxGeometry'

/** Procedural red enamel letterbox. Preserve the original world anchor and feedback identity. */
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
        <CraftedPropLod name="mailbox-craft" near={mailboxArt.near} far={mailboxArt.far} distance={18} />
        <PropSign position={[0, 1.555, 0.321]} width={0.628} height={0.195} draw={mailboxTitle} />
        <PropSign position={[0, 0.52, 0.347]} width={0.375} height={0.065} draw={mailboxNote} />
      </group>
    </group>
  )
}
