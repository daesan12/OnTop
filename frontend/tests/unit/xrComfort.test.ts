import { afterEach, expect, it, vi } from 'vitest'
import { DEFAULT_XR_COMFORT, parseXRComfort, requestXRHeightReset, setXRComfort, useXRComfort,
  XRHeightCalibration } from '../../src/features/parkXR/comfort'

afterEach(() => {
  useXRComfort.setState({ settings: { ...DEFAULT_XR_COMFORT }, heightRevision: 0, heightNotice: '' })
  vi.unstubAllGlobals()
})
it('저장된 설정은 허용된 값만 복원하고 잘못된 자료는 기본값으로 복구한다', () => {
  expect(parseXRComfort({ turnMode: 'snap', turnSpeed: 120, snapAngle: 45, posture: 'seated', seatedEyeHeight: 1.8 }))
    .toEqual({ turnMode: 'snap', turnSpeed: 120, snapAngle: 45, posture: 'seated', seatedEyeHeight: 1.8 })
  expect(parseXRComfort({ posture: 'standing', seatedEyeHeight: 1.6 }))
    .toMatchObject({ posture: 'standing', seatedEyeHeight: 1.6 })
  expect(parseXRComfort({ posture: 'seated', seatedEyeHeight: 1.6 }))
    .toMatchObject({ posture: 'seated', seatedEyeHeight: 1.6 })
  for (const value of [null, 'bad', { turnMode: 'spin', turnSpeed: Infinity, snapAngle: 360,
    posture: 'auto', seatedEyeHeight: -1 }]) expect(parseXRComfort(value)).toEqual(DEFAULT_XR_COMFORT)
})
it('저장이 차단되어도 선택과 재설정 요청을 유지하고 측정한 머리 위치는 저장하지 않는다', () => {
  const setItem = vi.fn((_key: string, _value: string) => { throw new Error('blocked') })
  vi.stubGlobal('localStorage', { setItem })
  setXRComfort({ posture: 'standing', turnMode: 'snap' })
  expect(useXRComfort.getState().settings.posture).toBe('standing')
  expect(useXRComfort.getState().heightRevision).toBe(1)
  requestXRHeightReset()
  expect(useXRComfort.getState().heightRevision).toBe(2)
  const saved = JSON.parse(setItem.mock.calls[0]![1] as string)
  expect(Object.keys(saved).sort()).toEqual(Object.keys(DEFAULT_XR_COMFORT).sort())
})
it('좌식 보정은 기준 눈높이로 맞추되 이후 고개 숙임과 점프 높이를 그대로 반영한다', () => {
  const calibration = new XRHeightCalibration(), settings = parseXRComfort(null)
  expect(calibration.calibrate(1.0, settings)).toBe(true)
  expect(1.0 + calibration.offset).toBeCloseTo(1.8)
  expect(.8 + calibration.offset).toBeCloseTo(1.6)
  const platformTop = 7
  expect(platformTop + 1 + calibration.offset).toBeCloseTo(8.8)
  expect(calibration.calibrate(1.2, settings)).toBe(true)
  expect(1.2 + calibration.offset).toBeCloseTo(1.8)
  expect(calibration.calibrate(1.75, { ...settings, posture: 'standing' })).toBe(true)
  expect(calibration.offset).toBe(0)
})
it('잘못된 추적 높이는 기존 보정을 유지하고 새 세션에는 이전 측정값을 남기지 않는다', () => {
  const calibration = new XRHeightCalibration()
  calibration.calibrate(1, DEFAULT_XR_COMFORT)
  for (const value of [NaN, Infinity, 0, -1, 5]) {
    expect(calibration.calibrate(value, DEFAULT_XR_COMFORT)).toBe(false)
    expect(calibration.offset).toBeCloseTo(.8)
  }
  calibration.reset(); expect(calibration.offset).toBe(0)
})
