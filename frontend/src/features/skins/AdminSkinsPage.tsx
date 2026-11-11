import { useCallback, useEffect, useRef, useState } from 'react'
import { InboxError, inboxRequest } from '../notifications/api'
import { fileSpec, skinModelMode, skinRequest, slotOrder, uploadFile, type SkinAsset, type SkinDefinition, type SkinEntry, type SkinSettings, type SkinTicket, type SkinVerified } from './api'
import { SkinPreview } from './SkinPreview'
import './skins.css'
import { AdminSkinSets } from './AdminSkinSets'
import { places, placeLabels, physicalSlots } from './sets'
import { SkinGradeFilter, SkinThumbnail, skinThumbnail } from './SkinLibrary'

const initial: SkinDefinition = { productCode: '', name: '', grade: 4, compatibility: 'MALE', wearMode: 'WHOLE', slots: [...slotOrder] }
const stateNames = { DRAFT: '임시저장', PUBLISHED: '공개 중', DISABLED: '신규 획득 중단' }
const gradeNames = ['S', 'A', 'B', 'C']

type WorkflowState = { busy: boolean; dirty: boolean }
const newItem = (component: boolean): SkinDefinition => component
  ? { ...initial, productCode: 'ITEM_' + crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase(), wearMode: 'PARTS', slots: ['HAIR'] }
  : initial

