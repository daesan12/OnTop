import { useEffect } from 'react'
import { useSession } from '../../network/worldClient'
import { refreshGacha, resetGacha, useGacha } from './state'

export function GachaLifecycle() {
  const owner=useSession(s=>s.sessionId),connected=useSession(s=>s.status==='connected')
  useEffect(()=>{
    resetGacha()
    if(connected&&owner)void refreshGacha()
  },[owner,connected])
  useEffect(()=>{
    const refresh=()=>{const state=useGacha.getState();if(connected&&state.owner===owner&&state.state)void refreshGacha()}
    window.addEventListener('ontop:gacha-inventory-changed',refresh)
    window.addEventListener('ontop:notifications-changed',refresh)
    return()=>{window.removeEventListener('ontop:gacha-inventory-changed',refresh);window.removeEventListener('ontop:notifications-changed',refresh)}
  },[owner,connected])
  return null
}
