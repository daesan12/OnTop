import {create} from 'zustand'
import {integer,record} from '../../network/protocol'

export const DEBRIS_DURATION=2800,DEBRIS_LAUNCH=550,DEBRIS_COINS=12,DEBRIS_STONES=5
export interface ParkDebris {
  id:string;gameId:string;tableId:string;anchorId:string;gameCode:'OMOK'|'DICE'|'ONE_CARD'|'LIAR_BRIDGE'|'DICE_LEDGER'|'ALKKAGI'
  userId:string;occurredAt:string;throwYaw:number;seed:number;parts:string[]
}
export interface ParkDebrisState {channelId:string;mapVersion:string;version:number;items:ParkDebris[]}
export function parseParkDebris(value:unknown):ParkDebrisState {
  const id=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=128
  if(!record(value)||!id(value.channelId)||!id(value.mapVersion)||!integer(value.version)
    ||!Array.isArray(value.items)||value.items.length>64)throw new Error('공원 물체 상태를 확인할 수 없습니다.')
  const ids=new Set<string>()
  const items=value.items.map(raw=>{
    if(!record(raw)||!['id','gameId','tableId','anchorId','userId'].every(k=>id(raw[k]))
      ||!['OMOK','DICE','ONE_CARD','LIAR_BRIDGE','DICE_LEDGER','ALKKAGI'].includes(String(raw.gameCode))
      ||typeof raw.occurredAt!=='string'||!raw.occurredAt.endsWith('Z')||!Number.isFinite(Date.parse(raw.occurredAt))
      ||typeof raw.throwYaw!=='number'||!Number.isFinite(raw.throwYaw)||!integer(raw.seed)||raw.seed>0x7fffffff
      ||!Array.isArray(raw.parts)||raw.parts.length<1||raw.parts.length>(raw.gameCode==='OMOK'?18:13)
      ||!raw.parts.every(p=>p==='board'||typeof p==='string'&&(/^coin-(?:[0-9]|1[01])$/.test(p)
        ||raw.gameCode==='OMOK'&&/^stone-[0-4]$/.test(p)))
      ||new Set(raw.parts).size!==raw.parts.length||ids.has(String(raw.id)))throw new Error('공원 물체 형식을 확인할 수 없습니다.')
    ids.add(String(raw.id))
    return {id:String(raw.id),gameId:String(raw.gameId),tableId:String(raw.tableId),anchorId:String(raw.anchorId),
      userId:String(raw.userId),gameCode:raw.gameCode as ParkDebris['gameCode'],occurredAt:raw.occurredAt,
      throwYaw:raw.throwYaw,seed:raw.seed,parts:[...raw.parts] as string[]}
  })
  return {channelId:value.channelId,mapVersion:value.mapVersion,version:value.version,items}
}
const initial=()=>({channelId:'',version:-1,items:[] as ParkDebris[]})
export const useParkDebris=create(initial)
export const resetParkDebris=()=>useParkDebris.setState(initial(),true)
export function acceptParkDebris(state:ParkDebrisState) {
  const before=useParkDebris.getState()
  if(before.channelId===state.channelId&&state.version<=before.version)return false
  useParkDebris.setState({channelId:state.channelId,version:state.version,items:state.items})
  return true
}
export function activeParkDebris(tableId:string,now:number) {
  const items=useParkDebris.getState().items
  for(let i=items.length-1;i>=0;i--){const item=items[i]!,age=now-Date.parse(item.occurredAt)
    if(item.tableId===tableId&&item.parts.includes('board')&&age>=0&&age<DEBRIS_DURATION)return item}
  return null
}
