import {afterEach,beforeEach,expect,it,vi} from 'vitest'
const auth=vi.hoisted(()=>({session:{status:'AUTHENTICATED',accessToken:'test'} as {status:'AUTHENTICATED';accessToken:string}|null,refresh:vi.fn()}))
vi.mock('../../src/auth/authFlow',()=>({getAuthSession:()=>auth.session,restoreAuthSession:auth.refresh}))
import {saveEntryNews} from '../../src/features/announcements/entryNewsApi'
const id='a78baf0b-0246-4391-adef-a247f90ac50a',draft={title:'안내',published:true,displayOrder:0,startsAt:null,endsAt:null,expectedVersion:0}
const item={...draft,id,version:0,updatedAt:'2026-11-10T00:00:00Z',imageHash:'a'.repeat(64)}
const target={uploadId:id,url:'https://s3.test/incoming',headers:{'Content-Type':'image/png','x-amz-checksum-sha256':'signed'}}
const file=()=>new File(['test-image-bytes'],'news.png',{type:'image/png'})
beforeEach(()=>{auth.session={status:'AUTHENTICATED',accessToken:'test'}})
afterEach(()=>vi.unstubAllGlobals())
it('서명 발급 → JWT 없이 S3 PUT → JSON 게시 확정 순으로 전송한다',async()=>{
 const send=vi.fn().mockResolvedValueOnce(Response.json(target)).mockResolvedValueOnce(new Response(null,{status:200})).mockResolvedValueOnce(Response.json(item));vi.stubGlobal('fetch',send)
 await saveEntryNews(id,draft,file(),true,new AbortController().signal)
 expect(send.mock.calls[1]![0]).toBe(target.url);expect(send.mock.calls[1]![1]).toMatchObject({method:'PUT',credentials:'omit',headers:target.headers})
 const body=JSON.parse(send.mock.calls[2]![1].body);expect(body.draft).toEqual(draft);expect(body.upload).toMatchObject({uploadId:id,bytes:16,contentType:'image/png'});expect(body.upload.sha256).toMatch(/^[a-f0-9]{64}$/)
 expect(send.mock.calls[2]![1].headers.Authorization).toBe('Bearer test')
})
it('S3 업로드 실패 시 게시 확정을 보내지 않는다',async()=>{
 const send=vi.fn().mockResolvedValueOnce(Response.json(target)).mockResolvedValueOnce(new Response(null,{status:403}));vi.stubGlobal('fetch',send)
 await expect(saveEntryNews(id,draft,file(),true,new AbortController().signal)).rejects.toThrow('이미지를 올리지');expect(send).toHaveBeenCalledTimes(2)
})
it('업로드 중 로그아웃하면 게시 확정을 보내지 않는다',async()=>{
 const send=vi.fn().mockResolvedValueOnce(Response.json(target)).mockImplementationOnce(async()=>{auth.session=null;return new Response(null,{status:200})});vi.stubGlobal('fetch',send)
 await expect(saveEntryNews(id,draft,file(),true,new AbortController().signal)).rejects.toThrow('취소');expect(send).toHaveBeenCalledTimes(2)
})
it('이미지 없는 수정은 파일 전송 없이 JSON만 전송한다',async()=>{
 const send=vi.fn().mockResolvedValue(Response.json(item));vi.stubGlobal('fetch',send)
 await saveEntryNews(id,draft,null,false,new AbortController().signal);expect(send).toHaveBeenCalledTimes(1);expect(JSON.parse(send.mock.calls[0]![1].body)).toEqual({draft,upload:null})
})
const jwt=(sub:string,sid:string)=>'header.'+btoa(JSON.stringify({sub,sid}))+'.test-signature'
it('업로드 도중 같은 로그인 세션의 토큰 갱신은 허용한다',async()=>{
 auth.session={status:'AUTHENTICATED',accessToken:jwt('7','session-A')}
 const send=vi.fn().mockResolvedValueOnce(Response.json(target)).mockImplementationOnce(async()=>{auth.session={status:'AUTHENTICATED',accessToken:jwt('7','session-A')};return new Response(null,{status:200})}).mockResolvedValueOnce(Response.json(item));vi.stubGlobal('fetch',send)
 await saveEntryNews(id,draft,file(),true,new AbortController().signal);expect(send).toHaveBeenCalledTimes(3)
})
it('동일 회원이라도 재로그인으로 세션이 바뀌면 게시 확정을 취소한다',async()=>{
 auth.session={status:'AUTHENTICATED',accessToken:jwt('7','session-A')}
 const send=vi.fn().mockResolvedValueOnce(Response.json(target)).mockImplementationOnce(async()=>{auth.session={status:'AUTHENTICATED',accessToken:jwt('7','session-B')};return new Response(null,{status:200})});vi.stubGlobal('fetch',send)
 await expect(saveEntryNews(id,draft,file(),true,new AbortController().signal)).rejects.toThrow('취소');expect(send).toHaveBeenCalledTimes(2)
})
