import { lazy, memo } from 'react'
import { RENEWAL_PARK_ENABLED } from '../../park/mapSelection'

const Park = RENEWAL_PARK_ENABLED
  ? lazy(() => import('./StoneRumbleRenewalEnvironment'))
  : lazy(() => import('./StoneRumbleLegacyEnvironment'))

export const StoneRumbleEnvironment = memo(function StoneRumbleEnvironment() {
  return <Park />
})
