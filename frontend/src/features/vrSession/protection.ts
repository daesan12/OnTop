import { panelBlocksCarry } from '../../world/inputOwnership'

const holders = new Set<symbol>()
export const vrCarryProtection = { get active() { return holders.size > 0 } }
interface ProtectionPort { setInteractionBusy?(busy: boolean, confirm?: boolean): Promise<boolean> }

/** Acquire before rendering immersive play; server WORLD_INTERACTION_SET blocks pickup and throw. */
export async function acquireVRProtection(port: ProtectionPort): Promise<() => void> {
  const token = Symbol('immersive-play'); holders.add(token)
  const release = () => {
    if (!holders.delete(token)) return
    void port.setInteractionBusy?.(panelBlocksCarry(false))
  }
  try {
    if (!await port.setInteractionBusy?.(true, true)) throw new Error('VR 플레이 보호를 확인하지 못했어요. 공원 연결을 확인하고 다시 시작해 주세요.')
    return release
  } catch (error) { release(); throw error }
}
