import {create} from 'zustand'
import {MIX_DURATION_MS} from './gachaMixTiming'

export type GachaMixCue={id:number;startedAt:number;grade:number;instant:boolean}
export const useGachaMixCue=create(()=>({cue:null as GachaMixCue|null,running:false}))
let serial=0,timer:ReturnType<typeof setTimeout>|undefined
/** A local visual cue only. The caller must confirm the receipt before starting it. */
export function startGachaMix(grade:number,instant=false):GachaMixCue|null{
 if(useGachaMixCue.getState().running)return null
 const cue={id:++serial,startedAt:performance.now(),grade,instant}
 useGachaMixCue.setState({cue,running:!instant})
 clearTimeout(timer)
 if(!instant)timer=setTimeout(()=>finishGachaMix(cue.id),MIX_DURATION_MS)
 return cue
}
export function finishGachaMix(id:number){
 const {cue}=useGachaMixCue.getState()
 if(!cue||cue.id!==id)return
 clearTimeout(timer)
 useGachaMixCue.setState({cue:{...cue,instant:true},running:false})
}
export function cueAge(cue:GachaMixCue|null,now=performance.now()){
 return cue?cue.instant?MIX_DURATION_MS:Math.min(MIX_DURATION_MS,Math.max(0,now-cue.startedAt)):-1
}
