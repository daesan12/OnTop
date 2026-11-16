import { detailProfileFacility } from './parkDetailCamera'
import { detailMeasurements } from './parkDetailMeasurements'

// WebGL measurements use the facility's default close camera at 1440 × 900.
const comparisons = {
  bread: { calls: 54, triangles: [63292, 50320], size: ['6.70', '1.48'] },
  fortune: { calls: 19, triangles: [37572, 21708], size: ['3.92', '0.61'] },
  lottery: { calls: 21, triangles: [44122, 29361], size: ['4.83', '1.06'] },
  dock: { calls: 22, triangles: [63531, 50801], size: ['4.52', '1.72'] },
  boat: { calls: 17, triangles: [39890, 24957], size: ['2.75', '0.54'] },
  stele: { calls: 10, triangles: [13774, 9347], size: ['1.88', '0.51'] },
} as const

const facilityComparisons = {
  tower: { calls: 4, triangles: [43908, 35292], size: ['2.58', '0.85'], scope: '전망대 본체' },
  mole: { calls: 9, triangles: [76180, 38653], size: ['2.68', '0.74'], scope: '두더지 가게 건물' },
  shooting: { calls: 9, triangles: [34994, 22652], size: ['3.61', '0.57'], scope: '사격장 정적 메시' },
  folk: { calls: 9, triangles: [53016, 36030], size: ['5.47', '0.89'], scope: '전통놀이존 정적 메시' },
  arcade: { calls: 10, triangles: [125192, 63738], size: ['4.67', '1.19'], scope: '오락실 건물과 실내 장식' },
} as const

type GlbMeasurement = {
  calls: number | readonly [number, number]
  triangles: readonly [number, number]
  size: readonly [string, string]
  unit?: 'KiB' | 'MiB'
}

export function setupRemainingGlbProfile(
  panel: HTMLDetailsElement,
  query: URLSearchParams,
  mode: 'before' | 'after',
) {
  const id = setupGlbProfile(panel, query, mode, 'glb-profile', comparisons, 'bread')
  const caption = panel.querySelector('p')!
  if (id === 'boat') caption.textContent = '정박한 오리배 1대 · 1440 × 900 · 동일 카메라'
  if (id === 'dock') caption.textContent = '선착장 진입 바닥 포함 · 1440 × 900 · 동일 카메라'
  return id === 'boat' ? 'dock' : id
}

export function setupFacilityGlbProfile(panel: HTMLDetailsElement, query: URLSearchParams, mode: 'before' | 'after') {
  const id = setupGlbProfile(panel, query, mode, 'facility-profile', facilityComparisons, 'tower')
  panel.querySelector('p')!.textContent = facilityComparisons[id].scope + ' · 동일 카메라'
  return id
}

export function setupParkDetailGlbProfile(panel: HTMLDetailsElement, query: URLSearchParams, mode: 'before' | 'after') {
  const id = setupGlbProfile(panel, query, mode, 'details-profile', detailMeasurements, 'jump')
  panel.querySelector('p')!.textContent = detailMeasurements[id].scope + ' · 동일 카메라'
  return detailProfileFacility(id)
}

function setupGlbProfile<Key extends string>(
  panel: HTMLDetailsElement,
  query: URLSearchParams,
  mode: 'before' | 'after',
  profile: string,
  measurements: Record<Key, GlbMeasurement>,
  fallback: NoInfer<Key>,
) {
  const asset = Object.keys(measurements).find(key => key === query.get('asset')) as Key | undefined
  const id = asset ?? fallback
  const data = measurements[id]
  const picker = panel.querySelector<HTMLSelectElement>('select')!
  picker.value = id
  const url = (view: string, selection: string) =>
    '?' + new URLSearchParams({ [profile]: view, asset: selection }).toString()
  picker.addEventListener('change', () => { window.location.search = url(mode, picker.value) })

  const cells = panel.querySelectorAll<HTMLTableCellElement>('tbody td')
  const calls = typeof data.calls === 'number' ? [data.calls, data.calls] : data.calls
  const values = [
    ...calls.map(String),
    ...data.triangles.map(count => count.toLocaleString('ko-KR')),
    ...data.size.map(size => size + ' ' + (data.unit ?? 'MiB')),
  ]
  cells.forEach((cell, index) => { cell.textContent = values[index]! })
  panel.querySelectorAll<HTMLAnchorElement>('[data-profile-view]').forEach(link => {
    link.href = url(link.dataset.profileView!, id)
  })
  return id
}
