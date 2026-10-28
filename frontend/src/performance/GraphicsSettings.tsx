import { useEffect, useRef, useState } from 'react'
import type { QualityPreset } from '../config/quality'
import { BgmVolumeControl } from '../audio/BgmVolumeControl'
import { QualityControl } from './QualityControl'
import { resetMetrics, summarizeFrames } from './metrics'
import './performance.css'

/** This panel reads the original probe; it never drives the render or network loop. */
export function GraphicsSettings({ quality, onQuality }: {
  quality: QualityPreset
  onQuality: (value: QualityPreset) => void
}) {
  const [open, setOpen] = useState(false)
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => {
    // Opened from the profile menu's 설정 item; focus returns to whatever opened it.
    const show = () => {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setOpen(true)
    }
    window.addEventListener('ontop-open-graphics-settings', show)
    return () => window.removeEventListener('ontop-open-graphics-settings', show)
  }, [])
  return open ? <GraphicsReport quality={quality} onQuality={onQuality} onClose={() => {
    setOpen(false)
    if (opener.current?.isConnected) opener.current.focus({ preventScroll: true })
  }} /> : null
}

function GraphicsReport({ quality, onQuality, onClose }: {
  quality: QualityPreset
  onQuality: (value: QualityPreset) => void
  onClose: () => void
}) {
  const [report, setReport] = useState(summarizeFrames)
  useEffect(() => {
    const read = () => setReport({ ...summarizeFrames(), ...(document.hidden ? { renderMode: 'paused' as const } : {}) })
    read()
    const timer = setInterval(() => { if (!document.hidden) read() }, 1000)
    document.addEventListener('visibilitychange', read)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', read) }
  }, [quality])
  const collecting = report.renderMode === 'continuous' && report.frames < 2
  const live = report.renderMode === 'continuous' && !collecting
  return <section id="park-graphics-settings" className="park-runtime-panel park-graphics-settings" aria-label="그래픽과 성능">
    <header><strong>그래픽과 성능</strong><button aria-label="그래픽 설정 닫기" onClick={onClose}>×</button></header>
    <QualityControl quality={quality} onQuality={onQuality} />
    <BgmVolumeControl />
    <p className="performance-hint">F1 설명서에서도 품질을 바꿀 수 있어요. 낮은 품질에서도 게임 규칙과 조작은 같아요.</p>
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
      <p>품질을 바꾸면 표본을 초기화해요. 기존 자동 해상도 조절에 따라 실제 렌더 해상도가 달라질 수 있어요.</p>
    </details>
    <button onClick={() => { resetMetrics(); setReport(summarizeFrames()) }}>측정 초기화</button>
  </section>
}
