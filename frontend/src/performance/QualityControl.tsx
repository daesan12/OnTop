import { QUALITY_PRESETS, type QualityPreset } from '../config/quality'

/** Both the original F1 utility row and the existing park control share one value. */
export function QualityControl({ quality, onQuality }: {
  quality: QualityPreset
  onQuality: (value: QualityPreset) => void
}) {
  return <label>그래픽{' '}
    <select aria-label="그래픽 품질" value={quality} onChange={event => {
      const value = event.target.value
      if (value === 'low' || value === 'medium' || value === 'high') onQuality(value)
    }}>
      {Object.entries(QUALITY_PRESETS).map(([value, preset]) => <option key={value} value={value}>{preset.label}</option>)}
    </select>
  </label>
}
