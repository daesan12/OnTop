// Local manual diagnostic only. No application entry point imports this module.
import { localMovement } from '../../src/network/localMovementPrediction'
import { authoritativePose, useSession } from '../../src/network/worldClient'
import { parkRuntime } from '../../src/park/runtime/runtime'
import { clearRoamingInput } from '../../src/world/inputOwnership'
import { renderedMovementCamera, renderedMovementPose, observeMovementWrites } from '../e2e/sceneProbe'
import { installMovementAblation, type AblationMode } from './movementAblation'

let removePanel: (() => void) | undefined
export function installMovementPanel() {
  if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname))
    throw new Error('Movement panel is loopback development only')
  removePanel?.()
  let mode: AblationMode = 'baseline', experiment = installMovementAblation(localMovement, mode)
  const panel = document.createElement('div'), status = document.createElement('div')
  panel.style.cssText = 'position:fixed;z-index:10000;top:75px;left:50%;transform:translateX(-50%);background:#152532ee;color:white;padding:10px 14px;border-radius:10px;font:13px sans-serif;max-width:580px'
  const title = document.createElement('strong')
  title.textContent = '로컬 이동 원인 분리 · 테스트 전용'
  panel.append(title, status)
  const buttons: HTMLButtonElement[] = []
  const modes: [AblationMode, string][] = [['baseline', '기존'], ['no-offset', 'A: 표시 보정 끄기'], ['no-replay', 'B: A + 물리 재생 끄기']]
  const started = performance.now(), frames: unknown[] = [], keys: unknown[] = []
  const writes = observeMovementWrites()
  let frameId = 0, disposed = false
  const update = () => {
    const clientValidated = experiment.snapshot().motion?.authority === 'CLIENT_VALIDATED'
    status.textContent = `${clientValidated ? 'C: 로컬 이동 + 서버 좌표 검증' : modes.find(m => m[0] === mode)![1]} · ${localMovement.ready ? '준비됨' : '서버 확인 대기'} · Shift 달리기/좌우/점프 비교`
    warning.textContent = clientValidated
      ? '로컬 전용 검증 모드입니다. 승인 실패·보고 만료 시 기존 서버 이동으로 복귀합니다.'
      : 'B는 진단용이며 서버 위치와 어긋날 수 있어요. 전환 직후 초기화 구간은 비교에서 제외해 주세요.'
    buttons.forEach((button, index) => { button.disabled = clientValidated; button.style.background = modes[index]![0] === mode ? '#85c4ff' : '#eee' })
  }
  for (const [next, label] of modes) {
    const button = document.createElement('button')
    button.textContent = label; button.style.cssText = 'margin:7px 5px 3px 0;padding:7px;cursor:pointer'
    button.onclick = () => {
      clearRoamingInput()
      experiment.dispose(); localMovement.suspend()
      mode = next; experiment = installMovementAblation(localMovement, mode)
      parkRuntime.move(0, 0, false)
      document.querySelector<HTMLCanvasElement>('canvas')?.focus({ preventScroll: true })
      update()
    }
    buttons.push(button); panel.append(button)
  }
  const download = document.createElement('button')
  download.textContent = '최근 프레임 로그 저장'
  download.onclick = () => {
    const contents = [JSON.stringify({ kind: 'scope', scope: 'Loopback real Java movement + local login adapter. B is a test-only presentation bypass, not a server authority migration.', at: new Date().toISOString() }),
      ...keys.map(key => JSON.stringify({ kind: 'key', key })), ...frames.map(frame => JSON.stringify({ kind: 'frame', frame }))].join('\n')
    const url = URL.createObjectURL(new Blob([contents], { type: 'application/x-ndjson' })), link = document.createElement('a')
    link.href = url; link.download = 'ontop-movement-diagnostic.jsonl'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    document.querySelector<HTMLCanvasElement>('canvas')?.focus({ preventScroll: true })
  }
  panel.append(download)
  const warning = document.createElement('div')
  warning.textContent = 'B는 진단용이며 서버 위치와 어긋날 수 있어요. 전환 직후 초기화 구간은 비교에서 제외해 주세요.'
  warning.style.fontSize = '11px'; warning.style.marginTop = '4px'; panel.append(warning)
  document.body.append(panel)
  const key = (event: KeyboardEvent) => {
    if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) return
    keys.push({ at: performance.now() - started, type: event.type, code: event.code, repeat: event.repeat, mode })
    if (keys.length > 600) keys.shift()
  }
  window.addEventListener('keydown', key); window.addEventListener('keyup', key)
  const recordFrame = () => {
    if (disposed) return
    const at = performance.now(), display = renderedMovementPose(), probe = experiment.snapshot()
    if (display && writes.at() > 0) frames.push({ at: writes.at() - started, observedAt: at - started, mode, display, camera: renderedMovementCamera(), predicted: probe.predicted,
      intent: probe.intent, correction: { ...probe.correction, at: probe.correction.at - started }, motion: probe.motion,
      baselineReceivedAt: probe.baselineReceivedAt === null ? null : probe.baselineReceivedAt - started,
      // Resolve the preview identity at capture time without recording it.
      official: authoritativePose(useSession.getState().sessionId) })
    if (frames.length > 3000) frames.shift()
    frameId = requestAnimationFrame(recordFrame)
  }
  frameId = requestAnimationFrame(recordFrame)
  const timer = setInterval(update, 500); update()
  removePanel = () => {
    disposed = true; cancelAnimationFrame(frameId); clearInterval(timer); writes.dispose(); experiment.dispose(); panel.remove()
    window.removeEventListener('keydown', key); window.removeEventListener('keyup', key)
  }
  return removePanel
}
