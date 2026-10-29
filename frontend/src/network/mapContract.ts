import { EXPECTED_MAP_VERSION } from '../park/mapConfig'
import { GENERATED_PARK_ENABLED } from '../park/mapSelection'
import { PARK_MAP_SCHEMA_VERSION,PARK_MAP_ID } from '../map/park/generated/mapVersion'

export interface MapIdentity {mapId:string;schemaVersion:number;mapVersion:string}
export const LIVE_MAP_IDENTITY:Readonly<MapIdentity>=Object.freeze({mapId:PARK_MAP_ID,schemaVersion:GENERATED_PARK_ENABLED?PARK_MAP_SCHEMA_VERSION:1,mapVersion:EXPECTED_MAP_VERSION})
export const MAP_UPDATE_MESSAGE='공원 맵 버전이 변경되어 입장을 중단했습니다. 페이지를 새로고침한 뒤 다시 연결해주세요.'
export function parseMapIdentity(value:unknown):MapIdentity {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('서버 맵 정보를 확인할 수 없습니다.')
  const v=value as Record<string,unknown>
  if(typeof v.mapId!=='string'||!v.mapId.trim()||typeof v.schemaVersion!=='number'||!Number.isSafeInteger(v.schemaVersion)||v.schemaVersion<1||typeof v.mapVersion!=='string'||!(/^[a-f0-9]{64}$/).test(v.mapVersion))throw new Error('서버 맵 정보를 확인할 수 없습니다.')
  return {mapId:v.mapId,schemaVersion:v.schemaVersion,mapVersion:v.mapVersion}
}
export const sameMap=(a:MapIdentity,b:MapIdentity)=>a.mapId===b.mapId&&a.schemaVersion===b.schemaVersion&&a.mapVersion===b.mapVersion
/** The deployed scene determines the expected identity. A preview version must never label the old service scene. */
export class MapAdmission {
  private state:'pending'|'confirming'|'legacy'|'verified'|'mismatch'='pending'
  private server:MapIdentity|null=null
  readonly expected:Readonly<MapIdentity>
  readonly required:boolean
  constructor(expected:MapIdentity=LIVE_MAP_IDENTITY,required=false){this.expected=Object.freeze(parseMapIdentity(expected));this.required=required||expected.schemaVersion>=2}
  reset(){this.state='pending';this.server=null}
  connected(value:unknown) {
    if(this.state==='mismatch')return false
    if(value===undefined&&!this.required){this.state='legacy';return true}
    try{this.server=parseMapIdentity(value)}catch{this.state='mismatch';return false}
    this.state=sameMap(this.expected,this.server)?'confirming':'mismatch'
    return this.state==='confirming'
  }
  confirmed(value:unknown,verified:unknown) {
    if(this.state!=='confirming')return false
    try{this.server=parseMapIdentity(value)}catch{this.state='mismatch';return false}
    this.state=verified===true&&sameMap(this.expected,this.server)?'verified':'mismatch'
    return this.state==='verified'
  }
  reject(value:unknown){try{this.server=parseMapIdentity(value)}catch{this.server=null}this.state='mismatch'}
  get allowed(){return this.state==='verified'||this.state==='legacy'}
  get status(){return this.state}
  get serverMap(){return this.server}
  request(payload:Record<string,unknown>={}) {
    if(!this.allowed)throw new Error(MAP_UPDATE_MESSAGE)
    // Identity is sent only by WORLD_MAP_CONFIRM. Existing entry/recovery payloads stay intact.
    return {...payload}
  }
}
