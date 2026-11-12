import { useEffect, useState } from 'react'
import { useWorldAi } from './worldAi'
import {useChatScope} from '../chat/gameChat'

export function PolicePrivateNotice() {
  const notice=useWorldAi(s => s.privateNotice), [now,setNow]=useState(Date.now)
  const game=useChatScope()
  useEffect(() => {
    setNow(Date.now())
    if(!notice) return
    const timer=setTimeout(() => setNow(Date.now()),Math.max(0,notice.expiresAt-Date.now()))
    return () => clearTimeout(timer)
  },[notice])
  if(!notice || notice.expiresAt<=now || notice.gameId&&notice.gameId!==game) return null
  return <aside role="status" aria-label={notice.gameId?'경기 채팅 안내':'경찰 개인 안내'} style={{position:'fixed',right:16,top:notice.gameId?216:160,zIndex:70,
    maxWidth:340,padding:16,borderRadius:12,background:'#183b5e',color:'#fff',boxShadow:'0 4px 16px #0004'}}>
    <strong>{notice.gameId?'게임 채팅 · 나에게만 보이는 안내':'👮 한순경 · 나에게만 보이는 안내'}</strong><p>{notice.text}</p>
    <button onClick={() => useWorldAi.setState({privateNotice:null})}>확인</button>
  </aside>
}
