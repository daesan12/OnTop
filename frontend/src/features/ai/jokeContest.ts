import {create} from 'zustand'
import {rankingBoardTarget} from '../rankingBoard/model'
import {clearRoamingInput} from '../../world/inputOwnership'
export const JOKE_CONTEST_ENABLED=import.meta.env.DEV&&import.meta.env.VITE_AI_PARK==='true'
const [x,y,z]=rankingBoardTarget.reachPosition
export const jokeJudgePosition={x:x-4,y:y-.8,z}
export const useJokeContest=create<{open:boolean;tab:'submit'|'ranking'}>(()=>({open:false,tab:'submit'}))
export function openJokeContest(tab:'submit'|'ranking'='submit'){if(!JOKE_CONTEST_ENABLED)return;clearRoamingInput();useJokeContest.setState({open:true,tab})}
export const closeJokeContest=()=>useJokeContest.setState({open:false})
export function canReachJokeJudge(p:{x:number;y:number;z:number}){return JOKE_CONTEST_ENABLED&&Math.hypot(p.x-jokeJudgePosition.x,p.z-jokeJudgePosition.z)<=2.5&&Math.abs(p.y-(jokeJudgePosition.y+.8))<=1.6}
