// Test-only entry: real presentation/state, isolated HTTP and event transport. No actual wallet.
import { createRoot } from 'react-dom/client'
import { GachaLifecycle, GachaPanel } from '../../src/features/gacha/GachaPanel'
import { acceptGacha } from '../../src/features/gacha/events'
import { useSession } from '../../src/network/worldClient'
import { parkRuntime } from '../../src/park/runtime/runtime'
import { RestError } from '../../src/network/restError'
import '../../src/styles.css'
useSession.setState({ sessionId: '101', status: 'connected', roomId: 'fixture-channel' })
parkRuntime.requestJSON = async (path, init) => {
  const response = await fetch(path, init), value = await response.json()
  if (!response.ok) throw new RestError(response.status, value.code, value.message)
  return value
}
window.addEventListener('qa:gacha-event', event => acceptGacha((event as CustomEvent).detail))
window.addEventListener('qa:connection', event => useSession.setState({ status: (event as CustomEvent<boolean>).detail ? 'connected' : 'reconnecting' }))
createRoot(document.getElementById('root')!).render(<><GachaLifecycle/><GachaPanel/></>)
