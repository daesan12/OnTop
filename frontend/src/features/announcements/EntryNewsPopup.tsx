import {useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {useSession} from '../../network/worldClient'
import {clearRoamingInput} from '../../world/inputOwnership'
import {entryNewsImage,entryNewsSuppressionKey,koreanDay,loadEntryNews,suppressedToday,type EntryNewsFeed} from './entryNewsApi'
import './entry-news.css'

function TitleLeaf(){return <svg viewBox="0 0 54 48" fill="currentColor" aria-hidden="true"><path d="M44 43C29 39 15 26 9 8l2-1c6 16 19 28 34 33z"/><ellipse cx="12" cy="17" rx="5" ry="10" transform="rotate(-39 12 17)"/><ellipse cx="24" cy="13" rx="4.5" ry="9" transform="rotate(8 24 13)"/><ellipse cx="23" cy="31" rx="4.5" ry="10" transform="rotate(-62 23 31)"/><ellipse cx="36" cy="28" rx="4" ry="9" transform="rotate(25 36 28)"/></svg>}

export function EntryNewsPopup({hidden=false,launcherHost=null}:{hidden?:boolean;launcherHost?:HTMLElement|null}){
 const owner=useSession(s=>s.sessionId),connected=useSession(s=>s.status==='connected')
 const [feed,setFeed]=useState<EntryNewsFeed|null>(null),[index,setIndex]=useState(0),[closed,setClosed]=useState(false),[today,setToday]=useState(false)
 const [url,setUrl]=useState(''),[imageError,setImageError]=useState(false),[retry,setRetry]=useState(0),[clock,setClock]=useState(0)
 const [manual,setManual]=useState(false),[loading,setLoading]=useState(false),[loadError,setLoadError]=useState('')
 const request=useRef<AbortController|null>(null)
 const received=useRef(0),dialog=useRef<HTMLDialogElement>(null),oldFocus=useRef<HTMLElement|null>(null)
 async function refresh(manualRequest:boolean){
  request.current?.abort();const abort=request.current=new AbortController()
  setFeed(null);setIndex(0);setToday(false);setLoadError('');setManual(manualRequest);setClosed(false);setLoading(true)
  try{const value=await loadEntryNews(abort.signal);if(abort.signal.aborted)return;received.current=performance.now();setFeed(value);setClosed(!manualRequest&&suppressedToday(owner,Date.parse(value.serverTime)))}
  catch{if(!abort.signal.aborted&&manualRequest)setLoadError('소식을 불러오지 못했어요.')}
  finally{if(!abort.signal.aborted)setLoading(false)}
 }
 useEffect(()=>{
  setFeed(null);setClosed(false);setToday(false);setIndex(0);setManual(false);setLoading(false);setLoadError('')
  if(owner&&connected)void refresh(false)
  return()=>request.current?.abort()
 },[owner,connected])
 const serverNow=feed?Date.parse(feed.serverTime)+Math.max(0,performance.now()-received.current):Date.now()
 const pages=feed?.pages.filter(n=>!n.endsAt||Date.parse(n.endsAt)>serverNow)??[]
 const active=pages[index%Math.max(1,pages.length)]
 const visible=!closed&&!hidden&&(!!active||manual)
 useEffect(()=>{if(!feed||closed)return;const timer=setInterval(()=>setClock(v=>v+1),1000);return()=>clearInterval(timer)},[feed,closed])
 void clock
 useEffect(()=>{setUrl('');setImageError(false);if(!active||closed||hidden)return;if(active.imageUrl){setUrl(active.imageUrl);return}const abort=new AbortController();let objectUrl=''
  void entryNewsImage(active.id,abort.signal).then(blob=>{if(abort.signal.aborted)return;objectUrl=URL.createObjectURL(blob);setUrl(objectUrl)}).catch(()=>{if(!abort.signal.aborted)setImageError(true)})
  return()=>{abort.abort();if(objectUrl)URL.revokeObjectURL(objectUrl)}
 },[active?.id,active?.imageHash,active?.imageUrl,closed,hidden,retry])
 useEffect(()=>{if(!visible)return;const d=dialog.current;if(!d)return;let shown=false,timer:ReturnType<typeof setInterval>|undefined
  const show=()=>{if(shown||document.querySelector('dialog[open]'))return;oldFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;clearRoamingInput();if(document.pointerLockElement)document.exitPointerLock();d.showModal();d.focus({preventScroll:true});shown=true;clearInterval(timer)}
  show();if(!shown)timer=setInterval(show,250)
  return()=>{clearInterval(timer);d.close();clearRoamingInput();oldFocus.current?.focus()}
 },[visible])
 function close(){if(today&&owner&&active){try{localStorage.setItem(entryNewsSuppressionKey(owner),koreanDay(serverNow))}catch{/* Closing stays available when storage is disabled. */}}request.current?.abort();setLoading(false);setManual(false);setClosed(true)}
 const launcher=<button className="inbox-launcher entry-news-launcher" disabled={!owner||!connected} aria-haspopup="dialog" aria-expanded={visible} aria-controls="entry-news-popup" onClick={()=>void refresh(true)}><svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12v17l-6-3-6 3z"/><path d="M9 7h6M9 11h6"/></svg><span>이벤트/공지</span></button>
 return <>
 {!hidden&&launcherHost&&createPortal(launcher,launcherHost)}
 {visible&&<dialog id="entry-news-popup" ref={dialog} tabIndex={-1} className="entry-news-dialog" aria-labelledby="entry-news-title" onCancel={e=>{e.preventDefault();close()}} onKeyDown={e=>{e.stopPropagation();if(e.target instanceof HTMLInputElement)return;if(pages.length&&e.key==='ArrowLeft')setIndex(i=>(i+pages.length-1)%pages.length);if(pages.length&&e.key==='ArrowRight')setIndex(i=>(i+1)%pages.length)}}>
  <header><div className="entry-news-eyebrow"><i/><span>UPDATE &amp; EVENT</span><i/></div><h2 id="entry-news-title"><TitleLeaf/><span>온탑 새 소식</span><TitleLeaf/></h2><button className="entry-news-x" aria-label="새 소식 닫기" onClick={close}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
  {active?<><div className="entry-news-image" aria-busy={!url&&!imageError}>{url?<img key={`${active.id}:${retry}`} src={url} alt={active.title} onError={()=>setImageError(true)}/>:null}
   {imageError?<div role="alert">이미지를 불러오지 못했어요.<button onClick={()=>setRetry(v=>v+1)}>다시 불러오기</button></div>:!url?<p role="status">소식을 펼치고 있어요…</p>:null}
  </div>
  <nav aria-label="새 소식 페이지"><button aria-label="이전 소식" disabled={pages.length<2} onClick={()=>setIndex(i=>(i+pages.length-1)%pages.length)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg></button><div className="entry-news-dots">{pages.map((n,i)=><button key={n.id} aria-label={`${i+1}번째 소식`} aria-current={active.id===n.id?'page':undefined} onClick={()=>setIndex(i)}/>)}</div><span>{index%pages.length+1} / {pages.length}</span><button aria-label="다음 소식" disabled={pages.length<2} onClick={()=>setIndex(i=>(i+1)%pages.length)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg></button></nav>
  </>:<div className="entry-news-empty">{loading?<p role="status">소식을 불러오고 있어요…</p>:loadError?<div role="alert"><p>{loadError}</p><button onClick={()=>void refresh(true)}>다시 불러오기</button></div>:<p>현재 등록된 이벤트·공지가 없어요.</p>}</div>}
  <footer>{active?<label><input type="checkbox" checked={today} onChange={e=>setToday(e.target.checked)}/>오늘 보지 않기</label>:<span/>}<button className="entry-news-close" aria-label="닫기" onClick={close}>닫기</button></footer>
 </dialog>}
 </>
}
