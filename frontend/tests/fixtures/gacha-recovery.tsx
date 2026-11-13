// Local fixture: production UI/state with isolated HTTP, no real account or wallet.
import { createRoot } from 'react-dom/client'
import { GachaPanel } from '../../src/features/gacha/GachaPanel'
import { GachaBoxes } from '../../src/features/gacha/GachaBoxes'
import { useSession } from '../../src/network/worldClient'
import { parkRuntime } from '../../src/park/runtime/runtime'
import { RestError } from '../../src/network/restError'
import '../../src/styles.css'
import '../../src/features/wardrobe/wardrobe.css'
useSession.setState({ sessionId: '101', status: 'connected', roomId: 'fixture-channel' })
parkRuntime.requestJSON = async (path, init) => {
  const response = await fetch(path, init), value = await response.json()
  if (!response.ok) throw new RestError(response.status, value.code, value.message)
  return value
}
const machine = new URLSearchParams(location.search).has('machine')
createRoot(document.getElementById('root')!).render(machine ? <GachaPanel/> : <div className="wardrobe-shell" style={{padding:32,maxWidth:1000,margin:'40px auto',background:'#fff8e6'}}><h1>캡슐 보관함</h1><GachaBoxes/></div>)
