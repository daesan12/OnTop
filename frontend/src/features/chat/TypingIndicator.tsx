import {useEffect,useState} from 'react'
import {useTyping} from './typingState'
import {useSession} from '../../network/worldClient'

export function TypingIndicator({userId}:{userId:string}) {
  const channel=useSession(s=>s.roomId)
  const until=useTyping(s=>s.channelId===channel?s.users[userId]??0:0)
  const [visible,setVisible]=useState(false)
  useEffect(()=>{
    const left=until-performance.now()
    setVisible(left>0)
    if(left<=0)return
    const timer=setTimeout(()=>setVisible(false),left)
    return()=>clearTimeout(timer)
  },[until])
  return visible?<div className="avatar-speech avatar-typing" role="status">입력 중<span aria-hidden="true">…</span></div>:null
}
