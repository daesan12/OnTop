import { useEffect, useRef, useState } from 'react'
import { PaperPopup } from '../../tableLobby/PaperPopup'
import { focusParkCanvas } from '../../../world/inputOwnership'
import { assembleSnowman, postTree, treePage, type Assembly } from './api'
import { closeWinterCommunity, useWinterCommunityPanel } from './panelState'
import { useWinterCommunity, type TreeMessage } from './state'
import './community.css'
import { snowmanLayout } from './snowmanLayout'

const message = (error: unknown) => error instanceof Error ? error.message : '연결을 확인한 뒤 다시 시도해주세요.'
const rejected = (error: unknown) => !!error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' && error.status >= 400 && error.status < 500
function TreeLetters() {
  const status = useWinterCommunity(s => s.tree)
  const [letters, setLetters] = useState<TreeMessage[]>([]), [cursor, setCursor] = useState<number | null>(null)
  const [text, setText] = useState(''), [anonymous, setAnonymous] = useState(true)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [locked, setLocked] = useState(false), [loading, setLoading] = useState(false)
  const pending = useRef<{ text: string; anonymous: boolean; id: string } | null>(null)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const load = async (before?: number, signal?: AbortSignal) => {
    setLoading(true); setError('')
    try {
      const page = await treePage(before, signal)
      if (!mounted.current || signal?.aborted) return
      setLetters(old => before ? [...old, ...page.messages.filter(m => !old.some(x => x.id === m.id))] : page.messages)
      setCursor(page.nextBefore)
    } catch (e) { if (mounted.current && !signal?.aborted) setError(message(e)) }
    finally { if (mounted.current && !signal?.aborted) setLoading(false) }
  }
  useEffect(() => { const controller = new AbortController(); void load(undefined, controller.signal); return () => controller.abort() }, [])
  const send = async () => {
    if (busy) return
    const intent = pending.current ?? { text: text.trim(), anonymous, id: crypto.randomUUID() }
    if (!intent.text) { setError('트리에 걸 편지를 적어주세요.'); return }
    pending.current = intent; setLocked(true); setBusy(true); setError('')
    try {
      const receipt = await postTree(intent.text, intent.anonymous, intent.id)
      if (!mounted.current) return
      setLetters(old => [receipt.message, ...old.filter(m => m.id !== receipt.message.id)])
      setText(''); setNotice('편지를 트리에 걸었어요. 마음을 나눠줘서 고마워요!')
      pending.current = null; setLocked(false)
    } catch (e) {
      if (mounted.current) {
        if (rejected(e)) { pending.current = null; setLocked(false); setError(message(e)) }
        else setError(`${message(e)} 같은 편지는 ‘다시 확인하기’로 중복 없이 확인할 수 있어요.`)
      }
    }
    finally { if (mounted.current) setBusy(false) }
  }
  return <div className="winter-community__body">
    <div className="winter-community__intro"><span aria-hidden="true">✧</span><h2>트리에 마음을 걸어요</h2><p>한 학기 동안 수고한 우리에게, 앞으로의 날을 향한 한마디.</p><small>공원 전체가 함께 나누는 편지 {status?.count ?? '…'}개 {status?.lit ? '· 함께 밝힌 트리' : ''}</small></div>
    <form onSubmit={e => { e.preventDefault(); void send() }}>
      <label htmlFor="winter-letter">나누고 싶은 이야기</label>
      <textarea id="winter-letter" value={text} maxLength={300} disabled={busy || locked} onChange={e => setText(e.target.value)} placeholder="고마웠던 순간, 응원하고 싶은 마음을 적어주세요." rows={3} />
      <small>{[...text].length} / 300자 · 편지는 모든 채널에 공개돼요.</small>
      <fieldset disabled={busy || locked}><legend>편지에 표시할 이름</legend><label><input type="radio" name="winter-name" checked={anonymous} onChange={() => setAnonymous(true)} /> 익명</label><label><input type="radio" name="winter-name" checked={!anonymous} onChange={() => setAnonymous(false)} /> 내 닉네임</label></fieldset>
      <button className="winter-community__primary" disabled={busy || !text.trim()}>{busy ? '편지를 확인하는 중…' : locked ? '다시 확인하기' : '트리에 편지 걸기'}</button>
    </form>
    {!!notice && <p role="status">{notice}</p>}{!!error && <p role="alert">{error}</p>}
    <div className="winter-community__letters"><div className="winter-community__list-title"><h3>우리의 겨울 편지</h3><button disabled={loading} onClick={() => void load()}>새로 읽기</button></div>
      {letters.map(letter => <article key={letter.id}><p>{letter.text}</p><small>{letter.anonymous ? '익명의 친구' : letter.nickname} · {new Date(letter.createdAt).toLocaleDateString('ko-KR')}</small></article>)}
      {!loading && !letters.length && <p>첫 번째 편지를 기다리고 있어요.</p>}
      {cursor && <button disabled={loading} onClick={() => void load(cursor)}>{loading ? '불러오는 중…' : '이전 편지 더 읽기'}</button>}
      {loading && <p role="status">편지를 불러오는 중…</p>}
    </div>
  </div>
}

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
  return <PaperPopup title="온탑의 겨울" label={kind === 'tree' ? '크리스마스 트리 편지' : '눈사람 꾸미기'} className="winter-community" closeLabel="겨울 이야기 닫기" onClose={() => { closeWinterCommunity(); focusParkCanvas() }}>
    {kind === 'tree' ? <TreeLetters /> : <SnowmanWorkshop />}
  </PaperPopup>
}
