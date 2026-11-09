import { useCallback, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { JumpRopeHud } from './JumpRopeHud'
import { PreviewScene } from './PreviewScene'
import { advancePreviewMotion, createPreviewMotion, requestJump, type PreviewPass } from './previewMotion'
import { clearanceWindowMs } from './jumpRopeJudgement'
import './preview.css'

const defaults = {
  cameraAngle: 18,
  cameraDistance: 7,
  cameraHeight: 2.8,
  fov: 42,
  avatarX: 0,
  avatarZ: 0,
  avatarScale: 1,
  jumpHeight: 0.6,
  jumpDuration: 0.4,
  ropeWidth: 0.035,
  ropeSpeed: 1,
  ropeHeight: 0.7,
  ropeSag: 0.12,
  pigeonNod: 0.65,
  pigeonGap: 4.6,
  pigeonScale: 1,
  audience: false,
  perfectWindowMs: 50,
  clearanceMargin: 0.03,
}

export type PreviewSettings = typeof defaults
type NumberSetting = Exclude<keyof PreviewSettings, 'audience'>
type Slider = [key: NumberSetting, label: string, min: number, max: number, step: number, unit: string]

const controls: { title: string; sliders: Slider[] }[] = [
  { title: '카메라', sliders: [
    ['cameraAngle', '각도', -55, 55, 1, '°'],
    ['cameraDistance', '거리', 4, 12, 0.1, ' m'],
    ['cameraHeight', '높이', 0.8, 6, 0.1, ' m'],
    ['fov', 'FOV', 25, 75, 1, '°'],
  ] },
  { title: '아바타와 점프', sliders: [
    ['avatarX', '좌우 위치', -1.2, 1.2, 0.05, ' m'],
    ['avatarZ', '앞뒤 위치', -0.9, 0.9, 0.05, ' m'],
    ['avatarScale', '크기', 0.6, 1.5, 0.05, '×'],
    ['jumpHeight', '최고 높이', 0.2, 1.6, 0.05, ' m'],
    ['jumpDuration', '체공 시간', 0.25, 1.4, 0.05, '초'],
  ] },
  { title: '전깃줄과 비둘기', sliders: [
    ['ropeWidth', '줄 두께', 0.01, 0.12, 0.005, ' m'],
    ['ropeSpeed', '줄 회전 속도', 0, 3, 0.1, '회/초'],
    ['ropeHeight', '줄 곡률', 0.2, 1.5, 0.05, ''],
    ['ropeSag', '줄 처짐', 0, 0.26, 0.01, ' m'],
    ['pigeonNod', '고개 움직임', 0, 1.5, 0.05, '×'],
    ['pigeonGap', '비둘기 간격', 3, 6, 0.1, ' m'],
    ['pigeonScale', '비둘기 크기', 0.6, 1.6, 0.05, '×'],
  ] },
  { title: '판정 조정', sliders: [
    ['perfectWindowMs', 'PERFECT 오차', 0, 150, 5, ' ms'],
    ['clearanceMargin', '줄 위 여유 높이', 0, 0.2, 0.01, ' m'],
  ] },
]

const demoActions = {
  jump: '점프 테스트',
  perfect: 'PERFECT 시안',
  good: 'GOOD 시안',
  miss: 'MISS 시안',
  laugh: '비둘기 웃음 테스트',
  end: '종료 시안',
} as const

export type DemoAction = keyof typeof demoActions
export type Demo = { action: DemoAction; startedAt: number }

const readyHud = { seconds: 60, score: 0, combo: 0, chances: 3 }
const hudSamples = {
  jump: { ...readyHud, note: '점프 테스트' },
  perfect: { seconds: 42, score: 120, combo: 4, chances: 3, judgement: 'perfect' },
  good: { seconds: 36, score: 140, combo: 5, chances: 3, judgement: 'good' },
  miss: { seconds: 28, score: 140, combo: 0, chances: 2, judgement: 'miss' },
  laugh: { ...readyHud, note: '구구구!' },
  end: { seconds: 18, score: 140, combo: 0, chances: 0, note: '비둘기한테 졌습니다.' },
} as const

export function JumpRopePreview() {
  const [settings, setSettings] = useState(defaults)
  const [demo, setDemo] = useState<Demo | null>(null)
  const [motion] = useState(createPreviewMotion)
  const [ropePaused, setRopePaused] = useState(false)
  const [lastPass, setLastPass] = useState<PreviewPass | null>(null)
  const [visiblePass, setVisiblePass] = useState<PreviewPass | null>(null)
  const { jumpHeight, jumpDuration } = settings

  const step = useCallback((now: number, speed = ropePaused ? 0 : settings.ropeSpeed) => {
    const latest = advancePreviewMotion(motion, now, speed, settings).at(-1)
    if (!latest) return
    setLastPass(latest)
    setVisiblePass(latest)
  }, [motion, ropePaused, settings])

  useEffect(() => {
    if (!visiblePass) return
    const timeout = window.setTimeout(() => setVisiblePass(null), 750)
    return () => window.clearTimeout(timeout)
  }, [visiblePass])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== 'Space' || event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return
      if (event.target instanceof HTMLElement && event.target.closest(
        'button, input:not([type="range"]), textarea, select, a[href], [contenteditable="true"]',
      )) return
      event.preventDefault()
      if (!event.repeat) {
        const now = performance.now()
        step(now)
        requestJump(motion, now, jumpHeight, jumpDuration)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [motion, jumpHeight, jumpDuration, step])

  function startDemo(action: DemoAction) {
    const now = performance.now()
    step(now)
    if (action === 'jump' || action === 'perfect') requestJump(motion, now, jumpHeight, jumpDuration)
    setVisiblePass(null)
    setDemo({ action, startedAt: now })
  }

  function resetScene() {
    Object.assign(motion, createPreviewMotion())
    setDemo(null)
    setLastPass(null)
    setVisiblePass(null)
  }

  function toggleRope() {
    step(performance.now(), ropePaused ? settings.ropeSpeed : 0)
    setRopePaused(!ropePaused)
  }

  const windowMs = clearanceWindowMs(jumpHeight, jumpDuration * 1000, settings)
  const demoHud = demo && (!lastPass || demo.startedAt >= lastPass.at) ? hudSamples[demo.action] : readyHud

  return (
    <main className="preview">
      <header className="preview-header">
        <div>
          <p className="eyebrow">ONTOP / 개발 프리뷰</p>
          <h1>구구구 줄넘기</h1>
        </div>
        <p className="preview-tag">03 · 줄넘기 판정</p>
      </header>
      <div className="preview-layout">
        <section className="preview-stage" aria-label="3D 줄넘기 무대" tabIndex={0}>
          <Canvas
            camera={{ fov: defaults.fov, near: 0.1, far: 40 }}
            dpr={[1, 1.5]}
            fallback={<p className="canvas-fallback">이 브라우저에서 3D 화면을 열 수 없습니다.</p>}
          >
            <PreviewScene settings={settings} demo={demo} motion={motion} step={step} />
          </Canvas>
          <JumpRopeHud
            {...(visiblePass ? { ...readyHud, judgement: visiblePass.kind } : demoHud)}
            livePass={visiblePass?.number}
          />
        </section>
        <aside className="preview-panel" aria-label="실시간 조정 패널">
          <h2>실시간 조정</h2>
          <p className="panel-note">Space로 점프합니다. 높이와 체공 시간은 다음 점프부터 적용됩니다. HUD는 샘플 값입니다.</p>
          {controls.map(group => (
            <fieldset key={group.title}>
              <legend>{group.title}</legend>
              {group.sliders.map(([key, label, min, max, increment, unit]) => (
                <label className="slider" key={key}>
                  <span>{label}</span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={increment}
                    value={settings[key]}
                    onChange={event => {
                      const value = event.currentTarget.valueAsNumber
                      step(performance.now(), key === 'ropeSpeed' && !ropePaused ? value : undefined)
                      setSettings(current => ({ ...current, [key]: value }))
                    }}
                  />
                  <output>{settings[key]}{unit}</output>
                </label>
              ))}
              {group.title === '전깃줄과 비둘기' && (
                <label className="audience-toggle">
                  <input
                    type="checkbox"
                    checked={settings.audience}
                    onChange={event => {
                      const audience = event.currentTarget.checked
                      setSettings(current => ({ ...current, audience }))
                    }}
                  />
                  관중 비둘기 표시
                </label>
              )}
              {group.title === '판정 조정' && (
                <p className="panel-note">
                  {windowMs
                    ? `통과 ${Math.round(windowMs.latest)}~${Math.round(windowMs.earliest)}ms 전 입력으로 줄을 넘을 수 있습니다. PERFECT 중심은 ${Math.round(windowMs.ideal)}ms 전입니다.`
                    : '현재 점프 높이로는 줄을 넘을 수 없습니다.'}
                </p>
              )}
            </fieldset>
          ))}
          <fieldset>
            <legend>마지막 판정</legend>
            {lastPass ? (
              <div className="panel-note" aria-label="실제 판정 상세">
                <strong>{lastPass.number}번째 통과 · {lastPass.kind.toUpperCase()}</strong>
                <div>입력 → 통과 {lastPass.inputLeadMs === null ? '입력 없음' : `${Math.round(lastPass.inputLeadMs)}ms`}</div>
                <div>발 {lastPass.footHeight.toFixed(3)}m · 필요 {lastPass.requiredHeight.toFixed(3)}m</div>
              </div>
            ) : <p className="panel-note">아직 줄이 발밑을 통과하지 않았습니다.</p>}
          </fieldset>
          <div className="demo-actions" aria-label="연출 테스트">
            {(Object.keys(demoActions) as DemoAction[]).map(action => (
              <button key={action} type="button" onClick={() => startDemo(action)}>
                {demoActions[action]}
              </button>
            ))}
            <button type="button" onClick={toggleRope}>
              {ropePaused ? '줄 회전 재생' : '줄 회전 일시 정지'}
            </button>
            <button className="reset-button" type="button" onClick={resetScene}>게임 상태 초기화</button>
          </div>
        </aside>
      </div>
    </main>
  )
}
