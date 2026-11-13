import { announcementRequest as request, AnnouncementError } from './api'
import { getAuthSession, type AuthSession } from '../../auth/authFlow'
import { record } from '../../network/protocol'
export interface EntryNews { id:string; title:string; published:boolean; displayOrder:number; startsAt:string|null; endsAt:string|null; version:number; updatedAt:string; imageHash:string; imageUrl?:string|null }
export type EntryNewsDraft=Pick<EntryNews,'title'|'published'|'displayOrder'|'startsAt'|'endsAt'>&{expectedVersion:number}
export interface EntryNewsFeed { serverTime:string; pages:EntryNews[] }
const root='/api/v1/admin/operations/entry-news'
const date=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v))
export function parseEntryNews(value:unknown):EntryNews[]{
 if(!Array.isArray(value)||value.length>20||value.some(n=>!record(n)||typeof n.id!=='string'||!/^[a-f0-9-]{36}$/.test(n.id)||typeof n.title!=='string'||!n.title.trim()||n.title.length>80
  ||(n.imageUrl!==undefined&&n.imageUrl!==null&&(typeof n.imageUrl!=='string'||!/^https:\/\//.test(n.imageUrl)))||typeof n.published!=='boolean'||!Number.isSafeInteger(n.version)||Number(n.version)<0||!Number.isSafeInteger(n.displayOrder)||Number(n.displayOrder)<0
  ||!(n.startsAt===null||date(n.startsAt))||!(n.endsAt===null||date(n.endsAt))||!date(n.updatedAt)||typeof n.imageHash!=='string'||!/^[a-f0-9]{64}$/.test(n.imageHash)))throw new AnnouncementError('접속 안내 응답을 확인하지 못했어요.')
 return value as EntryNews[]
}
export async function loadEntryNews(signal:AbortSignal):Promise<EntryNewsFeed>{const v:unknown=await request('/api/v1/entry-news',signal);if(!record(v)||!date(v.serverTime))throw new AnnouncementError('접속 안내 시각을 확인하지 못했어요.');return {serverTime:String(v.serverTime),pages:parseEntryNews(v.pages)}}
export async function listEntryNews(signal:AbortSignal){return parseEntryNews(await request(root,signal))}
export async function entryNewsImage(id:string,signal:AbortSignal,admin=false){return await request(`${admin?root:'/api/v1/entry-news'}/${encodeURIComponent(id)}/image`,signal,'GET',undefined,true) as Blob}
// UI cancellation correlation only. Authentication/authorization is always verified by the server.
function loginIdentity(session:AuthSession|null){
 if(session?.status!=='AUTHENTICATED')return null
 try{const part=session.accessToken.split('.')[1];if(!part)return null;const claims:unknown=JSON.parse(atob(part.replaceAll('-','+').replaceAll('_','/')))
  return record(claims)&&typeof claims.sub==='string'&&typeof claims.sid==='string'&&claims.sid?JSON.stringify([claims.sub,claims.sid]):null
 }catch{return null}
}
export async function saveEntryNews(id:string,draft:EntryNewsDraft,file:File|null,creating:boolean,signal:AbortSignal){
 const owner=getAuthSession(),identity=loginIdentity(owner)
 const current=()=>{const now=getAuthSession();if(signal.aborted||owner?.status!=='AUTHENTICATED'||now?.status!=='AUTHENTICATED'||(now!==owner&&(!identity||loginIdentity(now)!==identity)))throw new AnnouncementError('요청이 취소되었습니다.')}
 let upload: {uploadId:string;bytes:number;sha256:string;contentType:string}|null=null
 if(file){
  if(file.size<12||file.size>2*1024*1024||!['image/png','image/jpeg'].includes(file.type))throw new AnnouncementError('PNG/JPEG, 2MB 이하 이미지를 선택해주세요.')
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('')
  current()
  const evidence={bytes:file.size,sha256,contentType:file.type}
  const target:unknown=await request(root+'/'+id+'/uploads',signal,'POST',evidence)
  if(!record(target)||typeof target.url!=='string'||!target.url.startsWith('https://')||typeof target.uploadId!=='string'||!record(target.headers)||Object.values(target.headers).some(v=>typeof v!=='string'))throw new AnnouncementError('이미지 업로드 주소를 확인하지 못했어요.')
  current()
  const response=await fetch(target.url,{method:'PUT',credentials:'omit',headers:target.headers as Record<string,string>,body:file,signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])})
  if(!response.ok)throw new AnnouncementError('이미지를 올리지 못했어요. 입력은 유지되니 다시 시도해주세요.',response.status)
  current()
  upload={...evidence,uploadId:target.uploadId}
 }
 current()
 return parseEntryNews([await request(root+'/'+id,signal,creating?'POST':'PUT',{draft,upload})])[0]!
}
export async function removeEntryNews(n:EntryNews,signal:AbortSignal){await request(`${root}/${n.id}?version=${n.version}`,signal,'DELETE')}
export async function orderEntryNews(list:EntryNews[],signal:AbortSignal){await request(`${root}/order`,signal,'PUT',{items:list.map(n=>({id:n.id,expectedVersion:n.version}))})}
export function koreanDay(time:number){return new Date(time+9*3600000).toISOString().slice(0,10)}
export function entryNewsSuppressionKey(owner:string){return `ontop:entry-news:today:${owner}`}
export function suppressedToday(owner:string,time:number,storage:Pick<Storage,'getItem'>=localStorage){try{return storage.getItem(entryNewsSuppressionKey(owner))===koreanDay(time)}catch{return false}}
