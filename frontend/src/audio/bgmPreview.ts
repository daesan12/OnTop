// Dev-only page (bgm-preview.html): Vite serves it locally, the release build only bundles index.html.
import { BgmVolumeControl } from './BgmVolumeControl'
import { armUnlock, playBgm, playSting } from './bgm'
import type { BgmSting, BgmTrack } from './bgmScene'
import { playSfx, setSfxLoop, type SfxLoop, type SfxName } from './sfx'
import { createElement, Fragment } from 'react'
import { createRoot } from 'react-dom/client'

const groups: [string, [BgmTrack | BgmSting, string][]][] = [
  ['화면', [['title', '타이틀(로그인)'], ['onboarding', '온보딩']]],
  ['공원', [['park-day', '낮 07~16시'], ['park-dusk', '해질녘 16~19시'], ['park-night', '밤 19~07시']]],
  ['테이블·게임', [['lobby', '테이블 대기'], ['omok', '오목'], ['dice', '주사위 한 판'], ['onecard', '원카드'], ['bridge', '거짓말 다리']]],
  ['활동', [['bungeoppang', '붕어빵'], ['shop', '상점·옷장'], ['observatory', '전망대 망원경']]],
  ['결과 (1회)', [['victory', '승리'], ['defeat', '패배']]],
]
const effects: [string, [SfxName, string][]][] = [
  ['효과음 · 화면', [['ui-click', '버튼'], ['ui-manual', '설명서'], ['ui-equip', '착용'], ['coin-gain', '엽전 획득']]],
  ['효과음 · 게임', [['game-ready', '준비'], ['game-start', '시작'], ['game-turn', '내 차례'], ['dice-roll', '주사위 굴림'], ['card-draw', '카드 뽑기'], ['card-one', '원카드 선언']]],
  ['효과음 · 붕어빵', [['bungeo-pour', '반죽'], ['bungeo-flip', '뒤집기'], ['bungeo-burn', '탐']]],
  ['효과음 · 감정표현', [['emote-clap', '박수'], ['emote-tsk', '쯧쯧'], ['emote-fart', '방귀'], ['emote-wave-male', '인사(남)'], ['emote-wave-female', '인사(여)']]],
  ['효과음 · 이동', [['move-step-stone', '돌길 발소리'], ['move-step-grass', '잔디 발소리'], ['move-jump', '점프'], ['move-land', '착지'], ['move-splash', '입수'], ['amb-pigeon-takeoff', '비둘기']]],
]
const loopSounds: [SfxLoop, string][] = [['amb-fountain', '분수'], ['amb-pond', '연못'], ['dice-shake', '주사위 흔들기']]
const stings = new Set<string>(['victory', 'defeat'])
const root = document.getElementById('root')!
const now = document.getElementById('now')!

function section(title: string, buttons: [string, string, () => void][]) {
  const node = document.createElement('section')
  node.innerHTML = `<h2>${title}</h2>`
  for (const [name, label, run] of buttons) {
    const button = document.createElement('button')
    button.textContent = `${label} · ${name}`
    button.dataset.name = name
    button.onclick = () => run.call(button)
    node.append(button)
  }
  root.append(node)
}
for (const [title, tracks] of groups)
  section(title, tracks.map(([name, label]) => [name, label, function (this: HTMLButtonElement) {
    if (stings.has(name)) return playSting(name as BgmSting)
    playBgm(name as BgmTrack)
    now.textContent = label
    root.querySelectorAll('[data-bgm]').forEach(b => b.removeAttribute('aria-pressed'))
    this.dataset.bgm = ''
    this.setAttribute('aria-pressed', 'true')
  }]))
// Effects never open audio themselves; the first press opens it and plays a moment later.
const effect = (run: () => void) => { armUnlock(); setTimeout(run, 60) }
for (const [title, sounds] of effects)
  section(title, sounds.map(([name, label]) => [name, label, () => effect(() => playSfx(name))]))
section('반복 (누르면 켜기·끄기)', loopSounds.map(([name, label]) => [name, label, function (this: HTMLButtonElement) {
  const on = this.getAttribute('aria-pressed') !== 'true'
  this.setAttribute('aria-pressed', String(on))
  effect(() => setSfxLoop(name, on ? 1 : 0))
}]))
const volume = document.createElement('section')
root.append(volume)
createRoot(volume).render(createElement(Fragment, null,
  createElement(BgmVolumeControl), createElement(BgmVolumeControl, { kind: 'effects' })))
