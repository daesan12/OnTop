// Dev-only page (bgm-preview.html): Vite serves it locally, the release build only bundles index.html.
import { BgmVolumeControl } from './BgmVolumeControl'
import { playBgm, playSting } from './bgm'
import type { BgmSting, BgmTrack } from './bgmScene'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'

const groups: [string, [BgmTrack | BgmSting, string][]][] = [
  ['화면', [['title', '타이틀(로그인)'], ['onboarding', '온보딩']]],
  ['공원', [['park-day', '낮 07~16시'], ['park-dusk', '해질녘 16~19시'], ['park-night', '밤 19~07시']]],
  ['테이블·게임', [['lobby', '테이블 대기'], ['omok', '오목'], ['dice', '주사위 한 판'], ['onecard', '원카드'], ['bridge', '거짓말 다리']]],
  ['활동', [['bungeoppang', '붕어빵'], ['shop', '상점·옷장'], ['observatory', '전망대 망원경']]],
  ['결과 (1회)', [['victory', '승리'], ['defeat', '패배']]],
]
const stings = new Set<string>(['victory', 'defeat'])
const root = document.getElementById('root')!
const now = document.getElementById('now')!

for (const [title, tracks] of groups) {
  const section = document.createElement('section')
  section.innerHTML = `<h2>${title}</h2>`
  for (const [name, label] of tracks) {
    const button = document.createElement('button')
    button.textContent = `${label} · ${name}`
    button.onclick = () => {
      if (stings.has(name)) return playSting(name as BgmSting)
      playBgm(name as BgmTrack)
      now.textContent = label
      root.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)))
    }
    section.append(button)
  }
  root.append(section)
}
const volume = document.createElement('section')
root.append(volume)
createRoot(volume).render(createElement(BgmVolumeControl))
