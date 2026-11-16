import { RENEWAL_PARK_ENABLED } from '../../park/mapSelection'

/** 로비에서 공원 코드를 먼저 준비하고, 경기에서는 같은 모듈을 재사용한다. */
export function loadStoneRumblePark() {
  return RENEWAL_PARK_ENABLED ? import('./StoneRumbleRenewalEnvironment') : import('./StoneRumbleLegacyEnvironment')
}
