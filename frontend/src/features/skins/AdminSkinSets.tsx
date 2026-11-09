import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { inboxRequest, InboxError } from '../notifications/api'
import { skinRequest, type SkinAsset, type SkinEntry } from './api'
import { occupies, overlaps, placeLabels, placeNames, places, type SetDefinition, type SkinSet } from './sets'
import { SkinSetPreview } from './SkinSetPreview'

const empty: SetDefinition = { productCode: '', name: '', grade: 4, compatibility: 'ANY', imageSkinId: '', itemIds: [] }
export function AdminSkinSets({ onAuthEnded }: { onAuthEnded: () => void }) {
  const [items, setItems] = useState<SkinEntry[]>([]), [sets, setSets] = useState<SkinSet[]>([]), [assets, setAssets] = useState<SkinAsset[]>([])
  const [form, setForm] = useState<SetDefinition>(empty), [selected, setSelected] = useState<SkinSet | null>(null)
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [loaded, setLoaded] = useState(false), [reviewed, setReviewed] = useState(false)
  const [query, setQuery] = useState(''), [revision, setRevision] = useState(0), [previewGeneration, setPreviewGeneration] = useState(0)
  const flight = useRef<AbortController | null>(null)
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
  const resetPreview = () => { setLoaded(false); setReviewed(false); setPreviewGeneration(v => v + 1) }
  const chooseSet = (value: SkinSet | null) => { if (flight.current) return;setSelected(value);setForm(value?.definition ?? empty);resetPreview();setMessage('') }
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
      if (!c.signal.aborted) { setSelected(result);setForm(result.definition);setSets(v => [result, ...v.filter(s => s.id !== result.id)]);setMessage(result.state === 'PUBLISHED' ? '세트를 공개했어요. 뽑기에서 구성 아이템을 함께 지급해요.' : '세트 정보를 저장했어요.');resetPreview() }
    } catch (e) { if (!c.signal.aborted) fail(e) }
    finally { if (flight.current === c) { flight.current = null;if (!c.signal.aborted) setBusy(false) } }
  }
  const ready = useCallback(() => setLoaded(true), [])
  const previewKey = previewGeneration + '|' + revision + form.compatibility + previewAssets.map(a => a.imageKey).join('|')
  return <section className="skin-admin" aria-label="스킨 세트 구성">
    <div className="skin-admin-intro"><div><small>온탑 의상 공방</small><h2>스킨 세트 구성</h2><p>아이템 먼저 등록 → 구성품 선택 → 세트 공개</p></div>
      <button disabled={busy} onClick={() => { resetPreview();setRevision(v => v + 1) }}>목록 다시 조회</button></div>
    {message && <p role="status" className="skin-message">{message}</p>}
    <div className="skin-workbench"><aside className="skin-library"><h3>등록한 세트</h3><button disabled={busy} onClick={() => chooseSet(null)}>＋ 새 세트</button>
      <ul>{sets.map(s => <li key={s.id}><button disabled={busy} aria-pressed={selected?.id === s.id} onClick={() => chooseSet(s)}><strong>{s.definition.name}</strong><small>{s.state === 'PUBLISHED' ? '공개 중' : s.state === 'DISABLED' ? '획득 중단' : '임시저장'}</small></button></li>)}</ul></aside>
      <div className="skin-editor"><form onSubmit={e => { e.preventDefault();void run(selected ? '/sets/' + selected.id : '/sets', selected ? 'PUT' : 'POST', selected ? { version: selected.version, definition: form } : form) }}>
        <fieldset disabled={busy || frozen}><div className="skin-fields">
          <label>세트 코드<input required pattern="[A-Z][A-Z0-9_]{2,27}" maxLength={28} disabled={!!selected} value={form.productCode} onChange={e => setForm({ ...form, productCode: e.target.value })}/></label>
          <label>세트 이름<input required maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></label>
          <label>세트 등급<select value={form.grade} onChange={e => setForm({ ...form, grade: +e.target.value })}>{['S', 'A', 'B', 'C'].map((n, i) => <option key={n} value={i + 1}>{n}급</option>)}</select></label>
          <label>세트 착용 캐릭터<select value={form.compatibility} onChange={e => { setForm({ ...form, compatibility: e.target.value as SetDefinition['compatibility'] });resetPreview() }}><option value="ANY">남녀 모두</option><option value="MALE">남자</option><option value="FEMALE">여자</option></select></label>
        </div></fieldset>
        <div className="skin-set-stage"><div className="skin-set-places" aria-label="점유 부위">
          {places.map(place => { const item = chosen.find(i => occupies(i, place)), picture = item && asset(item);return <div key={place} className={item ? 'occupied' : ''}>
            <strong>{placeLabels[place]}</strong>{picture && <img src={picture.imageUrl} alt={item!.definition.name}/>}
            <span>{item ? item.definition.name + ' · 사용 중 🔒' : '선택 가능'}</span>{place === 'OUTFIT' && <small>상의·하의·신발 포함</small>}</div> })}
        </div><div className="skin-set-preview" key={previewKey}>
          {previewAssets.length === chosen.length ? <SkinSetPreview assets={previewAssets} gender={form.compatibility} onReady={ready}/> : <p>등록한 모델을 다시 조회해주세요.</p>}
          <small>{form.compatibility === 'ANY' ? '왼쪽 남자 · 오른쪽 여자' : form.compatibility === 'FEMALE' ? '여자 미리보기' : '남자 미리보기'}</small>
        </div></div>
        <h3>등록된 아이템에서 선택</h3><label>아이템 찾기<input value={query} onChange={e => setQuery(e.target.value)}/></label>
        <div className="skin-component-grid">{items.filter(i => i.state === 'PUBLISHED' && i.definition.name.includes(query)).map(item => {
          const on = form.itemIds.includes(item.id), conflict = overlaps(chosen, item), incompatible = item.definition.compatibility !== 'ANY' && item.definition.compatibility !== form.compatibility
          return <button type="button" key={item.id} disabled={busy || frozen || (!on && (conflict || incompatible))} aria-pressed={on} onClick={() => toggle(item)}>
            {asset(item) && <img src={asset(item)!.imageUrl} alt=""/>}<strong>{item.definition.name}</strong><span>{placeNames(item)}</span><small>{on ? '선택됨' : conflict ? '겹치는 부위 사용 중 🔒' : incompatible ? '캐릭터 불일치' : '추가'}</small></button>
        })}</div>{!items.some(i => i.state === 'PUBLISHED') && <p>아이템 관리에서 먼저 파일을 등록·검증·공개해주세요.</p>}
        <h3>세트 구성품 {chosen.length}개</h3><ul className="skin-set-selection">{chosen.map(item => <li key={item.id}><strong>{item.definition.name}</strong><span>{placeNames(item)}</span>
          <label><input type="radio" name="setImage" checked={form.imageSkinId === item.id} disabled={busy || frozen} onChange={() => setForm({ ...form, imageSkinId: item.id })}/>대표 이미지</label>
          <button type="button" disabled={busy || frozen} onClick={() => toggle(item)}>빼기</button></li>)}</ul>
        <p>머리+얼굴 아이템을 빼면 두 슬롯이 함께 열려요. 뽑기는 세트로 획득하고 옷장에서는 아이템별로 입어요.</p>
        <button type="submit" disabled={busy || frozen || !chosen.length || chosen.some(i => i.state !== 'PUBLISHED')}>세트 정보 저장</button>
      </form>
      {selected && <div className="skin-review"><label><input type="checkbox" checked={reviewed} disabled={busy || dirty || !loaded} onChange={e => setReviewed(e.target.checked)}/>구성품·미리보기를 확인했어요.</label>
        <button disabled={busy || dirty || !reviewed || !loaded || selected.state === 'PUBLISHED'} onClick={() => void run('/sets/' + selected.id + '/publish', 'POST', { version: selected.version })}>세트 공개</button>
        {selected.publishedAt && <><p>공개한 세트 구성은 고정됩니다. 변경은 새 세트로 등록해주세요. 기존 보유 의상은 유지돼요.</p><button disabled={busy || selected.state === 'DISABLED'} onClick={() => void run('/sets/' + selected.id + '/disable', 'POST', { version: selected.version })}>신규 획득 중단</button></>}
      </div>}</div>
    </div>
  </section>
}
