import { createRoot } from 'react-dom/client'
import { StickResult } from '../../src/game/yutnori/StickResult'

let cleanup = () => {}
/** 무작위 서버 결과를 바꾸지 않고 실제 빽도 결과 컴포넌트의 모양만 확인한다. */
export function mountBackdoFixture() {
  if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('로컬 시각 검수 전용입니다.')
  cleanup()
  const box = document.createElement('aside')
  box.id = 'backdo-visual-fixture'; box.className = 'yut-shell'
  box.style.cssText = 'position:fixed;inset:20px auto auto 20px;z-index:9999;width:300px;background:#f4efde;color:#213c2d'
  document.body.append(box)
  const root = createRoot(box)
  root.render(<><strong>빽도 · 뒤로 1칸</strong><StickResult mask={1} /><p>평평한 면 1개 · 둥근 면 3개</p></>)
  cleanup = () => { root.unmount(); box.remove() }
}
export function removeBackdoFixture() { cleanup() }
