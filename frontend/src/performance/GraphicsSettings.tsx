import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { BgmVolumeControl } from '../audio/BgmVolumeControl'
import { useSession } from '../network/worldClient'
import { inputState } from '../world/inputOwnership'
import { LookSensitivityControl } from '../world/LookSensitivityControl'
import settingsIcon from '../features/parkMenus/icons/icon-settings.svg'
import { resetMetrics, summarizeFrames } from './metrics'
import './performance.css'

const useSettingsPanel = create<{ open: boolean }>(() => ({ open: false }))
// Focus goes back to whatever opened the panel: the dock button, or the canvas after O.
let opener: HTMLElement | null = null
function toggleSettings() {
  if (useSettingsPanel.getState().open) return closeSettings()
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  useSettingsPanel.setState({ open: true })
}
function closeSettings() {
  useSettingsPanel.setState({ open: false })
  if (opener?.isConnected) opener.focus({ preventScroll: true })
}
const canOpen = () => useSession.getState().status === 'connected' && !Object.values(inputState).some(Boolean)
  && !document.querySelector('dialog[open], [role="dialog"]')

/** 빠른 메뉴 slot; O does the same from anywhere in the park. */
export function SettingsLauncher() {
  const open = useSettingsPanel(s => s.open)
  return <button className="park-settings-launcher" type="button" aria-label="설정" aria-keyshortcuts="O"
    aria-controls="park-graphics-settings" aria-expanded={open} onClick={() => { if (open || canOpen()) toggleSettings() }}>
    <img src={settingsIcon} alt="" /><span>설정</span><kbd>O</kbd>
  </button>
}

/** This panel reads the original probe; it never drives the render or network loop. */
export function GraphicsSettings() {
  const open = useSettingsPanel(s => s.open)
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229
        || event.ctrlKey || event.metaKey || event.altKey) return
      const shown = useSettingsPanel.getState().open, target = event.target
      // Typing never toggles; Esc still closes from the panel's own sensitivity box.
      const typing = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      if (typing && !(event.code === 'Escape' && target.closest('#park-graphics-settings'))) return
      if (!(event.code === 'KeyO' && (shown || canOpen())) && !(event.code === 'Escape' && shown)) return
      event.preventDefault()
      toggleSettings()
    }
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('keydown', key); useSettingsPanel.setState({ open: false }) }
  }, [])
  return open ? <GraphicsReport onClose={closeSettings} /> : null
}

function GraphicsReport({ onClose }: { onClose: () => void }) {
  const [report, setReport] = useState(summarizeFrames)
  useEffect(() => {
    const read = () => setReport({ ...summarizeFrames(), ...(document.hidden ? { renderMode: 'paused' as const } : {}) })
    read()
    const timer = setInterval(() => { if (!document.hidden) read() }, 1000)
    document.addEventListener('visibilitychange', read)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', read) }
  }, [])
  const collecting = report.renderMode === 'continuous' && report.frames < 2
  const live = report.renderMode === 'continuous' && !collecting
  return <section id="park-graphics-settings" className="park-runtime-panel park-graphics-settings" aria-label="설정">
    <header><strong>설정</strong><button aria-label="설정 닫기" onClick={onClose}>×</button></header>
    <LookSensitivityControl />
    <BgmVolumeControl />
    <p className="performance-hint">O 키로 열고 닫아요.</p>
    <p className="performance-mode" role="status">{collecting ? '프레임 표본 수집 중' : report.renderMode === 'continuous' ? '실시간 측정 · WebGL 2' : '화면 렌더링 일시 정지'}</p>
    <dl className="performance-readings">
      <div><dt>FPS</dt><dd data-metric="fps">{live ? report.fps.toFixed(1) : '—'}</dd></div>
      <div><dt>프레임 간격 p95 / p99</dt><dd data-metric="percentiles">{live ? `${report.p95.toFixed(1)} / ${report.p99.toFixed(1)} ms` : '—'}</dd></div>
      <div><dt>최대 프레임 간격</dt><dd data-metric="max">{live ? `${report.max.toFixed(1)} ms` : '—'}</dd></div>
      <div><dt>측정 프레임 / 50ms 초과</dt><dd data-metric="frames">{report.frames.toLocaleString()} / {report.slowFrames.toLocaleString()}</dd></div>
      <div><dt>드로우콜 / 삼각형</dt><dd data-metric="draws">{report.drawCalls.toLocaleString()} / {report.triangles.toLocaleString()}</dd></div>
      <div><dt>형상 / 텍스처 개수</dt><dd data-metric="resources">{report.geometries.toLocaleString()} / {report.textures.toLocaleString()}</dd></div>
      <div><dt>렌더 해상도 / DPR</dt><dd data-metric="resolution">{report.width}×{report.height} / {report.dpr.toFixed(2)}</dd></div>
    </dl>
    <details><summary>측정 기준과 GPU 정보</summary>
      <p className="performance-gpu">{report.renderer}</p>
      <p>FPS·프레임 간격은 최근 최대 600프레임 기준이며 1초마다 갱신해요. 프레임 수와 50ms 초과 수는 초기화 이후 누적이에요.</p>
      <p>프레임 간격은 CPU·GPU 실행시간이 아니에요. 형상·텍스처는 개수이며 메모리 사용량이 아니에요. 네트워크 지연은 측정하지 않아요.</p>
      <p>자동 해상도 조절에 따라 실제 렌더 해상도가 달라질 수 있어요.</p>
    </details>
    <button onClick={() => { resetMetrics(); setReport(summarizeFrames()) }}>측정 초기화</button>
  </section>
}
