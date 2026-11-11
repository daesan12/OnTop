import { useState } from 'react'
import type { SkinAsset, SkinEntry } from './api'
import type { SkinSet } from './sets'
import './skinLibrary.css'

export const skinGrades = ['S', 'A', 'B', 'C'] as const
const states = { DRAFT: '임시저장', PUBLISHED: '공개 중', DISABLED: '획득 중단' }
export function skinThumbnail(item: SkinEntry | undefined, assets: readonly SkinAsset[]) {
  return item?.publishedUploadId ? assets.find(a => a.imageKey === 'catalog/' + item.publishedUploadId)?.imageUrl : undefined
}
export function SkinThumbnail({ src, name }: { src?: string; name: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  return <span className="skin-thumbnail">{src && failed !== src
    ? <img src={src} alt={name + ' 썸네일'} loading="lazy" onError={() => setFailed(src)}/>
    : <span className="skin-thumbnail-empty">{src ? '이미지 확인 필요' : '등록된 이미지 없음'}</span>}</span>
}
export function SkinGradeFilter({ value, onChange, label = '스킨 등급 필터' }: { value: number; onChange: (grade: number) => void; label?: string }) {
  return <div className="skin-grade-filter" role="group" aria-label={label}>
    {[0, 1, 2, 3, 4].map(grade => <button key={grade} type="button" aria-pressed={value === grade} onClick={() => onChange(grade)}>
      {grade ? skinGrades[grade - 1] + '급' : '전체'}</button>)}
  </div>
}
export function SkinSetLibrary({ sets, items, assets, busy, onChoose }: {
  sets: readonly SkinSet[]; items: readonly SkinEntry[]; assets: readonly SkinAsset[]; busy: boolean
  onChoose: (gender: 'MALE' | 'FEMALE', id: string) => void
}) {
  const [grade, setGrade] = useState(0), [query, setQuery] = useState('')
  const needle = query.trim().toLocaleLowerCase()
  const visible = sets.filter(s => (!grade || s.definition.grade === grade)
    && `${s.definition.name} ${s.definition.productCode}`.toLocaleLowerCase().includes(needle))
  return <section className="skin-set-library" aria-label="등록된 스킨 세트 목록">
    <header><div><h3>등록된 스킨</h3><p>등급별 사진을 보고, 편집할 캐릭터에 불러오세요.</p></div>
      <label>세트 찾기<input value={query} onChange={e => setQuery(e.target.value)} placeholder="이름 또는 상품 코드"/></label></header>
    <SkinGradeFilter value={grade} onChange={setGrade}/>
    <p className="skin-library-count" aria-live="polite">{visible.length}개 세트</p>
    <ul className="skin-set-cards">{visible.map(entry => <li key={entry.id}>
      <SkinThumbnail src={skinThumbnail(items.find(item => item.id === entry.definition.imageSkinId), assets)} name={entry.definition.name}/>
      <div className="skin-card-heading"><strong>{entry.definition.name}</strong><span className={'skin-grade grade-' + entry.definition.grade}>{skinGrades[entry.definition.grade - 1]}급</span></div>
      <p>{entry.definition.compatibility === 'ANY' ? '남녀 공용' : entry.definition.compatibility === 'MALE' ? '남자' : '여자'} · {states[entry.state]}</p>
      <div className="skin-card-actions">{(['MALE', 'FEMALE'] as const).filter(g => entry.definition.compatibility === g || entry.definition.compatibility === 'ANY').map(g =>
        <button key={g} type="button" disabled={busy} onClick={() => onChoose(g, entry.id)} aria-label={`${entry.definition.name} ${g === 'MALE' ? '남자' : '여자'}에 불러오기`}>
          {g === 'MALE' ? '남자' : '여자'}에 불러오기</button>)}</div>
    </li>)}</ul>
    {!visible.length && <p className="skin-library-empty">{sets.length ? '선택한 등급이나 이름에 맞는 세트가 없어요.' : '아직 등록한 세트가 없어요. 아이템을 골라 첫 세트를 만들어보세요.'}</p>}
  </section>
}
