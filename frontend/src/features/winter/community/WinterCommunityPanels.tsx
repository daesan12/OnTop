import { useEffect, useRef, useState } from 'react'
import { PaperPopup } from '../../tableLobby/PaperPopup'
import { focusParkCanvas } from '../../../world/inputOwnership'
import { assembleSnowman, postTree, treePage, type Assembly } from './api'
import { closeWinterCommunity, useWinterCommunityPanel } from './panelState'
import { useWinterCommunity, type TreeMessage } from './state'
import './community.css'
import './treeLetters.css'
import { snowmanLayout } from './snowmanLayout'
import { TREE_ORNAMENTS, TREE_TARGET, type TreeOrnamentKind } from './ornaments'

const message = (error: unknown) => error instanceof Error ? error.message : '연결을 확인한 뒤 다시 시도해주세요.'
const rejected = (error: unknown) => !!error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' && error.status >= 400 && error.status < 500
function TreeLetters() {
  const status = useWinterCommunity(s => s.tree)
  const [letters, setLetters] = useState<TreeMessage[]>([]), [cursor, setCursor] = useState<number | null>(null)
  const [text, setText] = useState(''), [anonymous, setAnonymous] = useState(true)
  const [step, setStep] = useState<'choose' | 'write' | 'read'>('choose')
  const [ornament, setOrnament] = useState<TreeOrnamentKind | null>(null)
  const selected = TREE_ORNAMENTS.find(item => item.id === ornament)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [locked, setLocked] = useState(false), [loading, setLoading] = useState(false)
  const pending = useRef<{ text: string; anonymous: boolean; ornament: TreeOrnamentKind; id: string } | null>(null)
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
    if (!ornament) { setError('트리에 걸 장식을 먼저 골라주세요.'); return }
    const intent = pending.current ?? { text: text.trim(), anonymous, ornament, id: crypto.randomUUID() }
    if (!intent.text) { setError('트리에 걸 편지를 적어주세요.'); return }
    pending.current = intent; setLocked(true); setBusy(true); setError('')
    try {
      const receipt = await postTree(intent.text, intent.anonymous, intent.id, intent.ornament)
      if (!mounted.current) return
      setLetters(old => [receipt.message, ...old.filter(m => m.id !== receipt.message.id)])
      setText(''); setStep('read'); setOrnament(null)
      setNotice('편지와 장식을 트리에 걸었어요. 마음을 나눠줘서 고마워요!')
      pending.current = null; setLocked(false)
    } catch (e) {
      if (mounted.current) {
        if (rejected(e)) { pending.current = null; setLocked(false); setError(message(e)) }
        else setError(`${message(e)} 같은 편지는 ‘다시 확인하기’로 중복 없이 확인할 수 있어요.`)
      }
    }
    finally { if (mounted.current) setBusy(false) }
  }
  return <div className={`winter-community__body winter-tree-visit winter-tree-visit--${step}`} data-lit={!!status?.lit}>
    <div className="winter-tree-frame" aria-hidden="true"/>
    <div className="winter-tree-paper"><div className="winter-tree-paper__content">
    <div className="winter-community__intro"><h2>크리스마스 트리</h2><p>장식 하나에 마음 한 줄을 담아 걸어보세요.</p><div className="winter-tree-count"><span>함께 모은 편지 <strong>{status?.count ?? '…'}</strong> / {TREE_TARGET}</span><progress aria-label="트리 점등까지 모은 편지" max={TREE_TARGET} value={Math.min(status?.count ?? 0, TREE_TARGET)}/><small>{status?.lit ? '모두의 마음이 모여 트리가 빛나고 있어요.' : `${TREE_TARGET}개가 모이면 별과 전구가 빛나요`}</small></div></div>
    <nav className="winter-community__tabs" aria-label="트리 편지 메뉴">
      <button type="button" aria-current={step !== 'read' ? 'page' : undefined} disabled={busy || locked} onClick={() => setStep('choose')}>장식과 편지 남기기</button>
      <button type="button" aria-current={step === 'read' ? 'page' : undefined} disabled={busy || locked} onClick={() => setStep('read')}>우리의 편지 읽기</button>
    </nav>
    {step === 'choose' && <section className="winter-community__choose" aria-labelledby="winter-choose-title">
      <h3 id="winter-choose-title">1. 트리에 걸 장식을 골라주세요</h3>
      <div className="winter-community__ornaments">{TREE_ORNAMENTS.map(item => <button key={item.id} type="button" aria-pressed={ornament === item.id} onClick={() => setOrnament(item.id)}>
        <img src={item.image} alt="" /><span>{item.name}</span><small>{ornament === item.id ? '이 장식을 골랐어요' : '장식 선택하기'}</small>
      </button>)}</div>
      <button type="button" className="winter-community__primary" disabled={!ornament} onClick={() => setStep('write')}>이 장식으로 편지 쓰기</button>
    </section>}
    {step === 'write' && selected && <form onSubmit={e => { e.preventDefault(); void send() }}>
      <div className="winter-community__chosen"><img src={selected.image} alt="" /><div><small>함께 걸 장식</small><strong>{selected.name}</strong></div><button type="button" disabled={busy || locked} onClick={() => setStep('choose')}>장식 바꾸기</button></div>
      <h3>2. 장식에 담을 마음을 적어주세요</h3>
      <label htmlFor="winter-letter">나누고 싶은 이야기</label>
      <div className="winter-letter-sheet"><textarea id="winter-letter" autoFocus value={text} maxLength={300} disabled={busy || locked} onChange={e => setText(e.target.value)} placeholder="고마웠던 순간, 응원하고 싶은 마음을 적어주세요." rows={5} /><span aria-hidden="true">온탑에서, 마음을 담아</span></div>
      <small>{[...text].length} / 300자 · 편지는 모든 채널에 공개돼요.</small>
      <fieldset disabled={busy || locked}><legend>편지에 표시할 이름</legend><label><input type="radio" name="winter-name" checked={anonymous} onChange={() => setAnonymous(true)} /> 익명</label><label><input type="radio" name="winter-name" checked={!anonymous} onChange={() => setAnonymous(false)} /> 내 닉네임</label></fieldset>
      <button className="winter-community__primary" disabled={busy || !text.trim()}>{busy ? '편지를 확인하는 중…' : locked ? '다시 확인하기' : '트리에 편지 걸기'}</button>
    </form>}
    {!!notice && <p role="status">{notice}</p>}{!!error && <p role="alert">{error}</p>}
    {step === 'read' && <div className="winter-community__letters"><div className="winter-community__list-title"><h3>우리의 겨울 편지</h3><button disabled={loading} onClick={() => void load()}>새로 읽기</button></div>
      <div className="winter-letter-wall">{letters.map(letter => <article key={letter.id}><img src={TREE_ORNAMENTS.find(item => item.id === letter.ornament)?.image} alt=""/><small>{TREE_ORNAMENTS.find(item => item.id === letter.ornament)?.name}</small><p tabIndex={letter.text.length > 100 ? 0 : undefined}>{letter.text}</p><small>{letter.anonymous ? '익명의 친구' : letter.nickname} · {new Date(letter.createdAt).toLocaleDateString('ko-KR')}</small></article>)}</div>
      {!loading && !letters.length && <div className="winter-letter-empty"><span aria-hidden="true">✉</span><p>아직 비어 있는 가지에<br/>첫 번째 마음을 걸어주세요.</p></div>}
      <button type="button" className="winter-community__primary winter-letter-compose" onClick={() => setStep('choose')}>장식 고르고 편지 남기기</button>
      {cursor && <button disabled={loading} onClick={() => void load(cursor)}>{loading ? '불러오는 중…' : '이전 편지 더 읽기'}</button>}
      {loading && <p role="status">편지를 불러오는 중…</p>}
    </div>}
    </div></div>
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
  return <PaperPopup title="온탑의 겨울" label={kind === 'tree' ? '크리스마스 트리 편지' : '눈사람 꾸미기'} className={`winter-community${kind === 'tree' ? ' winter-tree-popup' : ''}`} closeLabel="겨울 이야기 닫기" onClose={() => { closeWinterCommunity(); focusParkCanvas() }}>
    {kind === 'tree' ? <TreeLetters /> : <SnowmanWorkshop />}
  </PaperPopup>
}
