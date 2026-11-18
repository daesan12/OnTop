// What you see of the rules (horrorRules, S15P31B105-450): the note at the way in (a torn, stained page in a
// shaky hand), the lying notice at the top (clean, printed, a red stamp), a small button to read the note again
// (or R), the words that tell you which rule you just broke, and the red light (the whole view gone red).
// Plain DOM over the canvas, like the screamers; nothing here decides anything.

import { NOTE, RULES, TRAP_NOTE } from './horrorRules'

const STYLE_ID = 'horror-rules-style'
const CSS = `
.horror-note-back{position:fixed;inset:0;z-index:2147482900;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.78);animation:horror-note-in .35s ease-out}
.horror-note{position:relative;box-sizing:border-box;word-break:keep-all;overflow-wrap:break-word;width:min(460px,100%);max-height:calc(100vh - 32px);overflow:auto;padding:28px 26px 22px;color:#2b1d12;
  font-family:'Nanum Myeongjo','NanumMyeongjo','Batang','BatangChe','AppleMyungjo',serif;line-height:1.65;transform:rotate(-1.3deg);
  background:radial-gradient(circle at 82% 14%,rgba(110,60,20,.28) 0 7%,transparent 18%),radial-gradient(circle at 12% 88%,rgba(90,40,10,.22) 0 9%,transparent 22%),
  radial-gradient(ellipse at 50% 120%,rgba(60,0,0,.35),transparent 55%),linear-gradient(176deg,#e9dfc4,#d6c7a1 70%,#c8b48a);
  box-shadow:0 18px 60px rgba(0,0,0,.8),inset 0 0 50px rgba(80,50,10,.35);clip-path:polygon(0 1%,9% 0,22% 1.5%,40% 0,58% 1%,76% 0,92% 1.2%,100% 0,99% 22%,100% 48%,98.6% 74%,100% 100%,80% 98.8%,61% 100%,37% 98.6%,18% 100%,0 99%,1.2% 70%,0 41%,1% 18%)}
.horror-note h2{margin:0 0 10px;font-size:21px;letter-spacing:.06em;color:#3a0d08}
.horror-note p{margin:0 0 12px;font-size:14px}
.horror-note ol{margin:0 0 14px;padding-left:22px}
.horror-note li{margin:0 0 9px;font-size:15.5px}
.horror-note li:nth-child(odd){transform:rotate(.35deg)}
.horror-note li:nth-child(5){color:#6b0d06;font-weight:700}
.horror-note .sign{text-align:right;font-style:italic;font-size:13px;opacity:.8}
.horror-note button{display:block;margin:6px auto 0;padding:9px 26px;border:1px solid #4a2a14;border-radius:2px;background:rgba(60,30,10,.12);color:#2b1d12;font:inherit;font-size:14px;cursor:pointer}
.horror-note button:hover{background:rgba(60,30,10,.25)}
.horror-note.trap{transform:rotate(.6deg);clip-path:none;border-radius:2px;font-family:system-ui,'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#1d1d1d;
  background:linear-gradient(180deg,#f3f1ea,#e4e0d4);box-shadow:0 18px 60px rgba(0,0,0,.8)}
.horror-note.trap h2{color:#1d1d1d;border-bottom:2px solid #1d1d1d;padding-bottom:6px}
.horror-note.trap p{font-size:15px;margin:0 0 6px}
.horror-note .stamp{position:absolute;right:22px;top:20px;padding:4px 10px;border:3px solid rgba(170,20,20,.75);color:rgba(170,20,20,.8);font-weight:800;font-size:15px;transform:rotate(12deg);letter-spacing:.1em}
.horror-rules-btn{position:fixed;top:16px;right:16px;z-index:2147482800;padding:7px 12px;border:1px solid rgba(232,220,190,.35);border-radius:3px;background:rgba(20,14,8,.55);
  color:#e9dfc4;font:13px 'Nanum Myeongjo','Batang',serif;cursor:pointer}
.horror-rules-btn:hover{background:rgba(60,40,20,.7)}
.horror-broken{position:fixed;left:0;right:0;top:58%;z-index:2147483002;pointer-events:none;text-align:center;color:#c0170d;font:700 clamp(22px,5vw,40px) 'Nanum Myeongjo','Batang',serif;
  letter-spacing:.18em;text-shadow:0 0 18px rgba(0,0,0,.95),0 0 4px #000;animation:horror-broken 2.6s ease-out forwards}
.horror-redlight{position:fixed;inset:0;z-index:2147482700;pointer-events:none;opacity:0;transition:opacity .22s;mix-blend-mode:multiply;
  background:radial-gradient(ellipse at center,#ff3b22 30%,#7a0800 100%)}
.horror-redlight.on{opacity:.93}
@keyframes horror-note-in{from{opacity:0}to{opacity:1}}
@keyframes horror-broken{0%{opacity:0;transform:scale(1.25)}8%{opacity:1;transform:scale(1)}70%{opacity:1}100%{opacity:0}}
`
function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID; style.textContent = CSS
  document.head.appendChild(style)
}
const el = (tag: string, className = '', text = '') => { const e = document.createElement(tag); if (className) e.className = className; if (text) e.textContent = text; return e }

