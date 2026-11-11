import {useEffect,useRef,useState} from 'react'
import {AnnouncementError} from './api'
import {entryNewsImage,listEntryNews,saveEntryNews,removeEntryNews,orderEntryNews,type EntryNews,type EntryNewsDraft} from './entryNewsApi'
import './entry-news.css'
const blank=():EntryNewsDraft=>({title:'',published:false,displayOrder:0,startsAt:null,endsAt:null,expectedVersion:0})
const localDate=(date:string|null)=>date?new Date(Date.parse(date)-new Date(date).getTimezoneOffset()*60000).toISOString().slice(0,16):''
export function AdminEntryNewsPage({onAuthEnded}:{onAuthEnded:()=>void}){
 const [values,setValues]=useState<EntryNews[]>([]),[draft,setDraft]=useState(blank),[editing,setEditing]=useState<EntryNews|null>(null),[file,setFile]=useState<File|null>(null)
 const [preview,setPreview]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[removing,setRemoving]=useState('')
 const request=useRef(new AbortController()),saving=useRef(false),createId=useRef(crypto.randomUUID()),fileInput=useRef<HTMLInputElement>(null)
 const fail=(cause:unknown)=>{if(request.current.signal.aborted)return;if(cause instanceof AnnouncementError&&cause.status===401){onAuthEnded();return}setError(cause instanceof Error?cause.message:'안내를 처리하지 못했어요. 다시 확인해주세요.')}
 async function refresh(){const v=await listEntryNews(request.current.signal);if(!request.current.signal.aborted){setValues(v);setReady(true)}}
 useEffect(()=>{const abort=new AbortController();request.current=abort;void refresh().catch(fail);return()=>abort.abort()},[])
 useEffect(()=>{let url='';const abort=new AbortController();setPreview('');if(file){url=URL.createObjectURL(file);setPreview(url)}else if(editing?.imageUrl){setPreview(editing.imageUrl)}else if(editing){void entryNewsImage(editing.id,abort.signal,true).then(blob=>{if(abort.signal.aborted)return;url=URL.createObjectURL(blob);setPreview(url)}).catch(cause=>{if(!abort.signal.aborted)fail(cause)})}return()=>{abort.abort();if(url)URL.revokeObjectURL(url)}},[file,editing?.id,editing?.imageHash])
 function reset(){setDraft(blank());setEditing(null);setFile(null);setRemoving('');createId.current=crypto.randomUUID();if(fileInput.current)fileInput.current.value=''}
 async function pick(f:File|undefined){if(!f)return;setError('');if(!['image/png','image/jpeg'].includes(f.type)||f.size>2*1024*1024){setError('PNG/JPEG, 2MB 이하 파일을 골라주세요.');return}
  try{const b=await createImageBitmap(f);const valid=b.width===1200&&b.height===675;b.close();if(!valid){setError('이미지는 정확히 1200×675px로 만들어주세요.');return}setFile(f)}catch{setError('이미지를 읽을 수 없어요.')}
 }
 async function run(action:()=>Promise<void>){if(saving.current)return;saving.current=true;setBusy(true);setError('');setNotice('');try{await action()}catch(e){fail(e)}finally{saving.current=false;if(!request.current.signal.aborted)setBusy(false)}}
 async function save(){await run(async()=>{if(!file&&!editing)throw new Error('등록할 이미지를 선택해주세요.');const value=await saveEntryNews(editing?.id??createId.current,{...draft,displayOrder:editing?draft.displayOrder:Math.min(9999,Math.max(-1,...values.map(n=>n.displayOrder))+1)},file,!editing,request.current.signal);if(request.current.signal.aborted)return;reset();setNotice(value.published?'게시했어요. 다음 공원 접속부터 표시돼요.':'임시 저장했어요. 게시 전까지 이용자에게 보이지 않아요.');await refresh()})}
 function edit(n:EntryNews){setEditing(n);setDraft({title:n.title,published:n.published,displayOrder:n.displayOrder,startsAt:n.startsAt,endsAt:n.endsAt,expectedVersion:n.version});setFile(null);setRemoving('');setError('')}
 async function move(index:number,direction:number){await run(async()=>{const next=[...values],target=index+direction;if(target<0||target>=next.length)return;[next[index],next[target]]=[next[target]!,next[index]!];await orderEntryNews(next,request.current.signal);await refresh();setNotice('페이지 순서를 저장했어요.')})}
 return <section className="entry-news-admin" aria-label="접속 안내 관리"><h2>공원에 들어올 때 보여줄 소식</h2><p>이미지 한 장이 안내 한 페이지예요. <b>1200 × 675px · PNG/JPEG · 최대 2MB</b>로 준비해주세요.</p>
  {error&&<p role="alert">{error} <button disabled={busy} onClick={()=>void run(refresh)}>목록 다시 조회</button></p>}{notice&&<p role="status">{notice}</p>}
  <div className="entry-news-admin__layout"><form onSubmit={e=>{e.preventDefault();void save()}}><fieldset disabled={busy}>
   <h3>{editing?'안내 수정':'새 안내 만들기'}</h3><label>안내 제목<input value={draft.title} maxLength={80} required placeholder="예: 알까기 업데이트" onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
   <label>안내 이미지<input ref={fileInput} type="file" accept="image/png,image/jpeg" onChange={e=>void pick(e.target.files?.[0])}/></label>
   {preview?<img className="entry-news-admin__preview" src={preview} alt="선택한 안내 이미지 미리보기"/>:<div className="entry-news-admin__preview">1200 × 675 이미지 미리보기</div>}
   <label className="entry-news-check"><input type="checkbox" checked={draft.published} onChange={e=>setDraft({...draft,published:e.target.checked})}/>이용자에게 게시하기</label>
   <div className="entry-news-admin__period"><label>게시 시작 (선택)<input type="datetime-local" value={localDate(draft.startsAt)} onChange={e=>setDraft({...draft,startsAt:e.target.value?new Date(e.target.value).toISOString():null})}/></label><label>게시 종료 (선택)<input type="datetime-local" value={localDate(draft.endsAt)} onChange={e=>setDraft({...draft,endsAt:e.target.value?new Date(e.target.value).toISOString():null})}/></label></div>
   <small>시간은 현재 기기의 시간대로 입력해요. 기간을 비워두면 제한 없이 게시해요.</small><p className="entry-news-admin__actions"><button className="entry-news-save" type="submit">{busy?'저장 중…':editing?'수정 저장':'안내 저장'}</button>{editing&&<button type="button" onClick={reset}>수정 취소</button>}</p>
  </fieldset></form><div><h3>등록한 안내 <small>{values.length} / 20장</small></h3><p>위쪽 안내부터 표시돼요. 화살표로 순서를 옮겨주세요.</p>{!ready?<p>목록을 불러오고 있어요…</p>:!values.length?<p>아직 등록한 안내가 없어요.</p>:null}<ul>{values.map((n,i)=><li key={n.id}><strong>{i+1}. {n.title}</strong><small>{!n.published?'숨김':n.endsAt&&Date.parse(n.endsAt)<=Date.now()?'게시 종료':n.startsAt&&Date.parse(n.startsAt)>Date.now()?'예약됨':'게시 중'}</small>
   <div className="entry-news-admin__actions"><button disabled={busy||!!editing||i===0} aria-label={`${n.title} 위로 이동`} onClick={()=>void move(i,-1)}>↑</button><button disabled={busy||!!editing||i===values.length-1} aria-label={`${n.title} 아래로 이동`} onClick={()=>void move(i,1)}>↓</button><button disabled={busy} onClick={()=>edit(n)}>수정·미리보기</button><button disabled={busy||!!editing} onClick={()=>setRemoving(removing===n.id?'':n.id)}>삭제</button></div>
   {removing===n.id&&<div>이 안내를 삭제할까요? <button disabled={busy} onClick={()=>void run(async()=>{await removeEntryNews(n,request.current.signal);setRemoving('');await refresh();setNotice('안내를 삭제했어요.')})}>삭제 확인</button><button disabled={busy} onClick={()=>setRemoving('')}>취소</button></div>}
  </li>)}</ul></div></div>
 </section>
}
