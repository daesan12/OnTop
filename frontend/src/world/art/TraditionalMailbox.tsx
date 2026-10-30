import { MAILBOX } from '../../config/parkPlan'
import { CraftedPropLod, PropSign } from './CraftedProp'
import { mailboxArt, mailboxTitle } from './mailboxGeometry'

/** Shared letterbox model; the current map supplies its placement, scale and facing. */
export function TraditionalMailbox({position=[MAILBOX.x,0,MAILBOX.z],scale=1,yaw=0}:{position?:[number,number,number];scale?:number;yaw?:number}={}) {
  return (
    <group
      name="feedback-mailbox"
      position={position}
      rotation={[0,yaw,0]}
      scale={scale}
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
