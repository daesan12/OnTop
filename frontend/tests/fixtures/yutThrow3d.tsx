import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { YutThrow3D } from '../../src/game/yutnori/YutThrow3D'
import { useThrowAnimation } from '../../src/game/yutnori/useThrowAnimation'
import type { YutThrow } from '../../src/game/yutnori/contracts'
import '../../src/game/yutnori/yutnori.css'
import '../../src/game/yutnori/yutFocus.css'

function ThrowFixture() {
  const [result, setResult] = useState<YutThrow | null>(null)
  const [mask, setMask] = useState(1)
  const presentation = useThrowAnimation('yut-throw-fixture', result)
  const toss = (out = false) => {
    const count = mask.toString(2).replaceAll('0', '').length
    const steps = out ? 0 : mask === 0 ? 5 : mask === 1 ? -1 : count
    setResult({ id: (result?.id ?? 0) + 1, mask, steps, name: out ? '낙' : mask === 1 ? '빽도' : ['모', '도', '개', '걸', '윷'][count],
      bonus: !out && steps >= 4, out, userId: '101', team: 0, at: Date.now() })
  }
  return <div className="yut-shell yut-shell--match" style={{ padding: 24, alignItems: 'center', overflow: 'auto' }}>
    <h1>3D 윷 던지기 컴포넌트 검수</h1><p>서버와 별개인 개발 전용 윷면 fixture</p>
    <div style={{ width: 'min(340px, 100%)' }}><YutThrow3D result={result} animating={presentation.rolling} expanded={presentation.expanded} waiting={false} /></div>
    <label>윷면 조합<select aria-label="윷면 조합" value={mask} onChange={event => setMask(Number(event.target.value))}>{Array.from({ length: 16 }, (_, value) => <option key={value} value={value}>{value}</option>)}</select></label>
    <div><button disabled={presentation.expanded} onClick={() => toss()}>던지기 연출</button><button disabled={presentation.expanded} onClick={() => toss(true)}>낙 연출</button></div>
    <label>입력 확인<input aria-label="입력 확인" /></label>
  </div>
}
const root = document.getElementById('yut-throw-test')
if (root && import.meta.env.DEV) createRoot(root).render(<ThrowFixture />)
