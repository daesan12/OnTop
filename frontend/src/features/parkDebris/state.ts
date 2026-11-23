import {create} from 'zustand'
import {integer,record} from '../../network/protocol'

/** 판은 판 엎기 동작(EMOTE_TABLE_FLIP, world/art/socialGestureMotion의 flipKeys)에서 손이 판 아래에서
 * 위로 밀어 올리기 시작하는 순간(위로 퍼 올리는 키 1050→1450ms 구간 초반)에 떠난다. 캐릭터와 잔해는 둘 다
 * 같은 서버 occurredAt을 매 프레임 표본화하므로 FPS와 무관하게 맞는다. 동작 키가 바뀌면 단위 테스트가 잡는다.
 * 안착·연출 창은 원래 안무(발사 550, 안착 2750, 종료 2800)를 발사 시점과 함께 평행 이동한 값이다. */
export const DEBRIS_LAUNCH=1150,DEBRIS_SETTLE=DEBRIS_LAUNCH+2200,DEBRIS_DURATION=DEBRIS_SETTLE+50
export const DEBRIS_COINS=12,DEBRIS_STONES=5
export const DEBRIS_RETENTION=15_000
export function debrisPieces(code:ParkDebris['gameCode']) {
  if(code==='ALKKAGI')return []
  // 할리갈리 잔해는 서버(ParkDebrisStore)가 아직 동전만 보낸다. 카드 조각은 서버와 함께 정한다.
  if(code==='HALLI_GALLI'||code==='DAVINCI_CODE')return []
  const [prefix,count]=code==='OMOK'?['stone',5] as const:code==='ONE_CARD'?['card',14] as const
    :code==='LIAR_BRIDGE'?['pawn',6] as const:['die',code==='DICE_LEDGER'?5:6] as const
  return Array.from({length:count},(_,i)=>`${prefix}-${i}`)
}
export const debrisVisible=(item:ParkDebris,now:number)=>now>=Date.parse(item.occurredAt)&&now<Date.parse(item.occurredAt)+DEBRIS_RETENTION
export interface ParkDebris {
  id:string;gameId:string;tableId:string;anchorId:string;gameCode:'OMOK'|'DICE'|'ONE_CARD'|'LIAR_BRIDGE'|'DICE_LEDGER'|'ALKKAGI'|'HALLI_GALLI'|'DAVINCI_CODE'
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
      ||!['OMOK','DICE','ONE_CARD','LIAR_BRIDGE','DICE_LEDGER','ALKKAGI','HALLI_GALLI','DAVINCI_CODE'].includes(String(raw.gameCode))
      ||typeof raw.occurredAt!=='string'||!raw.occurredAt.endsWith('Z')||!Number.isFinite(Date.parse(raw.occurredAt))
      ||typeof raw.throwYaw!=='number'||!Number.isFinite(raw.throwYaw)||!integer(raw.seed)||raw.seed>0x7fffffff
      ||!Array.isArray(raw.parts)||raw.parts.length<1||raw.parts.length>13+debrisPieces(raw.gameCode as ParkDebris['gameCode']).length
      ||!raw.parts.every(p=>p==='board'||typeof p==='string'&&(/^coin-(?:[0-9]|1[01])$/.test(p)
        ||debrisPieces(raw.gameCode as ParkDebris['gameCode']).includes(p)))
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
