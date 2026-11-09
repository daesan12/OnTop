import { useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { JumpRopeHud } from './JumpRopeHud'
import { PreviewScene } from './PreviewScene'
import { createPreviewMotion, requestJump } from './previewMotion'
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
  const { jumpHeight, jumpDuration } = settings

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== 'Space' || event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return
      if (event.target instanceof HTMLElement && event.target.closest(
        'button, input:not([type="range"]), textarea, select, a[href], [contenteditable="true"]',
      )) return
      event.preventDefault()
      if (!event.repeat) requestJump(motion, performance.now(), jumpHeight, jumpDuration)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [motion, jumpHeight, jumpDuration])

  function startDemo(action: DemoAction) {
    const now = performance.now()
    if (action === 'jump' || action === 'perfect') requestJump(motion, now, jumpHeight, jumpDuration)
    setDemo({ action, startedAt: now })
  }

  function resetScene() {
    Object.assign(motion, createPreviewMotion())
    setDemo(null)
  }

  return (
    <main className="preview">
      <header className="preview-header">
        <div>
          <p className="eyebrow">ONTOP / 개발 프리뷰</p>
          <h1>구구구 줄넘기</h1>
        </div>
        <p className="preview-tag">02 · 줄 회전과 점프</p>
      </header>
      <div className="preview-layout">
        <section className="preview-stage" aria-label="3D 줄넘기 무대" tabIndex={0}>
          <Canvas
            camera={{ fov: defaults.fov, near: 0.1, far: 40 }}
            dpr={[1, 1.5]}
            fallback={<p className="canvas-fallback">이 브라우저에서 3D 화면을 열 수 없습니다.</p>}
          >
            <PreviewScene settings={settings} demo={demo} motion={motion} ropePaused={ropePaused} />
          </Canvas>
          <JumpRopeHud {...(demo ? hudSamples[demo.action] : readyHud)} />
        </section>
        <aside className="preview-panel" aria-label="실시간 조정 패널">
          <h2>실시간 조정</h2>
          <p className="panel-note">Space로 점프합니다. 높이와 체공 시간은 다음 점프부터 적용됩니다. HUD는 샘플 값입니다.</p>
          {controls.map(group => (
            <fieldset key={group.title}>
              <legend>{group.title}</legend>
              {group.sliders.map(([key, label, min, max, step, unit]) => (
                <label className="slider" key={key}>
                  <span>{label}</span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={settings[key]}
                    onChange={event => {
                      const value = event.currentTarget.valueAsNumber
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
            </fieldset>
          ))}
          <div className="demo-actions" aria-label="연출 테스트">
            {(Object.keys(demoActions) as DemoAction[]).map(action => (
              <button key={action} type="button" onClick={() => startDemo(action)}>
                {demoActions[action]}
              </button>
            ))}
            <button type="button" onClick={() => setRopePaused(paused => !paused)}>
              {ropePaused ? '줄 회전 재생' : '줄 회전 일시 정지'}
            </button>
            <button className="reset-button" type="button" onClick={resetScene}>게임 상태 초기화</button>
          </div>
        </aside>
      </div>
    </main>
  )
}
