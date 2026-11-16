import { setXRComfort, useXRComfort, XR_EYE_HEIGHTS, type XRComfortSettings } from './comfort'

export function XRComfortFields() {
  const s = useXRComfort(v => v.settings)
  return <section className="park-xr-comfort" aria-label="VR 편안함 설정">
    <label>회전 방식<select value={s.turnMode} onChange={e => setXRComfort({ turnMode: e.target.value as XRComfortSettings['turnMode'] })}>
      <option value="smooth">부드러운 회전</option><option value="snap">스냅 회전</option>
    </select></label>
    {s.turnMode === 'smooth' ? <label>회전 속도<select value={s.turnSpeed} onChange={e => setXRComfort({ turnSpeed: Number(e.target.value) as XRComfortSettings['turnSpeed'] })}>
      {[60, 90, 120].map(v => <option key={v} value={v}>{v}도/초</option>)}
    </select></label> : <label>스냅 각도<select value={s.snapAngle} onChange={e => setXRComfort({ snapAngle: Number(e.target.value) as XRComfortSettings['snapAngle'] })}>
      {[30, 45].map(v => <option key={v} value={v}>{v}도</option>)}
    </select></label>}
    <label>플레이 자세<select value={s.posture} onChange={e => setXRComfort({ posture: e.target.value as XRComfortSettings['posture'] })}>
      <option value="standing">서서 플레이</option><option value="seated">앉아서 플레이</option>
    </select></label>
    {s.posture === 'seated' ? <label>앉기 모드 기준 눈높이<select value={s.seatedEyeHeight} onChange={e => setXRComfort({ seatedEyeHeight: Number(e.target.value) as XRComfortSettings['seatedEyeHeight'] })}>
      {XR_EYE_HEIGHTS.map(v => <option key={v} value={v}>{v}m</option>)}
    </select></label> : null}
    <p>서기 모드는 Quest의 실제 바닥·눈높이를 사용해요. 앉기 모드는 선택한 눈높이에 맞춰요. 고개를 숙이거나 움직이는 동작은 그대로 반영돼요.</p>
    <p>VR 진입 시 현재 자세로 맞춰요. 자세를 바꾸면 X 안내판 → 편안함 설정 → 눈높이 재설정을 선택하세요.</p>
  </section>
}
