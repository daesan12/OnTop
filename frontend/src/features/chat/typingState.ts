import { create } from 'zustand'
import { integer, record } from '../../network/protocol'

const initial=()=>({channelId:'',version:-1,users:{} as Record<string,number>})
export const useTyping = create(initial)
export const resetTyping=()=>useTyping.setState(initial(),true)

/** Only presence and a bounded lifetime are transmitted. Never store another user's draft. */
export function acceptTyping(value:Record<string,unknown>,channelId:string,now=performance.now()) {
  if(value.channelId!==channelId || !channelId)return
  if(!integer(value.version)||!Array.isArray(value.users)||value.users.length>1000
    ||value.users.some(x=>!record(x)||typeof x.userId!=='string'||!x.userId.trim()
      ||!integer(x.expiresInMs)||x.expiresInMs<1||x.expiresInMs>5000)
    ||new Set(value.users.map(x=>x.userId)).size!==value.users.length)
    throw new Error('입력 중 상태를 확인할 수 없습니다.')
  const before=useTyping.getState()
  if(before.channelId===channelId&&value.version<=before.version)return
  useTyping.setState({channelId,version:value.version,users:Object.fromEntries(value.users.map(x=>[x.userId,now+x.expiresInMs]))})
}
