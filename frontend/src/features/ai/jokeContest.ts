import {create} from 'zustand'
import {rankingBoardTarget} from '../rankingBoard/model'
import {clearRoamingInput} from '../../world/inputOwnership'
import {LOCAL_AI_FIXTURE,useAiFeatures} from './serviceFeatures'
export const jokeContestEnabled=()=>LOCAL_AI_FIXTURE||useAiFeatures.getState().jokeContest
export const jokeContestPath=(route:string)=>(LOCAL_AI_FIXTURE?'/local/ai/joke-contest/':'/api/v1/ai/joke-contest/')+route
const [x,y,z]=rankingBoardTarget.reachPosition
export const jokeJudgePosition={x:x-4,y:y-.8,z}
export const useJokeContest=create<{open:boolean;tab:'submit'|'ranking'}>(()=>({open:false,tab:'submit'}))
export function openJokeContest(tab:'submit'|'ranking'='submit'){if(!jokeContestEnabled())return;clearRoamingInput();useJokeContest.setState({open:true,tab})}
export const closeJokeContest=()=>useJokeContest.setState({open:false})
export function canReachJokeJudge(p:{x:number;y:number;z:number}){return jokeContestEnabled()&&Math.hypot(p.x-jokeJudgePosition.x,p.z-jokeJudgePosition.z)<=2.5&&Math.abs(p.y-(jokeJudgePosition.y+.8))<=1.6}
