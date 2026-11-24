import { useEffect, useRef, useState } from 'react'
import { postTree, treePage } from './api'
import { useWinterCommunity, type TreeMessage } from './state'
import { TREE_ORNAMENTS, TREE_TARGET, type TreeOrnamentKind } from './ornaments'
import treeIllustration from './ui-art/tree-illustration.webp'
import stocking from './ui-art/stocking-photo.webp'
import bauble from './ui-art/bauble-photo.webp'
import bell from './ui-art/bell-photo.webp'
import gift from './ui-art/gift-photo.webp'
import './treeVisit.css'

// Selection photographs belong to this 2D screen; the park keeps its existing models and previews.
const ornamentPhotos: Record<TreeOrnamentKind, string> = { STOCKING: stocking, BAUBLE: bauble, BELL: bell, GIFT: gift }

const errorMessage = (error: unknown) => error instanceof Error ? error.message : '연결을 확인한 뒤 다시 시도해주세요.'
const rejected = (error: unknown) => !!error && typeof error === 'object' && 'status' in error
  && typeof error.status === 'number' && error.status >= 400 && error.status < 500

function LetterComposer({ ornament, text, anonymous, busy, locked, error, onText, onAnonymous, onSend, onClose }: {
  ornament: typeof TREE_ORNAMENTS[number]; text: string; anonymous: boolean; busy: boolean; locked: boolean; error: string
  onText: (text: string) => void; onAnonymous: (anonymous: boolean) => void; onSend: () => void; onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    if (!area.current?.disabled) area.current?.focus({ preventScroll: true })
    return () => element.close()
  }, [])
  return <dialog ref={dialog} className="winter-letter-dialog" aria-label="트리에 편지 쓰기"
    onCancel={event => { event.preventDefault(); if (!busy) onClose() }} onKeyDown={event => {
      event.stopPropagation()
      if (event.key !== 'Tab') return
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),textarea:not(:disabled),input:not(:disabled)')]
        .filter(element => element.getClientRects().length)
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
        event.preventDefault(); last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}>
    <header className="winter-letter-dialog__header">
      <div><small>크리스마스 트리 편지</small><h2>트리에 보내는 편지</h2></div>
      <button type="button" aria-label="편지 작성 닫기" disabled={busy} onClick={onClose}>×</button>
    </header>
    <form onSubmit={event => { event.preventDefault(); onSend() }}>
      <div className="winter-letter-dialog__ornament"><img src={ornamentPhotos[ornament.id]} alt=""/><span>{ornament.name}에 걸 편지</span></div>
      <label htmlFor="winter-letter">나누고 싶은 이야기</label>
      <textarea ref={area} id="winter-letter" autoFocus value={text} maxLength={300} disabled={busy || locked}
        onChange={event => onText(event.target.value)} placeholder="함께해서 고마웠어. 앞으로도 늘 응원할게!" rows={5}/>
      <small className="winter-letter-dialog__counter">{[...text].length} / 300자</small>
      <fieldset disabled={busy || locked}><legend>편지에 표시할 이름</legend>
        <label><input type="radio" name="winter-name" checked={anonymous} onChange={() => onAnonymous(true)}/> 익명</label>
        <label><input type="radio" name="winter-name" checked={!anonymous} onChange={() => onAnonymous(false)}/> 내 닉네임</label>
      </fieldset>
      <p className="winter-letter-dialog__public">작성한 편지는 모든 채널에서 볼 수 있어요.</p>
      {!!error && <p role="alert">{error}</p>}
      <button type="submit" className="winter-letter-dialog__send" disabled={busy || !text.trim()}>
        {busy ? '편지를 확인하는 중…' : locked ? '다시 확인하기' : '트리에 편지 걸기'}
      </button>
    </form>
  </dialog>
}

