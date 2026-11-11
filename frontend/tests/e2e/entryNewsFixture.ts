import type {Page} from '@playwright/test'
import sharp from 'sharp'
import {createHash,randomUUID} from 'node:crypto'
import fs from 'node:fs/promises'
import type {EntryNews} from '../../src/features/announcements/entryNewsApi'
// HTTP/RawWS review data only. This file is never imported by the service build.
export async function entryNewsFixture(storeFile?:string){
 type Stored={item:EntryNews;image:string}
 const staged=new Map<string,{id:string;bytes:Buffer;sha256:string;contentType:string}>()
 let stored:Stored[]=[]
 if(storeFile){try{stored=JSON.parse(await fs.readFile(storeFile,'utf8'))}catch{/* New isolated local review store. */}}
 const image=async(title:string,color:string)=>await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"><defs><linearGradient id="bg"><stop stop-color="${color}"/><stop offset="1" stop-color="#54785d"/></linearGradient></defs><rect width="1200" height="675" fill="url(#bg)"/><path d="M850 0H1200V675H650Z" fill="#ead4a4"/><circle cx="1070" cy="100" r="55" fill="#f7eccb"/><rect x="760" y="300" width="360" height="260" rx="18" fill="#91603c"/><rect x="777" y="315" width="326" height="225" fill="#e6c58c"/><g stroke="#9b774b">${[0,1,2,3,4,5,6].map(i=>`<path d="M${790+i*48} 327v200M790 ${330+i*32}h300"/>`).join('')}</g><circle cx="870" cy="390" r="42" fill="#b74c3f" stroke="#e7c994" stroke-width="8"/><circle cx="1015" cy="470" r="42" fill="#3b675f" stroke="#e7c994" stroke-width="8"/><text x="65" y="100" fill="#e7cc8c" font-size="25" font-family="serif">ONTOP · UPDATE &amp; EVENT</text><text x="65" y="255" fill="#fff5d9" font-size="56" font-family="Malgun Gothic,serif" font-weight="bold">${title}</text><text x="65" y="345" fill="#f1d58a" font-size="32" font-family="Malgun Gothic,serif">오늘도 온탑에서 즐거운 한 판!</text><text x="65" y="570" fill="#f5ead4" font-size="21" font-family="Malgun Gothic,serif">로컬 안내 예시 · 관리자에서 이미지를 바꿔보세요</text></svg>`)).png().toBuffer()
 const persist=async()=>{if(storeFile)await fs.writeFile(storeFile,JSON.stringify(stored))}
 if(!stored.length){for(const [title,color]of [['새로운 한 판, 알까기','#244b38'],['공원에 새로운 소식이 왔어요','#394f65'],['함께 만드는 온탑 공원','#684936']]){const bytes=title==='새로운 한 판, 알까기'?await fs.readFile(new URL('../fixtures/entry-news/alkkagi-update.png',import.meta.url)):await image(title!,color!);stored.push({item:{id:randomUUID(),title:title!,published:true,displayOrder:stored.length,startsAt:null,endsAt:null,version:0,updatedAt:new Date().toISOString(),imageHash:createHash('sha256').update(bytes).digest('hex')},image:bytes.toString('base64')})}await persist()}
 return {items:()=>stored.map(n=>n.item),sampleImage:()=>Buffer.from(stored[0]!.image,'base64'),attach:async(page:Page)=>{
  stored.forEach(n=>{n.item.imageUrl=`https://entry-news-cdn.test/${n.item.id}.png`})
  await page.route('https://entry-news-upload.test/**',async r=>{
   const req=r.request(),uploadId=new URL(req.url()).pathname.slice(1),value=staged.get(uploadId),bytes=req.postDataBuffer()
   if(!value||req.method()!=='PUT'||!bytes||req.headers().authorization||req.headers().cookie||createHash('sha256').update(bytes).digest('hex')!==value.sha256)return r.fulfill({status:400})
   value.bytes=bytes;return r.fulfill({status:200})
  })
  await page.route('https://entry-news-cdn.test/**',r=>{const n=stored.find(n=>r.request().url().endsWith(n.item.id+'.png'));return n?r.fulfill({contentType:'image/png',body:Buffer.from(n.image,'base64')}):r.fulfill({status:404})})
  await page.route('**/api/v1/admin/me',r=>r.fulfill({json:{canRead:true,canOperate:true,canGrant:false}}))
  await page.route(/\/api\/v1\/(?:admin\/operations\/)?entry-news(?:[/?].*)?$/,async route=>{
   const req=route.request(),path=new URL(req.url()).pathname,admin=path.includes('/admin/'),method=req.method(),id=path.split('/').at(-1)!,now=new Date().toISOString()
   if(path.endsWith('/uploads')){const body=req.postDataJSON(),uploadId=randomUUID();staged.set(uploadId,{id:path.split('/').at(-2)!,bytes:Buffer.alloc(0),sha256:body.sha256,contentType:body.contentType});return route.fulfill({json:{uploadId,url:'https://entry-news-upload.test/'+uploadId,headers:{'Content-Type':body.contentType},expiresIn:300}})}
   if(path.endsWith('/image')){const n=stored.find(n=>n.item.id===path.split('/').at(-2));return n?route.fulfill({contentType:'image/png',body:Buffer.from(n.image,'base64')}):route.fulfill({status:404})}
   if(method==='GET'){const all=stored.map(n=>n.item).sort((a,b)=>a.displayOrder-b.displayOrder);return route.fulfill({json:admin?all:{serverTime:now,pages:all.filter(n=>n.published&&(!n.startsAt||n.startsAt<=now)&&(!n.endsAt||n.endsAt>now))}})}
   if(method==='DELETE'){stored=stored.filter(n=>n.item.id!==id);await persist();return route.fulfill({status:204})}
   if(id==='order'){const body=req.postDataJSON();if(body.items.some((n:{id:string;expectedVersion:number})=>!stored.some(s=>s.item.id===n.id&&s.item.version===n.expectedVersion)))return route.fulfill({status:409});body.items.forEach((n:{id:string},i:number)=>{const found=stored.find(s=>s.item.id===n.id)!;found.item.displayOrder=i;found.item.version++});await persist();return route.fulfill({status:204})}
   const {draft,upload}=req.postDataJSON(),pending=upload?staged.get(upload.uploadId):null,old=stored.find(n=>n.item.id===id)
   if(upload&&(!pending||pending.id!==id||pending.bytes.length!==upload.bytes||pending.sha256!==upload.sha256))return route.fulfill({status:400})
   const file=pending?.bytes
   if(method==='PUT'&&(!old||old.item.version!==draft.expectedVersion))return route.fulfill({status:409})
   const bytes=file??Buffer.from(old!.image,'base64');
   const n={item:{id,title:draft.title,published:draft.published,displayOrder:draft.displayOrder,startsAt:draft.startsAt,endsAt:draft.endsAt,version:old?old.item.version+1:0,updatedAt:now,imageHash:createHash('sha256').update(bytes).digest('hex'),imageUrl:`https://entry-news-cdn.test/${id}.png`},image:bytes.toString('base64')}
   stored=stored.filter(n=>n.item.id!==id);stored.push(n);await persist();return route.fulfill({json:n.item})
  })
 }}
}
