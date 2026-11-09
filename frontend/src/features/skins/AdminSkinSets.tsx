import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { inboxRequest, InboxError } from '../notifications/api'
import { skinRequest, type SkinAsset, type SkinEntry } from './api'
import { occupies, overlaps, placeLabels, placeNames, places, type SetDefinition, type SkinSet } from './sets'
import { SkinSetPreview } from './SkinSetPreview'

const freshSet = (item: SkinEntry | null = null): SetDefinition => ({ productCode: 'SET_' + crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase(), name: '', grade: 4, compatibility: item?.definition.compatibility ?? 'MALE', imageSkinId: item?.id ?? '', itemIds: item ? [item.id] : [] })
export function AdminSkinSets({ onAuthEnded, initialItem = null, onRegister, onWorkflowChange }: { onAuthEnded: () => void; initialItem?: SkinEntry | null; onRegister: () => void; onWorkflowChange: (state: { busy: boolean; dirty: boolean }) => void }) {
  const [items, setItems] = useState<SkinEntry[]>([]), [sets, setSets] = useState<SkinSet[]>([]), [assets, setAssets] = useState<SkinAsset[]>([])
  const [form, setForm] = useState<SetDefinition>(() => freshSet(initialItem)), [selected, setSelected] = useState<SkinSet | null>(null)
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [loaded, setLoaded] = useState(false), [reviewed, setReviewed] = useState(false)
  const [query, setQuery] = useState(''), [revision, setRevision] = useState(0), [previewGeneration, setPreviewGeneration] = useState(0)
  const flight = useRef<AbortController | null>(null)
  const draftBaseline = useRef(form)
  const fail = (e: unknown) => { if (e instanceof InboxError && e.status === 401) onAuthEnded(); else setMessage(e instanceof Error ? e.message : '다시 조회해주세요.') }
  useEffect(() => {
    const c = new AbortController()
    Promise.all([skinRequest<SkinEntry[]>('/components', c.signal), skinRequest<SkinSet[]>('/sets', c.signal), inboxRequest('/api/v1/skins/assets', c.signal)])
      .then(([a, b, cata]) => { if (!c.signal.aborted) { setItems(a); setSets(b); setAssets(cata as SkinAsset[]) } })
      .catch(e => { if (!c.signal.aborted) fail(e) })
    return () => c.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision])
  useEffect(() => () => flight.current?.abort(), [])
  const chosen = useMemo(() => form.itemIds.map(id => items.find(i => i.id === id)).filter((e): e is SkinEntry => !!e), [form.itemIds, items])
  const asset = (item: SkinEntry) => assets.find(a => a.imageKey === 'catalog/' + item.publishedUploadId)
  const previewAssets = useMemo(() => chosen.map(item => assets.find(a => a.imageKey === 'catalog/' + item.publishedUploadId)).filter((a): a is SkinAsset => !!a), [chosen, assets])
  const frozen = !!selected?.publishedAt, dirty = !!selected && JSON.stringify(selected.definition) !== JSON.stringify(form)
  const unsaved = dirty || (!selected && JSON.stringify(form) !== JSON.stringify(draftBaseline.current))
  useEffect(() => onWorkflowChange({ busy, dirty: unsaved }), [busy, unsaved, onWorkflowChange])
  const resetPreview = () => { setLoaded(false); setReviewed(false); setPreviewGeneration(v => v + 1) }
  const chooseSet = (value: SkinSet | null) => {
    if (flight.current || (unsaved && !window.confirm('저장하지 않은 세트 구성이 있어요. 다른 세트를 열까요?'))) return
    const next = value?.definition ?? freshSet(); draftBaseline.current = next
    setSelected(value);setForm(next);resetPreview();setMessage('')
  }
  const toggle = (item: SkinEntry) => {
    if (busy || frozen) return
    const ids = form.itemIds.includes(item.id) ? form.itemIds.filter(id => id !== item.id) : [...form.itemIds, item.id].sort()
    setForm({ ...form, itemIds: ids, imageSkinId: ids.includes(form.imageSkinId) ? form.imageSkinId : ids[0] ?? '' });resetPreview()
  }
  const run = async (path: string, method: string, body: unknown) => {
    if (flight.current) return
    const c = flight.current = new AbortController();setBusy(true);setMessage('')
    try {
      const result = await skinRequest<SkinSet>(path, c.signal, method, body)
      if (!c.signal.aborted) { setSelected(result);setForm(result.definition);setSets(v => [result, ...v.filter(s => s.id !== result.id)]);setMessage(result.state === 'PUBLISHED' ? '세트를 공개했어요. 뽑기에서 구성 아이템을 함께 지급해요.' : '구성을 저장했어요. 아래 미리보기를 확인하고 공개해주세요.');resetPreview() }
    } catch (e) { if (!c.signal.aborted) fail(e) }
    finally { if (flight.current === c) { flight.current = null;if (!c.signal.aborted) setBusy(false) } }
  }
  const ready = useCallback(() => setLoaded(true), [])
  const previewKey = previewGeneration + '|' + revision + form.compatibility + previewAssets.map(a => a.imageKey).join('|')
  return <section className="skin-admin" aria-label="스킨 세트 구성">
    <div className="skin-admin-intro"><div><small>온탑 의상 공방</small><h2>함께 뽑힐 의상을 골라주세요.</h2><p>세트 하나를 뽑으면 담긴 의상을 모두 받아요. 옷장에서는 각각 골라 입을 수 있어요.</p></div>
      <button disabled={busy} onClick={() => { resetPreview();setRevision(v => v + 1) }}>목록 다시 조회</button></div>
    {message && <p role="status" className="skin-message">{message}</p>}
    <div className="skin-workbench"><aside className="skin-library"><h3>내가 만든 뽑기 세트</h3><button disabled={busy} onClick={() => chooseSet(null)}>＋ 새 세트 만들기</button>
      <ul>{sets.map(s => <li key={s.id}><button disabled={busy} aria-pressed={selected?.id === s.id} onClick={() => chooseSet(s)}><strong>{s.definition.name}</strong><small>{s.state === 'PUBLISHED' ? '공개 중' : s.state === 'DISABLED' ? '획득 중단' : '임시저장'}</small></button></li>)}</ul></aside>
      <div className="skin-editor"><form onSubmit={e => { e.preventDefault();void run(selected ? '/sets/' + selected.id : '/sets', selected ? 'PUT' : 'POST', selected ? { version: selected.version, definition: form } : form) }}>
        <fieldset disabled={busy || frozen}><div className="skin-fields">
          <details className="skin-code"><summary>관리 코드 · 자동 입력</summary><label>세트 코드<input required pattern="[A-Z][A-Z0-9_]{2,27}" maxLength={28} disabled={!!selected} value={form.productCode} onChange={e => setForm({ ...form, productCode: e.target.value })}/></label></details>
          <label>세트 이름<input required maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></label>
          <label>어떤 등급에서 뽑힐까요?<select aria-label="세트 등급" value={form.grade} onChange={e => setForm({ ...form, grade: +e.target.value })}>{['S', 'A', 'B', 'C'].map((n, i) => <option key={n} value={i + 1}>{n}급</option>)}</select></label>
          <label>누가 입을 수 있나요?<select aria-label="세트 착용 캐릭터" value={form.compatibility} onChange={e => { setForm({ ...form, compatibility: e.target.value as SetDefinition['compatibility'] });resetPreview() }}><option value="ANY">남녀 모두</option><option value="MALE">남자</option><option value="FEMALE">여자</option></select></label>
        </div></fieldset>
        <div className="skin-set-stage"><div className="skin-set-places" aria-label="점유 부위">
          {places.map(place => { const item = chosen.find(i => occupies(i, place)), picture = item && asset(item);return <div key={place} className={item ? 'occupied' : ''}>
            <strong>{placeLabels[place]}</strong>{picture && <img src={picture.imageUrl} alt={item!.definition.name}/>}
            <span>{item ? item.definition.name : '비어 있음'}</span>{item && <small className="skin-slot-lock">이 의상이 사용하는 부위</small>}{place === 'OUTFIT' && <small>상의·하의·신발 포함</small>}</div> })}
        </div><div className="skin-set-preview" key={previewKey}>
          {previewAssets.length === chosen.length ? <SkinSetPreview assets={previewAssets} gender={form.compatibility} onReady={ready}/> : <p>등록한 모델을 다시 조회해주세요.</p>}
          <small>{form.compatibility === 'ANY' ? '왼쪽 남자 · 오른쪽 여자' : form.compatibility === 'FEMALE' ? '여자 미리보기' : '남자 미리보기'}</small>
        </div></div>
        <div className="skin-pick-heading"><h3>함께 지급할 의상 고르기</h3><button type="button" disabled={busy} onClick={onRegister}>＋ 의상 파일 더 등록</button></div><p className="skin-help">사진을 누르면 세트에 담겨요. 머리+얼굴 의상은 두 부위를 함께 사용해요.</p><label>아이템 찾기<input value={query} onChange={e => setQuery(e.target.value)}/></label>
        <div className="skin-component-grid">{items.filter(i => i.state === 'PUBLISHED' && i.definition.name.includes(query)).map(item => {
          const on = form.itemIds.includes(item.id), conflict = overlaps(chosen, item), incompatible = item.definition.compatibility !== 'ANY' && item.definition.compatibility !== form.compatibility
          return <button type="button" key={item.id} disabled={busy || frozen || (!on && (conflict || incompatible))} aria-pressed={on} onClick={() => toggle(item)}>
            {asset(item) && <img src={asset(item)!.imageUrl} alt=""/>}<strong>{item.definition.name}</strong><span>{placeNames(item)}</span><small>{on ? '선택됨' : conflict ? '다른 의상이 이 부위를 사용 중' : incompatible ? '선택한 캐릭터는 입을 수 없어요' : '세트에 담기'}</small></button>
        })}</div>{!items.some(i => i.state === 'PUBLISHED') && <p>아직 준비된 의상이 없어요. 위의 ‘의상 파일 더 등록’으로 GLB와 사진부터 올려주세요.</p>}
        <h3>세트에 담긴 의상 · {chosen.length}개</h3><ul className="skin-set-selection">{chosen.map(item => <li key={item.id}><strong>{item.definition.name}</strong><span>{placeNames(item)}</span>
          <label><input type="radio" name="setImage" checked={form.imageSkinId === item.id} disabled={busy || frozen} onChange={() => setForm({ ...form, imageSkinId: item.id })}/>대표 이미지</label>
          <button type="button" disabled={busy || frozen} onClick={() => toggle(item)}>빼기</button></li>)}</ul>
        <p className="skin-help">‘빼기’를 누르면 그 의상이 차지하던 부위를 다시 선택할 수 있어요.</p>
        <button type="submit" disabled={busy || frozen || !chosen.length || chosen.some(i => i.state !== 'PUBLISHED')}>구성 저장하고 공개 준비 →</button>
      </form>
      {selected && <div className="skin-review"><h3>마지막으로 확인하고 공개하세요.</h3><p>이름·등급·착용 모습을 확인해주세요. 공개하면 뽑기에서 바로 획득할 수 있어요.</p><label><input type="checkbox" checked={reviewed} disabled={busy || dirty || !loaded} onChange={e => setReviewed(e.target.checked)}/>구성품·미리보기를 확인했어요.</label>
        <button disabled={busy || dirty || !reviewed || !loaded || selected.state === 'PUBLISHED'} onClick={() => void run('/sets/' + selected.id + '/publish', 'POST', { version: selected.version })}>이 세트를 뽑기에 공개</button>
        {selected.publishedAt && <><p>공개한 세트 구성은 고정됩니다. 변경은 새 세트로 등록해주세요. 기존 보유 의상은 유지돼요.</p><button disabled={busy || selected.state === 'DISABLED'} onClick={() => void run('/sets/' + selected.id + '/disable', 'POST', { version: selected.version })}>뽑기에서 이 세트 숨기기</button></>}
      </div>}</div>
    </div>
  </section>
}
