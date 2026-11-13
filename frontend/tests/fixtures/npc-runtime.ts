import {parkRuntime} from '../../src/park/runtime/runtime'
import {useSession} from '../../src/network/worldClient'
export function useParkRuntime(){return {...parkRuntime,leaveTable:async()=>{
 const response=await fetch('/fixture/table-leave',{method:'POST'})
 if(!response.ok)return false
 useSession.setState({tableId:'',seatIndex:-1});return true
}}}
