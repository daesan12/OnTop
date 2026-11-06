import { useSession } from '../../network/worldClient'
import { refreshMole } from '../mole/store'
import { refreshWalletAfterSettlement } from '../wallet/settlementRefresh'
import { speedMoleService, type SpeedMoleTap } from './service'

/** A closed result panel must not discard an own, confirmed reward's wallet refresh. */
export async function settleSpeedMole(id: string, taps: readonly SpeedMoleTap[], owner: string) {
  const result = await speedMoleService.complete(id, taps)
  if (owner && useSession.getState().sessionId === owner) {
    if (result.reward > 0) refreshWalletAfterSettlement(owner, `mole:reward:speed:${result.id}`)
    void refreshMole()
  }
  return result
}
