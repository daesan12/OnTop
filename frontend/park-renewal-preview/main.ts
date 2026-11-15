import { createParkPreview, layout } from './scene'
import type { ParkView } from './scene'
import { setupFacilityGlbProfile, setupParkDetailGlbProfile, setupRemainingGlbProfile } from './remainingGlbProfile'
import './preview.css'
import { stairFlightOptions, type StairFlightId } from './stairFlightOptions'

const viewport = document.querySelector<HTMLElement>('#park-viewport')!
const loading = document.querySelector<HTMLElement>('#park-loading')!
const facilitySelect = document.querySelector<HTMLSelectElement>('#park-facility')!
const selection = document.querySelector<HTMLElement>('#park-selection')!
const fenceJumpButton = document.querySelector<HTMLButtonElement>('#park-fence-jump')!
const hint = document.querySelector<HTMLElement>('#park-hint')!
const views = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-park-view]'))
const profileQuery = new URLSearchParams(window.location.search)
const walkPreview = profileQuery.get('walk') === '1' && profileQuery.get('asset') === 'stairs'
const flightControl = document.querySelector<HTMLElement>('#park-stair-flight-control')!
const flightSelect = document.querySelector<HTMLSelectElement>('#park-stair-flight')!
if (walkPreview) {
  for (const [id, label] of Object.entries(stairFlightOptions)) flightSelect.append(new Option(label, id))
  const flight = profileQuery.get('flight') ?? 'monument'
  flightSelect.value = Object.hasOwn(stairFlightOptions, flight) ? flight : 'monument'
  flightControl.hidden = false
  flightSelect.disabled = true
  const facilityControl = facilitySelect.closest('label')
  if (facilityControl) facilityControl.hidden = true
  const viewControl = views[0]?.parentElement
  if (viewControl) viewControl.hidden = true
  flightSelect.addEventListener('change', () => {
    const id = flightSelect.value as StairFlightId
    const url = new URL(window.location.href)
    url.searchParams.set('flight', id)
    window.history.replaceState(null, '', url)
    window.dispatchEvent(new CustomEvent('park-stair-flight', { detail: id }))
    selection.textContent = stairFlightOptions[id]
    hint.textContent = id === 'monument' ? '계단 왕복 재생 · WASD 또는 방향키로 이동' : '캐릭터가 선택한 이동로를 왕복합니다'
  })
}
const pavilionFacilities = new Set(['island-pavilion', 'rest-1', 'rest-2', 'rest-3', 'rest-4'])
const pavilionProfile = document.querySelector<HTMLDetailsElement>('[data-render-profile="sub-pavilion-profile"]')!
let profileFacility: string | undefined
for (const panel of document.querySelectorAll<HTMLDetailsElement>('[data-render-profile]')) {
  const mode = profileQuery.get(panel.dataset.renderProfile!)
  if (mode === 'before' || mode === 'after') {
    panel.hidden = walkPreview
    if (panel.dataset.renderProfile === 'glb-profile') {
      profileFacility = setupRemainingGlbProfile(panel, profileQuery, mode)
    } else if (panel.dataset.renderProfile === 'facility-profile') {
      profileFacility = setupFacilityGlbProfile(panel, profileQuery, mode)
    } else if (panel.dataset.renderProfile === 'details-profile') {
      profileFacility = setupParkDetailGlbProfile(panel, profileQuery, mode)
    } else {
      profileFacility = panel.dataset.profileFacility
    }
    const location = profileQuery.get('location')
    if (panel === pavilionProfile && location && pavilionFacilities.has(location)) profileFacility = location
    panel.querySelector(`[data-profile-view="${mode}"]`)?.setAttribute('aria-current', 'page')
    break
  }
}

const districts = new Map<string, HTMLOptGroupElement>()
for (const facility of layout.facilities) {
  let district = districts.get(facility.district)
  if (!district) {
    district = document.createElement('optgroup')
    district.label = facility.district
    districts.set(facility.district, district)
    facilitySelect.append(district)
  }
  district.append(new Option(facility.name, facility.id))
}

facilitySelect.disabled = true
for (const button of views) button.disabled = true

try {
  const preview = await createParkPreview(viewport)
  let view: ParkView = 'overview'
  let jumpAttempt = 0
  facilitySelect.disabled = false
  flightSelect.disabled = false
  loading.remove()

  function updatePreview() {
    const facility = layout.facilities.find(item => item.id === facilitySelect.value)
    if (!pavilionProfile.hidden && facility && pavilionFacilities.has(facility.id)) {
      for (const link of pavilionProfile.querySelectorAll<HTMLAnchorElement>('a[data-profile-view]')) {
        const url = new URL(link.href)
        url.searchParams.set('location', facility.id)
        link.href = url.href
      }
    }
    jumpAttempt++
    fenceJumpButton.hidden = view !== 'overview' || (facility?.id !== 'fitness' && facility?.id !== 'jump')
    hint.textContent = walkPreview && facility?.id === 'pagoda' && view === 'overview'
      ? (flightSelect.value === 'monument' ? '계단 왕복 재생 · WASD 또는 방향키로 이동' : '캐릭터가 선택한 이동로를 왕복합니다')
      : '드래그로 회전 · 휠 또는 두 손가락으로 확대'
    preview.show(view, facility)
    if (walkPreview && view === 'overview' && facility?.id === 'pagoda') {
      selection.textContent = stairFlightOptions[flightSelect.value as StairFlightId]
      return
    }
    if (!facility) {
      selection.textContent = '전체 배치'
      return
    }
    const [x, y, z] = facility.position
    selection.textContent = `${facility.name} · X ${x.toFixed(1)} / Z ${z.toFixed(1)} · 높이 ${y.toFixed(1)}m`
  }

  for (const button of views) {
    button.disabled = false
    button.addEventListener('click', () => {
      view = button.dataset.parkView === 'plan' ? 'plan' : 'overview'
      for (const item of views) {
        item.setAttribute('aria-pressed', String(item === button))
      }
      updatePreview()
    })
  }
  facilitySelect.addEventListener('change', updatePreview)
  if (profileFacility) {
    facilitySelect.value = profileFacility
    updatePreview()
  }
  fenceJumpButton.addEventListener('click', () => {
    const facility = layout.facilities.find(item => item.id === facilitySelect.value)
    if (view !== 'overview' || (facility?.id !== 'fitness' && facility?.id !== 'jump')) return
    const attempt = ++jumpAttempt
    hint.textContent = '울타리 위로 점프하는 중…'
    preview.show(view, facility, {
      site: facility.id,
      attempt,
      onFinish: landedOnFence => {
        if (attempt === jumpAttempt) hint.textContent = landedOnFence ? '울타리 위에 착지했습니다.' : '울타리 옆 바닥에 착지했습니다.'
      },
    })
  })
} catch (error) {
  console.error('220m 공원 미리보기를 불러오지 못했습니다.', error)
  loading.textContent = '공원 지형을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'
}
