import {parkRuntime} from '../../src/park/runtime/runtime'
import {useSession} from '../../src/network/worldClient'
export function useParkRuntime(){return {...parkRuntime,leaveTable:async()=>{useSession.setState({tableId:'',seatIndex:-1});return {ok:true}}}}
