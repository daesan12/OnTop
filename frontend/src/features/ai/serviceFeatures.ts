import {create} from 'zustand'
import {resetCompanions} from './companions'
export const LOCAL_AI_FIXTURE=import.meta.env.DEV&&import.meta.env.VITE_AI_PARK==='true'
export const useAiFeatures=create<{companions:boolean;jokeContest:boolean;loaded:boolean}>(()=>({companions:false,jokeContest:false,loaded:false}))
export function resetAiFeatures(){resetCompanions();useAiFeatures.setState({companions:false,jokeContest:false,loaded:false})}
export function acceptAiFeatures(raw:unknown){
 if(!raw||typeof raw!=='object')return false
 const value=raw as Record<string,unknown>
 if(typeof value.companions!=='boolean'||typeof value.jokeContest!=='boolean')return false
 if(!value.companions)resetCompanions()
 useAiFeatures.setState({companions:value.companions,jokeContest:value.jokeContest,loaded:true});return true
}
export const residentsEnabled=()=>LOCAL_AI_FIXTURE||useAiFeatures.getState().companions
export const companionPath=(route:string)=>(LOCAL_AI_FIXTURE?'/local/ai/companions/':'/api/v1/ai/companions/')+route