let open: { back: HTMLElement; close: () => void } | undefined
/** A note is open (the player is held while reading it). */
export const noteOpen = () => !!open

/** Show the note at the way in ('rules') or the notice at the top ('trap'); `onClose` once it is put away. */
export function openNote(kind: 'rules' | 'trap', onClose?: () => void) {
  if (typeof document === 'undefined') { onClose?.(); return }
  ensureStyle()
  open?.close()
  const back = el('div', 'horror-note-back'), paper = el('div', kind === 'trap' ? 'horror-note trap' : 'horror-note')
  if (kind === 'rules') {
    paper.append(el('h2', '', NOTE.title), el('p', '', NOTE.lead))
    const list = el('ol')
    for (const rule of RULES) list.append(el('li', '', rule))
    paper.append(list, el('p', 'sign', NOTE.sign))
  } else {
    paper.append(el('div', 'stamp', '공지'), el('h2', '', TRAP_NOTE.title))
    for (const line of TRAP_NOTE.lines) paper.append(el('p', '', line))
    paper.append(el('p', 'sign', TRAP_NOTE.sign))
  }
  const button = el('button', '', kind === 'rules' ? '기억했어요' : '확인') as HTMLButtonElement
  paper.append(button)
  back.append(paper)
  document.body.append(back)
  const key = (e: KeyboardEvent) => { if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') { e.preventDefault(); close() } }
  const close = () => {
    if (open?.back !== back) return
    open = undefined
    back.remove(); removeEventListener('keydown', key, true)
    onClose?.()
  }
  button.addEventListener('click', close)
  // Not straight away: the key that opened it (or a held one) must not close it in the same breath.
  setTimeout(() => { if (open?.back === back) addEventListener('keydown', key, true) }, 400)
  open = { back, close }
  button.focus({ preventScroll: true })
}
/** Put away whatever note is open, without its `onClose` mattering (leaving the underground). */
export function closeNote() { open?.close() }

let button: HTMLButtonElement | undefined
let onReread: (() => void) | undefined
const rereadKey = (e: KeyboardEvent) => {
  if (e.code !== 'KeyR' || e.repeat || open || !onReread || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
  onReread()
}
/** The small button (and R) to read the note again, shown while you are underground. */
export function rulesButton(visible: boolean, reread?: () => void) {
  if (typeof document === 'undefined') return
  if (!visible) { button?.remove(); button = undefined; onReread = undefined; removeEventListener('keydown', rereadKey); return }
  ensureStyle()
  onReread = reread
  if (button) return
  button = el('button', 'horror-rules-btn', '쪽지 다시 보기 (R)') as HTMLButtonElement
  button.addEventListener('click', () => onReread?.())
  document.body.append(button)
  addEventListener('keydown', rereadKey)
}

/** Which rule you just broke, scratched across the screen. */
export function brokenMark(rule: number, delay = 650) {
  if (typeof document === 'undefined') return
  ensureStyle()
  setTimeout(() => {
    const mark = el('div', 'horror-broken', `${rule}번 규칙을 어겼다`)
    document.body.append(mark)
    setTimeout(() => mark.remove(), 2700)
  }, delay)
}

let red: HTMLElement | undefined
/** The light gone red (rule 2), or back. */
export function redLight(on: boolean) {
  if (typeof document === 'undefined') return
  ensureStyle()
  if (!red) { red = el('div', 'horror-redlight'); document.body.append(red) }
  red.classList.toggle('on', on)
}
