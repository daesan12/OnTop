import { useEffect } from 'react'
import type { QualityPreset } from '../../config/quality'
import { startBehaviorReporting } from './reporter'

/** 화면에는 아무것도 그리지 않는다. 공원 페이지에 한 번 둔다. */
export function BehaviorReporter({ quality }: { quality: QualityPreset }) {
  useEffect(() => startBehaviorReporting(quality), [quality])
  return null
}
