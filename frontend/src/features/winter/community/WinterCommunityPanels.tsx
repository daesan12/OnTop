import { useEffect, useRef, useState } from 'react'
import { PaperPopup } from '../../tableLobby/PaperPopup'
import { focusParkCanvas } from '../../../world/inputOwnership'
import { assembleSnowman, type Assembly } from './api'
import { closeWinterCommunity, useWinterCommunityPanel } from './panelState'
import './community.css'
import { TreeLetters } from './TreeLetters'
import { snowmanLayout } from './snowmanLayout'

const message = (error: unknown) => error instanceof Error ? error.message : '연결을 확인한 뒤 다시 시도해주세요.'
const rejected = (error: unknown) => !!error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' && error.status >= 400 && error.status < 500
function SnowmanWorkshop() {
  const workshop = useWinterCommunityPanel(s => s.workshop)!
  const [name, setName] = useState('우리의 눈사람'), [hat, setHat] = useState<Assembly['hat']>('BEANIE')
  const [scarf, setScarf] = useState<Assembly['scarf']>('RED'), [face, setFace] = useState<Assembly['face']>('SMILE')
  const [point, setPoint] = useState(0), [busy, setBusy] = useState(false), [locked, setLocked] = useState(false), [error, setError] = useState('')
  const pending = useRef<Assembly | null>(null)
  useEffect(() => { useWinterCommunityPanel.setState({ preview: { ...workshop.points[point]!, yaw: 0, name, hat, scarf, face } }) }, [workshop, point, name, hat, scarf, face])
  const finish = async () => {
    if (busy) return
    const intent = pending.current ?? { ...workshop.points[point]!, ballIds: workshop.ids, yaw: 0, name, hat, scarf, face, operationId: crypto.randomUUID() }
    pending.current = intent; setLocked(true); setBusy(true); setError('')
    try {
      await assembleSnowman(intent)
      const current = useWinterCommunityPanel.getState()
      if (current.kind === 'snowman' && current.workshop === workshop) { closeWinterCommunity(); focusParkCanvas() }
    }
    catch (e) {
      if (rejected(e)) { pending.current = null; setLocked(false); setError(message(e)) }
      else setError(`${message(e)} 같은 요청으로 다시 확인하면 중복 제작되지 않아요.`)
    }
    finally { setBusy(false) }
  }
  return <div className="winter-community__body"><div className="winter-community__intro"><span aria-hidden="true">☃</span><h2>함께 만든 눈사람</h2><p>모아 온 눈덩이 세 개에 우리만의 표정을 더해요.</p></div>
    <form onSubmit={e => { e.preventDefault(); void finish() }}><fieldset disabled={busy || locked} className="winter-community__custom">
      <label>눈사람 이름<input value={name} onChange={e => setName(e.target.value)} maxLength={40} /></label>
      <label>모자<select value={hat} onChange={e => setHat(e.target.value as Assembly['hat'])}><option value="BEANIE">포근한 털모자</option><option value="TOP_HAT">멋쟁이 실크햇</option><option value="NONE">모자 없이</option></select></label>
      <label>목도리<select value={scarf} onChange={e => setScarf(e.target.value as Assembly['scarf'])}><option value="RED">빨강</option><option value="GREEN">초록</option><option value="BLUE">파랑</option><option value="GOLD">금빛</option></select></label>
      <label>표정<select value={face} onChange={e => setFace(e.target.value as Assembly['face'])}><option value="SMILE">활짝 웃음</option><option value="WINK">장난스러운 윙크</option></select></label>
      <label>놓을 자리<select value={point} onChange={e => setPoint(Number(e.target.value))}>{workshop.points.map((_, i) => <option key={i} value={i}>미리보기 자리 {i + 1}</option>)}</select></label>
    </fieldset><p>높이 약 {snowmanLayout(workshop.base, workshop.middle, workshop.head).height.toFixed(1)}m · 이 채널에 오래 남아요.</p>
      <button className="winter-community__primary" disabled={busy || !name.trim()}>{busy ? '눈사람을 세우는 중…' : locked ? '같은 눈사람 다시 확인하기' : '이 자리에서 완성하기'}</button>
    </form>{!!error && <p role="alert">{error}</p>}<small>다른 친구와 눈사람이 있는 자리는 피해서 놓아주세요. 한 채널에 최대 12개까지 함께 만들 수 있어요.</small>
  </div>
}

export function WinterCommunityPanels() {
  const kind = useWinterCommunityPanel(s => s.kind)
  if (!kind) return null
  return <PaperPopup title="온탑의 겨울" label={kind === 'tree' ? '크리스마스 트리 편지' : '눈사람 꾸미기'} className={`winter-community${kind === 'tree' ? ' winter-tree-popup' : ''}`} closeLabel="겨울 이야기 닫기" onClose={() => { closeWinterCommunity(); focusParkCanvas() }}>
    {kind === 'tree' ? <TreeLetters /> : <SnowmanWorkshop />}
  </PaperPopup>
}
