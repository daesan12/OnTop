import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { inboxRequest, InboxError } from '../notifications/api'
import { skinRequest, type SkinAsset, type SkinEntry } from './api'
import { occupies, overlaps, placeLabels, placeNames, places, type SetDefinition, type SkinSet } from './sets'
import { SkinSetPreview } from './SkinSetPreview'
import { SkinSetLibrary, SkinGradeFilter } from './SkinLibrary'

type Gender = 'MALE' | 'FEMALE'
type Draft = { form: SetDefinition; saved: SkinSet | null }
const genders: Gender[] = ['MALE', 'FEMALE']
const genderLabel = { MALE: '남자', FEMALE: '여자' }
const fresh = (gender: Gender, item: SkinEntry | null = null): Draft => ({ saved: null, form: {
  productCode: 'SET_' + crypto.randomUUID().replaceAll('-', '').slice(0,16).toUpperCase(), name: '', grade: 4,
  compatibility: gender, imageSkinId: item?.id ?? '', itemIds: item ? [item.id] : [],
} })
const supported = (item: SkinEntry, gender: Gender) => item.definition.compatibility === 'ANY' || item.definition.compatibility === gender

/** Two independent character drafts use the existing gender-specific set API. */
export function AdminSkinSets({ onAuthEnded, initialItem = null, onRegister, onWorkflowChange }: {
  onAuthEnded: () => void; initialItem?: SkinEntry | null; onRegister: () => void
  onWorkflowChange: (value: {busy:boolean;dirty:boolean}) => void
}) {
  const [drafts,setDrafts] = useState<Record<Gender,Draft>>(() => ({
    MALE:fresh('MALE',initialItem && supported(initialItem,'MALE') ? initialItem : null),
    FEMALE:fresh('FEMALE',initialItem && supported(initialItem,'FEMALE') ? initialItem : null),
  }))
  const baselines = useRef({MALE:JSON.stringify(drafts.MALE.form),FEMALE:JSON.stringify(drafts.FEMALE.form)})
  const [items,setItems] = useState<SkinEntry[]>([]),[sets,setSets] = useState<SkinSet[]>([]),[assets,setAssets] = useState<SkinAsset[]>([])
  const [busy,setBusy] = useState(false),[message,setMessage] = useState(''),[revision,setRevision] = useState(0)
  const [loaded,setLoaded] = useState({MALE:false,FEMALE:false}),[reviewed,setReviewed] = useState({MALE:false,FEMALE:false})
  const [generation,setGeneration] = useState({MALE:0,FEMALE:0})
  const [picker,setPicker] = useState<{gender:Gender;place:typeof places[number]}|null>(null),[query,setQuery] = useState('')
  const [itemGrade,setItemGrade] = useState(0),[assetError,setAssetError] = useState(false)
  const assetIndex=useMemo(()=>new Map(assets.map(asset=>[asset.imageKey,asset])),[assets])
  const flight = useRef<AbortController|null>(null), dialog = useRef<HTMLDialogElement>(null)
  const listing = useRef<AbortController|null>(null)
  const fail = (e:unknown) => {if(e instanceof InboxError && e.status===401)onAuthEnded();else setMessage(e instanceof Error?e.message:'불러오지 못했어요. 다시 시도해주세요.')}
  useEffect(()=>{const c=listing.current=new AbortController();setAssetError(false)
    void inboxRequest('/api/v1/skins/assets',c.signal).then(catalog=>{if(!c.signal.aborted)setAssets(catalog as SkinAsset[])})
      .catch(()=>{if(!c.signal.aborted){setAssets([]);setAssetError(true)}})
    Promise.all([skinRequest<SkinEntry[]>('/components',c.signal),skinRequest<SkinSet[]>('/sets',c.signal)])
      .then(([a,b])=>{if(!c.signal.aborted){setItems(a);setSets(b)}}).catch(e=>{if(!c.signal.aborted)fail(e)})
    return()=>c.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[revision])
  useEffect(()=>()=>flight.current?.abort(),[])
  useEffect(()=>{if(picker){dialog.current?.showModal();return()=>dialog.current?.close()}},[picker])
  const chosen = (gender:Gender) => drafts[gender].form.itemIds.map(id=>items.find(i=>i.id===id)).filter((i):i is SkinEntry=>!!i)
  const findAsset = (item:SkinEntry) => assetIndex.get('catalog/'+item.publishedUploadId)
  const previews = useMemo(()=>Object.fromEntries(genders.map(g=>[g,drafts[g].form.itemIds.map(id=>items.find(i=>i.id===id)).map(i=>i&&assetIndex.get('catalog/'+i.publishedUploadId)).filter((a):a is SkinAsset=>!!a)])) as Record<Gender,SkinAsset[]>,[drafts,items,assetIndex])
  const dirty = (g:Gender) => JSON.stringify(drafts[g].form)!==baselines.current[g]
  const unsaved = genders.some(dirty)
  useEffect(()=>onWorkflowChange({busy,dirty:unsaved}),[busy,unsaved,onWorkflowChange])
  const reset = (g:Gender) => {setGeneration(v=>({...v,[g]:v[g]+1}));setLoaded(v=>({...v,[g]:false}));setReviewed(v=>({...v,[g]:false}))}
  const edit = (g:Gender,form:SetDefinition,modelChanged=false) => {setDrafts(v=>({...v,[g]:{...v[g],form}}));setReviewed(v=>({...v,[g]:false}));if(modelChanged)reset(g)}
  const changeSet = (g:Gender,id:string) => {
    if(busy || dirty(g)&&!window.confirm('저장하지 않은 구성이 있어요. 다른 세트를 열까요?'))return
    const entry=sets.find(s=>s.id===id),next=entry?{saved:entry,form:entry.definition}:fresh(g)
    baselines.current[g]=JSON.stringify(next.form);setDrafts(v=>({...v,[g]:next}));reset(g)
  }
  const fitsDraft = (item:SkinEntry,g:Gender) => supported(item,g) && (drafts[g].form.compatibility !== 'ANY' || item.definition.compatibility === 'ANY')
  const selectItem = (item:SkinEntry) => {
    if(!picker || busy)return
    const g=picker.gender,d=drafts[g];if(d.saved?.publishedAt || !fitsDraft(item,g)||overlaps(chosen(g),item))return
    const ids=[...new Set([...d.form.itemIds,item.id])].sort()
    edit(g,{...d.form,itemIds:ids,imageSkinId:d.form.imageSkinId||item.id},true);setPicker(null)
  }
  const remove = (g:Gender,id:string) => {
    const d=drafts[g];if(busy||d.saved?.publishedAt)return
    const ids=d.form.itemIds.filter(v=>v!==id);edit(g,{...d.form,itemIds:ids,imageSkinId:ids.includes(d.form.imageSkinId)?d.form.imageSkinId:ids[0]??''},true)
  }
  const persist = async (g:Gender,publish:boolean) => {
    if(flight.current)return
    const d=drafts[g];if(!d.form.name.trim()||!d.form.itemIds.length || publish&&(!loaded[g]||!reviewed[g]))return
    const c=flight.current=new AbortController();setBusy(true);setMessage('')
    try {
      let result=d.saved
      if(!result||dirty(g)){
        result=await skinRequest<SkinSet>(result?'/sets/'+result.id:'/sets',c.signal,result?'PUT':'POST',result?{version:result.version,definition:d.form}:d.form)
        if(c.signal.aborted)return
        // Preserve the created draft if publication fails; retry must not create another set.
        baselines.current[g]=JSON.stringify(result.definition);setDrafts(v=>({...v,[g]:{form:result!.definition,saved:result}}));setSets(v=>[result!,...v.filter(s=>s.id!==result!.id)])
      }
      if(publish)result=await skinRequest<SkinSet>('/sets/'+result.id+'/publish',c.signal,'POST',{version:result.version})
      if(!c.signal.aborted){baselines.current[g]=JSON.stringify(result.definition);setDrafts(v=>({...v,[g]:{form:result.definition,saved:result}}));setSets(v=>[result,...v.filter(s=>s.id!==result.id)]);setMessage(genderLabel[g]+(publish?' 세트를 뽑기에 공개했어요.':' 구성을 저장했어요.'))}
    }catch(e){if(!c.signal.aborted)fail(e)}finally{if(flight.current===c){flight.current=null;if(!c.signal.aborted)setBusy(false)}}
  }
  const hide = async (g:Gender) => {
    const saved=drafts[g].saved;if(!saved||flight.current)return
    const c=flight.current=new AbortController();setBusy(true)
    try {const result=await skinRequest<SkinSet>('/sets/'+saved.id+'/disable',c.signal,'POST',{version:saved.version})
      if(!c.signal.aborted){setDrafts(v=>({...v,[g]:{...v[g],saved:result}}));setSets(v=>[result,...v.filter(s=>s.id!==result.id)]);setMessage(genderLabel[g]+' 세트를 뽑기에서 숨겼어요. 보유 의상은 유지돼요.')}
    }catch(e){if(!c.signal.aborted)fail(e)}finally{if(flight.current===c){flight.current=null;setBusy(false)}}
  }
  const deleteSet = async (entry:SkinSet) => {
    if(flight.current||busy)return
    const unsavedHere=genders.some(g=>drafts[g].saved?.id===entry.id&&dirty(g))
    if(!window.confirm(`‘${entry.definition.name}’ 세트를 삭제할까요?\n공방 목록과 신규 획득에서 제외돼요. 기존 보유·착용과 영수증은 유지돼요.${unsavedHere?'\n이 세트의 저장하지 않은 변경도 지워져요.':''}`))return
    const c=flight.current=new AbortController();setBusy(true);setMessage('')
    try{
      await skinRequest<void>('/sets/'+entry.id,c.signal,'DELETE',{version:entry.version})
      if(c.signal.aborted)return
      listing.current?.abort()
      setSets(v=>v.filter(s=>s.id!==entry.id))
      for(const g of genders)if(drafts[g].saved?.id===entry.id){
        const next=fresh(g);baselines.current[g]=JSON.stringify(next.form)
        setDrafts(v=>({...v,[g]:next}));reset(g)
      }
      setMessage('세트를 삭제했어요. 기존 보유·착용은 그대로 유지돼요.')
    }catch(e){if(!c.signal.aborted)fail(e)}finally{if(flight.current===c){flight.current=null;if(!c.signal.aborted)setBusy(false)}}
  }
  const readyMale=useCallback(()=>setLoaded(v=>({...v,MALE:true})),[]),readyFemale=useCallback(()=>setLoaded(v=>({...v,FEMALE:true})),[])
  const slots = (g:Gender) => <div className={'skin-body-slots '+g.toLowerCase()} aria-label={genderLabel[g]+' 부위'}>{places.map(place=>{
    const item=chosen(g).find(i=>occupies(i,place)),picture=item&&findAsset(item),locked=!!item
    return <div key={place} className={'skin-body-slot'+(locked?' occupied':'')}>
      <button type="button" aria-label={genderLabel[g]+' '+placeLabels[place]+' 불러오기'} disabled={busy||!!drafts[g].saved?.publishedAt||locked} onClick={()=>{setQuery('');setItemGrade(0);setPicker({gender:g,place})}}>
        <strong>{placeLabels[place]}</strong>{picture?<img src={picture.imageUrl} alt=""/>:<span className="skin-slot-plus" aria-hidden="true">＋</span>}
        <span>{item?item.definition.name:'아이템 불러오기'}</span>{locked&&<small>🔒 {placeNames(item!)} 연결</small>}
      </button>{item&&!drafts[g].saved?.publishedAt&&<button type="button" className="skin-slot-remove" disabled={busy} onClick={()=>remove(g,item.id)} aria-label={genderLabel[g]+' '+placeLabels[place]+' 아이템 빼기'}>빼기</button>}
    </div>
  })}</div>
  return <section className="skin-admin skin-dressing-room" aria-label="남녀 세트 편집">
    <header className="skin-dressing-heading"><div><h2>아이템을 불러와 입혀보세요.</h2><p>남자는 왼쪽, 여자는 오른쪽 슬롯을 눌러주세요. 남녀 구성은 각각 저장돼요.</p></div>
      <div><button disabled={busy} onClick={onRegister}>＋ 새 아이템 파일 등록</button><button disabled={busy} onClick={()=>{genders.forEach(reset);setRevision(v=>v+1)}}>목록 새로고침</button></div></header>
    {message&&<p role="status" className="skin-message">{message}</p>}
    {assetError&&<p role="status" className="skin-help">미리보기 파일 목록을 불러오지 못했어요. 세트 정보는 편집할 수 있어요. 목록을 새로고침해주세요.</p>}
    <SkinSetLibrary sets={sets} items={items} assets={assets} busy={busy} onChoose={changeSet} onDelete={entry=>void deleteSet(entry)}/>
    <div className="skin-twin-stage">{slots('MALE')}<div className="skin-twin-models">{genders.map(g=>{
      const d=drafts[g],key=g+'|'+generation[g]+'|'+revision+'|'+previews[g].map(a=>a.imageKey).join('|')
      return <figure key={g} className="skin-body-model" aria-label={genderLabel[g]+' 캐릭터 미리보기'}><figcaption>{genderLabel[g]} 캐릭터</figcaption><div className="skin-twin-canvas" key={key}>
        {previews[g].length===d.form.itemIds.length?<SkinSetPreview assets={previews[g]} gender={g} onReady={g==='MALE'?readyMale:readyFemale}/>:<p role="alert">의상 파일을 찾지 못했어요. 목록을 새로고침해주세요.</p>}
      </div></figure>
    })}</div>{slots('FEMALE')}</div>
    <div className="skin-twin-save">{genders.map(g=>{
      const d=drafts[g],frozen=!!d.saved?.publishedAt
      return <section key={g} aria-label={genderLabel[g]+' 세트 저장'}><h3>{genderLabel[g]} 세트</h3><label>불러올 세트<select aria-label={genderLabel[g]+' 기존 세트'} disabled={busy} value={d.saved?.id??''} onChange={e=>changeSet(g,e.target.value)}><option value="">＋ 새 세트</option>{sets.filter(s=>s.definition.compatibility===g||s.definition.compatibility==='ANY').map(s=><option key={s.id} value={s.id}>{s.definition.name}{s.state==='PUBLISHED'?' · 공개 중':''}</option>)}</select></label>
        <fieldset disabled={busy}><label>세트 이름<input disabled={frozen} aria-label={genderLabel[g]+' 세트 이름'} maxLength={100} placeholder="예: 선비 세트" value={d.form.name} onChange={e=>edit(g,{...d.form,name:e.target.value})}/></label>
          <label>뽑기 등급<select disabled={frozen} aria-label={genderLabel[g]+' 세트 등급'} value={d.form.grade} onChange={e=>edit(g,{...d.form,grade:+e.target.value})}>{['S','A','B','C'].map((label,n)=><option key={n} value={n+1}>{label}급</option>)}</select></label>
          <label className="skin-twin-review"><input type="checkbox" checked={reviewed[g]} disabled={!loaded[g]||!d.form.itemIds.length} onChange={e=>setReviewed(v=>({...v,[g]:e.target.checked}))}/>미리보기를 확인했어요</label>
          <div className="skin-twin-actions"><button disabled={frozen||!d.form.name.trim()||!d.form.itemIds.length} onClick={()=>void persist(g,false)}>임시저장</button><button className="skin-primary" disabled={d.saved?.state==='PUBLISHED'||!d.form.name.trim()||!d.form.itemIds.length||!reviewed[g]||!loaded[g]} onClick={()=>void persist(g,true)}>{genderLabel[g]} 세트 공개</button></div>
        </fieldset>{frozen&&<><p>구성을 바꾸려면 ‘새 세트’를 선택해주세요.</p>{d.saved?.state==='PUBLISHED'&&<button disabled={busy} onClick={()=>void hide(g)}>뽑기에서 숨기기</button>}</>}
      </section>
    })}</div>
    <dialog ref={dialog} className="skin-item-picker" onCancel={e=>{e.preventDefault();setPicker(null)}} aria-label="등록된 아이템 불러오기">
      {picker&&<><header><div><h3>{genderLabel[picker.gender]} {placeLabels[picker.place]}에 입힐 아이템</h3><p>사진을 누르면 바로 입혀져요.</p></div><button onClick={()=>setPicker(null)} aria-label="아이템 선택 닫기">닫기</button></header>
        <label>아이템 찾기<input autoFocus value={query} onChange={e=>setQuery(e.target.value)}/></label>
        <SkinGradeFilter value={itemGrade} onChange={setItemGrade} label="아이템 등급 필터"/><div className="skin-component-grid">
          {items.filter(i=>i.state==='PUBLISHED'&&(!itemGrade||i.definition.grade===itemGrade)&&fitsDraft(i,picker.gender)&&occupies(i,picker.place)&&i.definition.name.includes(query)).map(item=>{
            const conflict=overlaps(chosen(picker.gender),item),picture=findAsset(item)
            return <button key={item.id} disabled={busy||conflict||!picture} onClick={()=>selectItem(item)}>{picture&&<img src={picture.imageUrl} alt=""/>}<strong>{item.definition.name}</strong><span>{placeNames(item)}</span><small>{conflict?'다른 아이템이 사용 중인 부위예요':!picture?'파일을 다시 확인해주세요':'불러오기'}</small></button>
          })}
        </div>{!items.some(i=>i.state==='PUBLISHED'&&(!itemGrade||i.definition.grade===itemGrade)&&fitsDraft(i,picker.gender)&&occupies(i,picker.place)&&i.definition.name.includes(query))&&<p>선택한 조건에서 이 부위에 사용할 아이템이 없어요.</p>}
      </>}
    </dialog>
  </section>
}
