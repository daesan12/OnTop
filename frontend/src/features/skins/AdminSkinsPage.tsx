import { useCallback, useEffect, useRef, useState } from 'react'
import { InboxError } from '../notifications/api'
import { fileSpec, skinRequest, slotOrder, uploadFile, type SkinDefinition, type SkinEntry, type SkinSettings, type SkinTicket, type SkinVerified } from './api'
import { SkinPreview } from './SkinPreview'
import './skins.css'
import { AdminSkinSets } from './AdminSkinSets'
import { places, placeLabels, physicalSlots } from './sets'

const initial: SkinDefinition = { productCode: '', name: '', grade: 4, compatibility: 'MALE', wearMode: 'WHOLE', slots: [...slotOrder] }
const stateNames = { DRAFT: '임시저장', PUBLISHED: '공개 중', DISABLED: '신규 획득 중단' }
const gradeNames = ['S', 'A', 'B', 'C']

export function AdminSkinsPage({ onAuthEnded }: { onAuthEnded: () => void }) {
  const [tab, setTab] = useState<'items' | 'sets' | 'legacy'>('items')
  return <><nav className="skin-tabs" aria-label="스킨 공방 메뉴">{([['items', '아이템 관리'], ['sets', '세트 관리'], ['legacy', '기존 등록 상품']] as const).map(([value, label]) =>
    <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</button>)}</nav>
    {tab === 'sets' ? <AdminSkinSets onAuthEnded={onAuthEnded}/> : <SkinItemEditor key={tab} onAuthEnded={onAuthEnded} component={tab === 'items'}/>}</>
}
function SkinItemEditor({ onAuthEnded, component }: { onAuthEnded: () => void; component: boolean }) {
  const [settings, setSettings] = useState<SkinSettings | null>(null), [entries, setEntries] = useState<SkinEntry[]>([])
  const [selected, setSelected] = useState<SkinEntry | null>(null), [form, setForm] = useState<SkinDefinition>(initial)
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [query, setQuery] = useState('')
  const [model, setModel] = useState<File | null>(null), [image, setImage] = useState<File | null>(null)
  const [femaleModel, setFemaleModel] = useState<File | null>(null), [sharedModel, setSharedModel] = useState(false)
  const [ticket, setTicket] = useState<SkinTicket | null>(null), [verified, setVerified] = useState<SkinVerified | null>(null)
  const [reviewed, setReviewed] = useState(false), [loaded, setLoaded] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const flight = useRef<AbortController | null>(null), loading = useRef<AbortController | null>(null)
  const [reload, setReload] = useState(0), [fileKey, setFileKey] = useState(0)
  const modelLoaded = useCallback(() => setLoaded(true), [])
  const fail = (cause: unknown) => {
    if (cause instanceof InboxError && cause.status === 401) onAuthEnded()
    else setMessage(cause instanceof Error ? cause.message : '결과를 확인하지 못했어요. 목록을 다시 조회해주세요.')
  }
  useEffect(() => {
    const control = loading.current = new AbortController()
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
  const choose = (entry: SkinEntry | null) => { if (flight.current) return; setSelected(entry); setForm(entry?.definition ?? initial); resetFiles(); setMessage('') }
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
    adopt(entry); resetFiles(); setMessage('상품 정보를 임시저장했어요. 다음으로 모델과 대표 이미지를 업로드해주세요.')
  })
  const dirty = !!selected && JSON.stringify(form) !== JSON.stringify(selected.definition)
  const paired = form.compatibility === 'ANY'
  const needsFemale = paired && !sharedModel
  const sendFiles = () => run(async signal => {
    if (!selected || !settings?.storageReady || !model || !image || dirty || (needsFemale && !femaleModel)) return
    const [m, i, f] = await Promise.all([fileSpec(model, '.glb', settings.maxModelBytes), fileSpec(image, '.webp', settings.maxImageBytes),
      needsFemale && femaleModel ? fileSpec(femaleModel, '.glb', settings.maxModelBytes) : null])
    const separate = f && (f.bytes !== m.bytes || f.sha256 !== m.sha256)
    const intent = await skinRequest<SkinTicket>(`/${selected.id}/uploads`, signal, 'POST', { version: selected.version, model: m, image: i, femaleModel: separate ? f : null })
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
    if (!signal.aborted) { adopt(result); setMessage(component ? '아이템을 공개했어요. 세트 관리에서 구성품으로 선택할 수 있어요.' : '스킨을 공개했어요. 뽑기 상품에 연결됐으며 기존 확률·등급 가치는 유지돼요.') }
  })
  return <section className="skin-admin" aria-label="스킨 등록 관리">
    <div className="skin-admin-intro"><div><small>온탑 의상 공방</small><h2>새로운 모습을 준비해요</h2>
      <p>{component ? '아이템 정보 → 파일 업로드·검증 → 공개 → 세트에서 선택' : '기존 등록 상품의 파일·공개 상태를 관리해요'}</p></div><button disabled={busy} onClick={() => { setMessage(''); setReload(v => v + 1) }}>목록 다시 조회</button></div>
    {message && <p className="skin-message" role="status">{message}</p>}
    {settings && !settings.storageReady && <aside className="skin-storage-note"><strong>파일 저장소 연결 준비 중</strong><p>상품 정보는 임시저장할 수 있어요. 실제 업로드·공개는 S3·CDN 연결 후 사용할 수 있어요.</p></aside>}
    {!settings ? <p>등록 권한과 저장소 설정을 확인해주세요.</p> : <div className="skin-workbench">
      <aside className="skin-library"><div className="skin-library-title"><h3>등록한 스킨</h3><button disabled={busy} onClick={() => choose(null)}>＋ 새 상품</button></div>
        <label>스킨 찾기<input value={query} onChange={e => setQuery(e.target.value)} placeholder="이름 또는 상품 코드"/></label>
        <ul>{entries.filter(e => `${e.definition.name} ${e.definition.productCode}`.includes(query)).map(entry => <li key={entry.id}>
          <button disabled={busy} aria-pressed={entry.id === selected?.id} onClick={() => choose(entry)}>
            <span className={'skin-grade grade-' + entry.definition.grade}>{gradeNames[entry.definition.grade - 1]}</span>
            <span><strong>{entry.definition.name}</strong><small>{entry.definition.productCode}</small><em>{stateNames[entry.state]}</em></span>
          </button></li>)}</ul>{!entries.length && <p>첫 스킨을 등록해보세요.</p>}
      </aside>
      <section className="skin-editor"><form onSubmit={e => { e.preventDefault(); void save() }}>
        <h3>{selected ? '상품 정보' : '새 스킨 등록'}</h3><fieldset disabled={busy}>
          <div className="skin-fields"><label>상품 코드<input aria-label="상품 코드" required pattern="[A-Z][A-Z0-9_]{2,27}" maxLength={28} value={form.productCode} disabled={!!selected}
            placeholder="예: CHERRY_HANBOK" onChange={e => setForm({ ...form, productCode: e.target.value })}/><small>영문 대문자·숫자·밑줄, 3~28자</small></label>
            <label>스킨 이름<input required maxLength={100} value={form.name} placeholder="예: 봄꽃 한복" onChange={e => setForm({ ...form, name: e.target.value })}/></label>
            <label>등급<select aria-label="등급" value={form.grade} disabled={!!selected?.publishedUploadId} onChange={e => setForm({ ...form, grade: Number(e.target.value) })}>{gradeNames.map((n, i) => <option key={n} value={i + 1}>{n}급</option>)}</select></label>
            <label>착용 캐릭터<select aria-label="착용 캐릭터" value={form.compatibility} disabled={!!selected?.publishedUploadId} onChange={e => setForm({ ...form, compatibility: e.target.value as SkinDefinition['compatibility'] })}>
              <option value="MALE">남자</option><option value="FEMALE">여자</option><option value="ANY">남녀 모두</option></select></label>
            <label>착용 방식<select aria-label="착용 방식" value={form.wearMode} disabled={!!selected?.publishedUploadId} onChange={e => setForm({ ...form, wearMode: e.target.value as SkinDefinition['wearMode'],
              ...(e.target.value === 'WHOLE' ? { slots: [...slotOrder] } : {}) })}>
              <option value="WHOLE">통합 스킨 · 전체 외형</option><option value="PARTS">분리 의상 · 선택 부위</option></select></label>
          </div><div className="skin-slots" role="group" aria-label="포함 부위">{places.map(place => <label key={place}><input type="checkbox" checked={physicalSlots[place].every(slot => form.slots.includes(slot))} disabled={form.wearMode === 'WHOLE' || !!selected?.publishedUploadId}
            onChange={e => setForm({ ...form, slots: slotOrder.filter(s => physicalSlots[place].includes(s) ? e.target.checked : form.slots.includes(s)) })}/>{placeLabels[place]}</label>)}</div>
          <p className="skin-help">옷은 상의·하의·신발을 함께 등록해요. 통합 스킨은 머리·얼굴·옷을 함께 입고 벗어요.</p>
          <button className="skin-primary" type="submit">{busy ? '처리 중…' : '상품 정보 저장'}</button>
        </fieldset></form>
        <section className="skin-upload"><h3>모델과 대표 이미지</h3><p>GLB 최대 20MiB · WebP 최대 2MiB · 새 파일은 별도 버전으로 보관해요.</p>
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
          <p className="skin-help">OnTop 전용 뼈대와 LOD/의상 조각 규격이 필요해요. 일반 GLB 파일이 모두 바로 착용되는 것은 아니에요.</p>
          {selected?.publishedUploadId && <button disabled={busy || !settings.storageReady || dirty} onClick={() => void run(async signal => {
            const result = await skinRequest<SkinVerified>(`/${selected.id}/uploads/${selected.publishedUploadId}/verify`, signal, 'POST')
            if (!signal.aborted) { setVerified(result); setLoaded(false); setImageLoaded(false); setReviewed(false); setMessage('등록된 파일을 불러왔어요. 검수 후 다시 공개할 수 있어요.') }
          })}>등록한 파일 불러오기</button>}
        </section>
        {verified && <section className="skin-review"><h3>공개 전 검수</h3>{paired && <p>왼쪽은 남캐용, 오른쪽은 여캐용이에요. 양쪽 모델을 모두 확인해주세요.</p>}<div className="skin-preview"><SkinPreview url={verified.modelUrl} femaleModelUrl={verified.femaleModelUrl} definition={selected!.definition} onLoaded={modelLoaded}/><img src={verified.imageUrl} alt="등록한 대표 이미지" onLoad={() => setImageLoaded(true)} onError={() => { setImageLoaded(false); setMessage('대표 이미지를 표시하지 못했어요. 공개 전 파일·CDN 연결을 확인해주세요.') }}/></div>
          <label><input type="checkbox" checked={reviewed} disabled={busy} onChange={e => setReviewed(e.target.checked)}/>미리보기·캐릭터 크기·착용 규격을 검수했어요.</label>
          <button className="skin-primary" disabled={busy || !reviewed || !loaded || !imageLoaded || dirty} onClick={() => void publish()}>검수한 스킨 공개</button>
        </section>}
        {selected?.publishedUploadId && <div className="skin-disable"><p>공개 후 등급·부위 변경은 새 상품으로 등록해요. 획득을 중단해도 기존 보유 의상은 유지돼요.</p>
          <button disabled={busy || selected.state === 'DISABLED'} onClick={() => void run(async signal => {
            const e = await skinRequest<SkinEntry>(`/${selected.id}/disable`, signal, 'POST', { version: selected.version })
            if (!signal.aborted) { adopt(e); resetFiles(); setMessage('신규 획득을 중단했어요. 기존 보유·착용은 유지돼요.') }
          })}>신규 획득 중단</button></div>}
      </section>
    </div>}
  </section>
}