export function TreeLetters() {
  const status = useWinterCommunity(state => state.tree)
  const [letters, setLetters] = useState<TreeMessage[]>([]), [cursor, setCursor] = useState<number | null>(null)
  const [text, setText] = useState(''), [anonymous, setAnonymous] = useState(true)
  const [view, setView] = useState<'decorate' | 'read'>('decorate')
  const [ornament, setOrnament] = useState<TreeOrnamentKind | null>(null), [composing, setComposing] = useState(false)
  const [busy, setBusy] = useState(false), [locked, setLocked] = useState(false), [loading, setLoading] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const pending = useRef<{ text: string; anonymous: boolean; ornament: TreeOrnamentKind; id: string } | null>(null)
  const mounted = useRef(true)
  const trigger = useRef<HTMLButtonElement | null>(null), tabs = useRef<HTMLElement | null>(null)
  const wasComposing = useRef(false)
  const selected = TREE_ORNAMENTS.find(item => item.id === ornament)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    if (wasComposing.current && !composing) {
      const target = trigger.current?.isConnected && !trigger.current.disabled ? trigger.current
        : tabs.current?.querySelector<HTMLButtonElement>('button[aria-current=page]')
      target?.focus({ preventScroll: true })
    }
    wasComposing.current = composing
  }, [composing])
  const load = async (before?: number, signal?: AbortSignal) => {
    setLoading(true); setError('')
    try {
      const page = await treePage(before, signal)
      if (!mounted.current || signal?.aborted) return
      setLetters(old => before ? [...old, ...page.messages.filter(letter => !old.some(item => item.id === letter.id))] : page.messages)
      setCursor(page.nextBefore)
    } catch (failure) { if (mounted.current && !signal?.aborted) setError(errorMessage(failure)) }
    finally { if (mounted.current && !signal?.aborted) setLoading(false) }
  }
  useEffect(() => { const controller = new AbortController(); void load(undefined, controller.signal); return () => controller.abort() }, [])
  const choose = (kind: TreeOrnamentKind, button: HTMLButtonElement) => {
    if (busy || locked && ornament !== kind) return
    trigger.current = button
    setOrnament(kind); setComposing(true); if (!locked) setError('')
  }
  const send = async () => {
    if (busy || !ornament) return
    const intent = pending.current ?? { text: text.trim(), anonymous, ornament, id: crypto.randomUUID() }
    if (!intent.text) { setError('트리에 걸 편지를 적어주세요.'); return }
    pending.current = intent; setLocked(true); setBusy(true); setError('')
    try {
      const receipt = await postTree(intent.text, intent.anonymous, intent.id, intent.ornament)
      if (!mounted.current) return
      setLetters(old => [receipt.message, ...old.filter(letter => letter.id !== receipt.message.id)])
      setText(''); setComposing(false); setView('read'); setOrnament(null)
      setNotice('편지와 장식을 트리에 걸었어요. 마음을 나눠줘서 고마워요!')
      pending.current = null; setLocked(false)
    } catch (failure) {
      if (mounted.current) {
        if (rejected(failure)) { pending.current = null; setLocked(false); setError(errorMessage(failure)) }
        else setError(`${errorMessage(failure)} 같은 편지는 ‘다시 확인하기’로 중복 없이 확인할 수 있어요.`)
      }
    } finally { if (mounted.current) setBusy(false) }
  }
  return <>
    <main className="winter-tree-visit" aria-label="크리스마스 트리 꾸미기">
      <figure className="winter-tree-illustration"><img src={treeIllustration} alt="별과 전구, 양말과 선물로 장식된 크리스마스 트리"/></figure>
      <section className="winter-tree-panel">
        <header className="winter-tree-heading"><h2>크리스마스 트리</h2><p>장식 하나에 마음 한 줄을 담아 걸어보세요.</p></header>
        <section className="winter-tree-count" aria-label="함께 모은 편지">
          <div><span>함께 모은 편지</span><strong>{status?.count ?? '…'}<small> / {TREE_TARGET}</small></strong></div>
          <p>{status?.lit ? <b>마음이 모여 별과 전구가 빛나고 있어요.</b> : <><b>{TREE_TARGET}개의 편지</b>가 모이면 별과 전구가 빛나요.</>}</p>
          <progress aria-label="트리 점등까지 모은 편지" max={TREE_TARGET} value={Math.min(status?.count ?? 0, TREE_TARGET)}/>
        </section>
        <nav ref={tabs} className="winter-tree-tabs" aria-label="트리 편지 메뉴">
          <button type="button" aria-current={view === 'decorate' ? 'page' : undefined} onClick={() => { setView('decorate'); setNotice('') }}>장식 고르기</button>
          <button type="button" aria-current={view === 'read' ? 'page' : undefined} onClick={() => setView('read')}>편지 읽기</button>
        </nav>
        <div className="winter-tree-panel__body">
          {!!notice && <p role="status">{notice}</p>}{!composing && !!error && <p role="alert">{error}</p>}
          {view === 'decorate' ? <section className="winter-tree-selection" aria-labelledby="winter-choose-title">
            <div className="winter-tree-section-title"><h3 id="winter-choose-title">트리에 걸 장식을 골라주세요</h3><p>누르면 편지를 쓸 수 있어요.</p></div>
            <div className="winter-tree-ornaments">{TREE_ORNAMENTS.map(item => {
              const count = status?.ornaments.filter(placed => placed.ornament === item.id).length ?? 0
              return <button key={item.id} type="button" disabled={!status || busy || locked && ornament !== item.id} onClick={event => choose(item.id, event.currentTarget)}>
                <img src={ornamentPhotos[item.id]} alt=""/><span><strong>{item.name}</strong><small>트리에 {count}개 걸려 있어요</small></span>
              </button>
            })}</div>
            <small className="winter-tree-selection__hint">장식별 개수는 현재 트리에 보이는 최근 50개의 편지 기준이에요.</small>
          </section> : <section className="winter-tree-letters" aria-label="우리의 겨울 편지">
            <div className="winter-tree-section-title"><h3>우리의 겨울 편지</h3><button type="button" disabled={loading} onClick={() => void load()}>새로 읽기</button></div>
            {letters.map(letter => <article key={letter.id}><img src={ornamentPhotos[letter.ornament]} alt=""/>
              <p>{letter.text}</p><small>{letter.anonymous ? '익명의 친구' : letter.nickname} · {new Date(letter.createdAt).toLocaleDateString('ko-KR')}</small>
            </article>)}
            {!loading && !letters.length && <p>아직 첫 번째 편지를 기다리고 있어요.</p>}
            {cursor && <button type="button" disabled={loading} onClick={() => void load(cursor)}>이전 편지 더 읽기</button>}
            {loading && <p role="status">편지를 불러오는 중…</p>}
          </section>}
        </div>
      </section>
    </main>
    {composing && selected && <LetterComposer ornament={selected} text={text} anonymous={anonymous} busy={busy} locked={locked} error={error}
      onText={setText} onAnonymous={setAnonymous} onSend={() => void send()} onClose={() => setComposing(false)}/>}
  </>
}