export function AdminSkinsPage({ onAuthEnded }: { onAuthEnded: () => void }) {
  const [tab, setTab] = useState<'items' | 'sets' | 'legacy'>('sets')
  const [seed, setSeed] = useState<SkinEntry | null>(null)
  const [flow, setFlow] = useState<WorkflowState>({ busy: false, dirty: false })
  const navigate = (next: typeof tab, item: SkinEntry | null = null) => {
    if (flow.busy || (next === tab && !item)) return
    if (flow.dirty && !window.confirm('아직 저장하지 않은 내용이 있어요. 이 화면을 나갈까요?')) return
    setFlow({ busy: false, dirty: false }); setSeed(item); setTab(next)
  }
  return <div className="skin-workflow">
    {tab !== 'sets' && <div className="skin-file-back"><button disabled={flow.busy} onClick={() => navigate('sets')}>← 남녀 캐릭터 화면으로</button><p>이 파일에 들어 있는 부위를 체크하고, 파일과 사진을 올려주세요.</p></div>}
    {tab === 'sets' ? <AdminSkinSets onAuthEnded={onAuthEnded} initialItem={seed} onRegister={() => navigate('items')} onWorkflowChange={setFlow}/>
      : <SkinItemEditor key={tab} onAuthEnded={onAuthEnded} component={tab === 'items'} onCompose={item => navigate('sets', item)} onWorkflowChange={setFlow}/>}
    <details className="skin-previous"><summary>예전에 등록한 의상을 찾고 있나요?</summary><p>이전 방식으로 등록한 의상도 그대로 보관돼요. 여기서 파일과 공개 상태를 수정할 수 있어요.</p>
      <button disabled={flow.busy} onClick={() => navigate('legacy')}>이전 의상 불러오기</button></details>
  </div>
}
function SkinItemEditor({ onAuthEnded, component, onCompose, onWorkflowChange }: {
  onAuthEnded: () => void; component: boolean; onCompose: (item: SkinEntry) => void; onWorkflowChange: (state: WorkflowState) => void
}) {
  const [settings, setSettings] = useState<SkinSettings | null>(null), [entries, setEntries] = useState<SkinEntry[]>([])
  const [selected, setSelected] = useState<SkinEntry | null>(null), [form, setForm] = useState<SkinDefinition>(() => newItem(component))
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [query, setQuery] = useState('')
  const [grade, setGrade] = useState(0), [assets, setAssets] = useState<SkinAsset[]>([]), [thumbnailError, setThumbnailError] = useState(false)
  const [model, setModel] = useState<File | null>(null), [image, setImage] = useState<File | null>(null)
  const [femaleModel, setFemaleModel] = useState<File | null>(null), [sharedModel, setSharedModel] = useState(false)
  const [ticket, setTicket] = useState<SkinTicket | null>(null), [verified, setVerified] = useState<SkinVerified | null>(null)
  const [reviewed, setReviewed] = useState(false), [loaded, setLoaded] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const draftBaseline = useRef(form)
  const flight = useRef<AbortController | null>(null), loading = useRef<AbortController | null>(null)
  const [reload, setReload] = useState(0), [fileKey, setFileKey] = useState(0)
  const modelLoaded = useCallback(() => setLoaded(true), [])
  const fail = (cause: unknown) => {
    if (cause instanceof InboxError && cause.status === 401) onAuthEnded()
    else setMessage(cause instanceof Error ? cause.message : '결과를 확인하지 못했어요. 목록을 다시 조회해주세요.')
  }
  useEffect(() => {
    const control = loading.current = new AbortController()
    setThumbnailError(false)
    void inboxRequest('/api/v1/skins/assets', control.signal).then(value => { if (!control.signal.aborted) setAssets(value as SkinAsset[]) })
      .catch(() => { if (!control.signal.aborted) setThumbnailError(true) })
    Promise.all([skinRequest<SkinSettings>('/settings', control.signal), skinRequest<SkinEntry[]>(component ? '/components' : '', control.signal)])
      .then(([s, list]) => { if (!control.signal.aborted) { setSettings(s); setEntries(list) } })
      .catch(cause => { if (!control.signal.aborted) fail(cause) })
    return () => control.abort()
    // onAuthEnded belongs to the host; changes must not restart an in-progress upload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload])
  useEffect(() => () => { flight.current?.abort(); loading.current?.abort() }, [])
  const invalidateFiles = () => { setTicket(null); setVerified(null); setReviewed(false); setLoaded(false); setImageLoaded(false) }
  const resetFiles = () => { setModel(null); setFemaleModel(null); setSharedModel(false); setImage(null); invalidateFiles(); setFileKey(k => k + 1) }
  const choose = (entry: SkinEntry | null) => { if (flight.current || (unsaved && !window.confirm('저장하지 않은 내용이나 파일 선택이 있어요. 다른 의상을 열까요?'))) return; const next = entry?.definition ?? newItem(component); draftBaseline.current = next; setSelected(entry); setForm(next); resetFiles(); setMessage('') }
  const adopt = (entry: SkinEntry) => { setSelected(entry); setForm(entry.definition); setEntries(list => [entry, ...list.filter(e => e.id !== entry.id)]) }
  const run = async (action: (signal: AbortSignal) => Promise<void>) => {
    if (flight.current) return
    const control = flight.current = new AbortController(); setBusy(true); setMessage('')
    try { await action(control.signal) } catch (cause) { if (!control.signal.aborted) fail(cause) }
    finally { if (flight.current === control) { flight.current = null; if (!control.signal.aborted) setBusy(false) } }
  }
  const save = () => run(async signal => {
    const entry = await skinRequest<SkinEntry>(selected ? `/${selected.id}` : component ? '/components' : '', signal, selected ? 'PUT' : 'POST',
      selected ? { version: selected.version, definition: form } : form)
    if (signal.aborted) return
    adopt(entry); resetFiles(); setMessage(component ? '이름과 부위를 저장했어요. 아래에서 의상 파일과 사진을 올려주세요.' : '상품 정보를 임시저장했어요. 다음으로 모델과 대표 이미지를 업로드해주세요.')
  })
  const dirty = !!selected && JSON.stringify(form) !== JSON.stringify(selected.definition)
  const pendingFiles = !!(model || image || femaleModel) && (!verified || verified.uploadId !== selected?.publishedUploadId)
  const unsaved = dirty || (!selected && JSON.stringify(form) !== JSON.stringify(draftBaseline.current)) || pendingFiles
  useEffect(() => onWorkflowChange({ busy, dirty: unsaved }), [busy, unsaved, selected?.publishedUploadId, onWorkflowChange])
  const paired = form.compatibility === 'ANY'
  const needsFemale = paired && !sharedModel
  const sendFiles = () => run(async signal => {
    if (!selected || !settings?.storageReady || !model || !image || dirty || (needsFemale && !femaleModel)) return
    const mode = selected.publishedUploadId ? selected.definition.wearMode : await skinModelMode(model)
    if (!selected.publishedUploadId && needsFemale && femaleModel && await skinModelMode(femaleModel) !== mode) throw new Error('남녀 모델의 파일 구성이 달라요. 같은 종류의 의상 파일을 선택해주세요.')
    if (mode === 'WHOLE' && selected.definition.slots.length !== slotOrder.length) throw new Error('전체 외형 파일이에요. 머리·얼굴·옷을 모두 체크하고 저장해주세요.')
    let registration = selected
    if (registration.definition.wearMode !== mode) {
      registration = await skinRequest<SkinEntry>(`/${registration.id}`, signal, 'PUT', { version: registration.version, definition: { ...registration.definition, wearMode: mode } })
      if (signal.aborted) return
      adopt(registration)
    }
    const [m, i, f] = await Promise.all([fileSpec(model, '.glb', settings.maxModelBytes), fileSpec(image, '.webp', settings.maxImageBytes),
      needsFemale && femaleModel ? fileSpec(femaleModel, '.glb', settings.maxModelBytes) : null])
    const separate = f && (f.bytes !== m.bytes || f.sha256 !== m.sha256)
    const intent = await skinRequest<SkinTicket>(`/${selected.id}/uploads`, signal, 'POST', { version: registration.version, model: m, image: i, femaleModel: separate ? f : null })
    if (signal.aborted) return
    setTicket(intent); setVerified(null); setReviewed(false); setLoaded(false); setImageLoaded(false)
    setMessage('파일을 업로드하고 있어요. 화면을 닫으면 중단돼요.')
    await uploadFile(intent.model, model, signal); await uploadFile(intent.image, image, signal)
    if (separate && femaleModel) {
      if (!intent.femaleModel) throw new Error('여캐용 업로드 주소를 받지 못했어요. 서버 버전을 확인해주세요.')
      await uploadFile(intent.femaleModel, femaleModel, signal)
    }
    const result = await skinRequest<SkinVerified>(`/${selected.id}/uploads/${intent.uploadId}/verify`, signal, 'POST')
    if (!signal.aborted) { setVerified(result); setMessage('파일 검증을 통과했어요. 미리보기와 착용 규격을 확인한 뒤 공개해주세요.') }
  })
  const retryVerification = () => run(async signal => {
    if (!selected || !ticket) return
    const result = await skinRequest<SkinVerified>(`/${selected.id}/uploads/${ticket.uploadId}/verify`, signal, 'POST')
    if (!signal.aborted) { setVerified(result); setMessage('파일 검증 결과를 다시 확인했어요.') }
  })
  const publish = () => run(async signal => {
    if (!selected || !verified || !reviewed || !loaded || !imageLoaded || dirty) return
    const result = await skinRequest<SkinEntry>(`/${selected.id}/publish`, signal, 'POST', { version: selected.version, uploadId: verified.uploadId, reviewed: true })
    if (!signal.aborted) { adopt(result); setMessage(component ? '의상 준비가 끝났어요. 이제 함께 지급할 세트를 만들어보세요.' : '스킨을 공개했어요. 뽑기 상품에 연결됐으며 기존 확률·등급 가치는 유지돼요.') }
  })
  return <section className="skin-admin" aria-label="스킨 등록 관리">
    <div className="skin-admin-intro"><div><small>온탑 의상 공방</small><h2>{component ? '어떤 의상을 등록할까요?' : '이전 의상 수정'}</h2>
      <p>{component ? '머리·얼굴·옷 중 이 파일에 들어 있는 부위를 선택해주세요.' : '기존 등록 상품의 파일·공개 상태를 관리해요'}</p></div><button disabled={busy} onClick={() => { setMessage(''); setReload(v => v + 1) }}>목록 다시 조회</button></div>
    {message && <p className="skin-message" role="status">{message}</p>}
    {settings && !settings.storageReady && <aside className="skin-storage-note"><strong>파일 저장소 연결 준비 중</strong><p>상품 정보는 임시저장할 수 있어요. 실제 업로드·공개는 S3·CDN 연결 후 사용할 수 있어요.</p></aside>}
    {!settings ? <p>등록 권한과 저장소 설정을 확인해주세요.</p> : <div className="skin-workbench">
      <aside className="skin-library"><div className="skin-library-title"><h3>{component ? '준비한 의상' : '등록한 스킨'}</h3><button disabled={busy} onClick={() => choose(null)}>{component ? '＋ 새 의상' : '＋ 새 상품'}</button></div>
        <label>{component ? '의상 찾기' : '스킨 찾기'}<input value={query} onChange={e => setQuery(e.target.value)} placeholder="이름 또는 상품 코드"/></label>
        <SkinGradeFilter value={grade} onChange={setGrade} label={component ? '의상 등급 필터' : '이전 스킨 등급 필터'}/>
        {thumbnailError && <p className="skin-help">썸네일을 불러오지 못했어요. 상품 정보는 계속 확인할 수 있어요.</p>}
        <ul>{entries.filter(e => (!grade || e.definition.grade === grade) && `${e.definition.name} ${e.definition.productCode}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map(entry => <li key={entry.id}>
          <button disabled={busy} aria-pressed={entry.id === selected?.id} onClick={() => choose(entry)}>
            <SkinThumbnail src={skinThumbnail(entry, assets)} name={entry.definition.name}/>
            {!component && <span className={'skin-grade grade-' + entry.definition.grade}>{gradeNames[entry.definition.grade - 1]}</span>}
            <span><strong>{entry.definition.name}</strong>{!component && <small>{entry.definition.productCode}</small>}<em>{component ? entry.state === 'PUBLISHED' ? '세트에 담을 수 있어요' : entry.state === 'DRAFT' ? '파일 준비 중' : '새 세트 등록 중단' : stateNames[entry.state]}</em></span>
          </button></li>)}</ul>{!entries.length ? <p>첫 스킨을 등록해보세요.</p> : !entries.some(e => (!grade || e.definition.grade === grade) && `${e.definition.name} ${e.definition.productCode}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) && <p>선택한 등급이나 이름에 맞는 의상이 없어요.</p>}
      </aside>
      <section className="skin-editor"><form onSubmit={e => { e.preventDefault(); void save() }}>
        <h3>{component ? '이름과 부위' : selected ? '상품 정보' : '새 스킨 등록'}</h3><fieldset disabled={busy}>
          <div className="skin-fields">{component ? <details className="skin-code"><summary>관리 코드 · 자동 입력</summary><label>상품 코드<input aria-label="상품 코드" required pattern="[A-Z][A-Z0-9_]{2,27}" maxLength={28} value={form.productCode} disabled={!!selected}
            placeholder="예: CHERRY_HANBOK" onChange={e => setForm({ ...form, productCode: e.target.value })}/><small>영문 대문자·숫자·밑줄, 3~28자</small></label></details> : <><label>상품 코드<input aria-label="상품 코드" required pattern="[A-Z][A-Z0-9_]{2,27}" maxLength={28} value={form.productCode} disabled={!!selected}
            placeholder="예: CHERRY_HANBOK" onChange={e => setForm({ ...form, productCode: e.target.value })}/><small>영문 대문자·숫자·밑줄, 3~28자</small></label></>}
            <label>{component ? '의상 이름' : '스킨 이름'}<input required maxLength={100} value={form.name} placeholder="예: 봄꽃 한복" onChange={e => setForm({ ...form, name: e.target.value })}/></label>
            {!component && <label>등급<select aria-label="등급" value={form.grade} disabled={!!selected?.publishedUploadId} onChange={e => setForm({ ...form, grade: Number(e.target.value) })}>{gradeNames.map((n, i) => <option key={n} value={i + 1}>{n}급</option>)}</select></label>}
            <label>착용 캐릭터<select aria-label="착용 캐릭터" value={form.compatibility} disabled={!!selected?.publishedUploadId} onChange={e => setForm({ ...form, compatibility: e.target.value as SkinDefinition['compatibility'] })}>
              <option value="MALE">남자</option><option value="FEMALE">여자</option><option value="ANY">남녀 모두</option></select></label>

          </div><div className="skin-slots" role="group" aria-label="포함 부위">{places.map(place => <label key={place}><input type="checkbox" checked={physicalSlots[place].every(slot => form.slots.includes(slot))} disabled={!!selected?.publishedUploadId}
            onChange={e => setForm({ ...form, slots: slotOrder.filter(s => physicalSlots[place].includes(s) ? e.target.checked : form.slots.includes(s)) })}/>{placeLabels[place]}</label>)}</div>
          <p className="skin-help">파일에 포함된 부위만 체크해주세요. 옷은 상의·하의·신발을 포함해요. 파일 형식은 자동으로 확인해요.</p>
          <button className="skin-primary" type="submit">{busy ? '저장 중…' : component ? (selected ? '이름·부위 변경 저장' : '저장하고 파일 올리기 →') : '상품 정보 저장'}</button>
        </fieldset></form>
        {(!component || selected) && <section className="skin-upload"><h3>{component ? '의상 파일과 사진을 올려주세요' : '모델과 대표 이미지'}</h3><p>GLB 최대 20MiB · WebP 최대 2MiB · 새 파일은 별도 버전으로 보관해요.</p>
          <fieldset key={fileKey} disabled={busy || !selected || !settings.storageReady || dirty}>
            {paired && <label className="skin-shared-choice"><input type="checkbox" checked={sharedModel} onChange={e => { setSharedModel(e.target.checked); invalidateFiles() }}/>남녀 같은 공용 파일 사용</label>}
            <div className={paired ? 'skin-model-pair' : ''}>
              <label>{paired ? (sharedModel ? '공용 GLB 모델' : '남캐용 GLB 모델') : 'GLB 모델'}<input type="file" accept=".glb" onChange={e => { setModel(e.target.files?.[0] ?? null); invalidateFiles() }}/></label>
              {paired && <label>여캐용 GLB 모델{sharedModel ? <span className="skin-model-shared">{model ? `${model.name} · 같은 모델 사용` : '공용 파일을 선택하면 함께 연결돼요.'}</span>
                : <input type="file" accept=".glb" onChange={e => { setFemaleModel(e.target.files?.[0] ?? null); invalidateFiles() }}/> }</label>}
            </div>
            {paired && <small>한 상품으로 획득하며, 착용 시 현재 캐릭터에 맞는 모델을 불러와요.</small>}
            <label>WebP 대표 이미지<input type="file" accept=".webp" onChange={e => { setImage(e.target.files?.[0] ?? null); invalidateFiles() }}/></label>
            <button disabled={!model || !image || (needsFemale && !femaleModel)} onClick={() => void sendFiles()}>파일 업로드·검증</button>
            {ticket && !verified && <button onClick={() => void retryVerification()}>기존 업로드 검증 재확인</button>}
          </fieldset>{dirty && <p>변경한 상품 정보를 먼저 저장해주세요.</p>}
          <p className="skin-help">OnTop 전용 뼈대와 LOD/의상 조각 규격이 필요해요. 모델링 담당자가 전달한 OnTop용 GLB와 WebP 사진을 선택해주세요.</p>
          {selected?.publishedUploadId && <button disabled={busy || !settings.storageReady || dirty} onClick={() => void run(async signal => {
            const result = await skinRequest<SkinVerified>(`/${selected.id}/uploads/${selected.publishedUploadId}/verify`, signal, 'POST')
            if (!signal.aborted) { setVerified(result); setLoaded(false); setImageLoaded(false); setReviewed(false); setMessage('등록된 파일을 불러왔어요. 검수 후 다시 공개할 수 있어요.') }
          })}>등록한 파일 불러오기</button>}
        </section>}
        {verified && <section className="skin-review"><h3>공개 전 검수</h3>{paired && <p>왼쪽은 남캐용, 오른쪽은 여캐용이에요. 양쪽 모델을 모두 확인해주세요.</p>}<div className="skin-preview"><SkinPreview url={verified.modelUrl} femaleModelUrl={verified.femaleModelUrl} definition={selected!.definition} onLoaded={modelLoaded}/><img src={verified.imageUrl} alt="등록한 대표 이미지" onLoad={() => setImageLoaded(true)} onError={() => { setImageLoaded(false); setMessage('대표 이미지를 표시하지 못했어요. 공개 전 파일·CDN 연결을 확인해주세요.') }}/></div>
          <label><input type="checkbox" checked={reviewed} disabled={busy} onChange={e => setReviewed(e.target.checked)}/>미리보기·캐릭터 크기·착용 규격을 검수했어요.</label>
          <button className="skin-primary" disabled={busy || !reviewed || !loaded || !imageLoaded || dirty} onClick={() => void publish()}>{component ? '이 의상 사용 준비 완료' : '검수한 스킨 공개'}</button>
        </section>}
        {component && selected?.publishedUploadId && <div className="skin-next"><div><strong>의상 파일 준비 완료</strong><p>이 파일만으로 뽑기 상품이 생기지는 않아요. 다음 단계에서 다른 의상과 함께 세트에 담아주세요.</p></div>
          <button className="skin-primary" disabled={busy || dirty} onClick={() => onCompose(selected)}>이 의상으로 세트 만들기 →</button>
          <button disabled={busy} onClick={() => choose(null)}>다른 의상도 등록하기</button></div>}
        {selected?.publishedUploadId && <div className="skin-disable"><p>공개 후 등급·부위 변경은 새 상품으로 등록해요. 획득을 중단해도 기존 보유 의상은 유지돼요.</p>
          <button disabled={busy || selected.state === 'DISABLED'} onClick={() => void run(async signal => {
            const e = await skinRequest<SkinEntry>(`/${selected.id}/disable`, signal, 'POST', { version: selected.version })
            if (!signal.aborted) { adopt(e); resetFiles(); setMessage('신규 획득을 중단했어요. 기존 보유·착용은 유지돼요.') }
          })}>신규 획득 중단</button></div>}
      </section>
    </div>}
  </section>
}
