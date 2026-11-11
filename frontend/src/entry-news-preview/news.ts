import image from '../../tests/fixtures/entry-news/alkkagi-update.png'
import type {EntryNewsFeed} from '../features/announcements/entryNewsApi'
export {entryNewsSuppressionKey,koreanDay,suppressedToday} from '../features/announcements/entryNewsApi'
export async function loadEntryNews(signal:AbortSignal):Promise<EntryNewsFeed>{
 signal.throwIfAborted()
 return {serverTime:new Date().toISOString(),pages:[{id:'00000000-0000-4000-8000-000000000001',title:'알까기 업데이트 · 로컬 예시',published:true,displayOrder:0,startsAt:null,endsAt:null,version:0,updatedAt:new Date().toISOString(),imageHash:'0'.repeat(64),imageUrl:image}]}
}
export async function entryNewsImage(){throw new Error('로컬 미리보기는 포함된 예시 이미지를 사용합니다.')}
