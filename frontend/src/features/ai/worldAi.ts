import { filterChat } from '../chat/filterChat'
import { create } from 'zustand'
import { resetCompanionActors } from './companions'
import {validAmbient,type AmbientSpeech} from './ambientSpeech'

export type PoliceNotice = { incidentId: string; name: string; x: number; y: number; z: number; speech: string; expiresAt: number; actor:string; bubbleUntil:number;gameId?:string }
export type PatrolNpc = {id:string;name:string;action:string;x:number;y:number;z:number;yaw:number;moving:boolean;warp?:number;ambient?:AmbientSpeech|null}
export const useWorldAi = create<{ police: PoliceNotice[]; npcs:PatrolNpc[]; npcReceivedAt:number; privateNotice:{text:string;expiresAt:number;gameId?:string}|null }>(() => ({ police: [],npcs:[],npcReceivedAt:0,privateNotice:null }))
let npcVersion=-1
export function resetWorldAi() { npcVersion=-1; resetCompanionActors(); useWorldAi.setState({ police: [],npcs:[],npcReceivedAt:0,privateNotice:null }) }
export function acceptPrivateNotice(p:Record<string,unknown>) {
  if(typeof p.text!=='string' || p.text.length>400 || typeof p.expiresAt!=='number' || !Number.isFinite(p.expiresAt)
    || p.expiresAt<=Date.now() || p.expiresAt>Date.now()+60_000
    || p.gameId!==undefined&&(typeof p.gameId!=='string'||p.gameId.length>200)) return false
  useWorldAi.setState({privateNotice:p.text?{text:p.text,expiresAt:p.expiresAt,...(typeof p.gameId==='string'?{gameId:p.gameId}:{})}:null}); return true
}
export function acceptPatrol(p:Record<string,unknown>) {
  if(typeof p.version!=='number' || !Number.isSafeInteger(p.version) || p.version<=npcVersion
    || !Array.isArray(p.npcs) || p.npcs.length>8) return false
  const npcs:PatrolNpc[]=[]
  for(const value of p.npcs) {
    if(!value || typeof value!=='object') return false
    const n=value as PatrolNpc
    if(typeof n.id!=='string' || typeof n.name!=='string' || n.name.length>40 || typeof n.moving!=='boolean'
      || !['PATROL','REST','RESPOND','TALK','WAITING_POSITION','WAITING_PATH','WAITING_TELEPORT','TELEPORT_WARNING','RETURN','RETURN_JUMP','RETURN_WAIT'].includes(n.action)
      || (n.warp!==undefined && (!Number.isSafeInteger(n.warp) || n.warp<0)) || !validAmbient(n.ambient)
      || ![n.x,n.y,n.z,n.yaw].every(v => typeof v==='number' && Number.isFinite(v) && Math.abs(v)<1000)) return false
    if(npcs.some(p => p.id===n.id)) return false
    npcs.push(n)
  }
  npcVersion=p.version; useWorldAi.setState({npcs,npcReceivedAt:performance.now()}); return true
}
export function npcSpeech(notices:PoliceNotice[],actor:PoliceNotice['actor'],now=Date.now()) {
  for(let i=notices.length-1;i>=0;i--){const n=notices[i]!;if(n.actor===actor&&n.bubbleUntil>now)return n}
}
export function acceptPolice(p: Record<string, unknown>,actor:PoliceNotice['actor']='police') {
  if (typeof p.incidentId !== 'string' || typeof p.name !== 'string' || typeof p.speech !== 'string'
    || p.name.length > 40 || p.speech.length > 400
    || ![p.x,p.y,p.z,p.expiresAt].every(v => typeof v === 'number' && Number.isFinite(v))) return false
  const police = {...p,speech:filterChat(p.speech),actor,bubbleUntil:Math.min(Number(p.expiresAt),Date.now()+10_000)} as PoliceNotice
  if (police.expiresAt <= Date.now() || police.expiresAt > Date.now()+60_000) return false
  useWorldAi.setState(s => {
    const previous=s.police.find(n=>n.actor===actor&&n.incidentId===police.incidentId)
    if(previous)police.bubbleUntil=previous.bubbleUntil
    return {police:[...s.police.filter(n=>n.expiresAt>Date.now()&&!(n.actor===actor&&n.incidentId===police.incidentId)),police].slice(-8)}
  })
  return true
}
