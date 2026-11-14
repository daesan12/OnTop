import { create } from 'zustand'
import {validAmbient,type AmbientSpeech} from './ambientSpeech'
export type CompanionActor={ambient?:AmbientSpeech|null;id:string;channelId:string;name:string;role:string;persona?:string;difficulty?:string;tableId?:string;seatNumber?:number;observingGameId?:string;x:number;y:number;z:number;moving:boolean;seated:boolean;yaw?:number;action?:string;utilities?:Record<string,number>}
export type Practice={lastMove?:{x:number;y:number;stone:'BLACK'|'WHITE'}|null;snapshot:{gameId:string;tableId:string;version:number;blackUserId:number;whiteUserId:number;turnUserId:number|null;winnerUserId:number|null;turnDeadline:string|null;endedAt:string|null;endReason:string|null;board:{board:number[][];moveCount:number;outcome:string;forbiddenMoves:{x:number;y:number;kind?:string}[]}},npcUserId:string;actorId?:string;phase?:'ARRIVING'|'PLAYING';name:string;difficulty:string;bet:number;thinking:boolean;speech:string;speechSource:string;analysis:{source:string;blackEstimate:number|null;advantage:string};analysisNote:string}
export type CompanionState={actors:CompanionActor[];practice:Practice|null;finishedPractice?:Practice|null;observedPractice?:Practice|null;practicePending:boolean;practiceError:string;practiceChat?:{gameId:string;version:number;role:'PLAYER'|'SPECTATOR'}|null;waitSeconds:number;autoPaused:boolean;reply:string;replySource?:string;error?:string;engine:string;mode:string;commentary:{gameId:string;tableId:string;version:number;name?:string;speech:string;source:string;evaluation:string}[]}
export const useCompanions=create<CompanionState&{receivedAt:number;actorReceivedAt:number}>(()=>({actors:[],practice:null,finishedPractice:null,observedPractice:null,practiceChat:null,practicePending:false,practiceError:'',waitSeconds:-1,autoPaused:false,reply:'',engine:'',mode:'',commentary:[],receivedAt:0,actorReceivedAt:0}))
let actorVersion=-1
const MAX_COMPANION_ACTORS=64 // Three roamers plus independent opponents at occupied tables.
export function resetCompanionActors(){actorVersion=-1;useCompanions.setState({actors:[],actorReceivedAt:0})}
export function resetCompanions(){actorVersion=-1;useCompanions.setState(useCompanions.getInitialState(),true)}
export function acceptCompanionActors(p:Record<string,unknown>){
 if(!Number.isSafeInteger(p.version)||Number(p.version)<=actorVersion||!Array.isArray(p.actors)||p.actors.length>MAX_COMPANION_ACTORS)return false
 if(!p.actors.every((n:CompanionActor)=>n&&typeof n.id==='string'&&typeof n.name==='string'&&[n.x,n.y,n.z,n.yaw??0].every(Number.isFinite)&&typeof n.moving==='boolean'&&typeof n.seated==='boolean'&&validAmbient(n.ambient)))return false
 actorVersion=Number(p.version);useCompanions.setState({actors:p.actors as CompanionActor[],actorReceivedAt:performance.now()});return true
}
export function acceptCompanions(raw:unknown) {
  if(!raw||typeof raw!=='object')return false
  const s=raw as CompanionState
  if(!Array.isArray(s.actors)||s.actors.length>MAX_COMPANION_ACTORS||!s.actors.every(n=>typeof n.id==='string'&&typeof n.name==='string'&&[n.x,n.y,n.z].every(Number.isFinite)))return false
  for(const practice of [s.practice,s.observedPractice])if(practice && (!practice.snapshot||!Array.isArray(practice.snapshot.board?.board)||practice.snapshot.board.board.length!==15||practice.snapshot.board.board.some(row=>!Array.isArray(row)||row.length!==15||row.some(v=>![0,1,2].includes(v)))))return false
  const {actors:_,...rest}=s
  const changed=useCompanions.getState().practice?.snapshot.gameId!==s.practice?.snapshot.gameId
  const previous=useCompanions.getState().finishedPractice
  const finishedPractice=s.practice?.snapshot.endedAt?s.practice:s.practice?null:previous
  useCompanions.setState({...rest,finishedPractice,...(changed?{practiceError:''}:{}),receivedAt:performance.now()})
  acceptCompanionActors({version:(raw as Record<string,unknown>).actorVersion,actors:s.actors})
  return true
}
