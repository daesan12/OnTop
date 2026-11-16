import { useEffect, useRef, useState } from 'react'
import { parkRuntime } from '../park/runtime/runtime'
import { useSession } from '../network/worldClient'
import { acceptPolice } from '../features/ai/worldAi'
import { jokeSubmissionError } from '../features/ai/jokeSubmissionError'
import { jokeContestPath, closeJokeContest, jokeJudgePosition, useJokeContest } from '../features/ai/jokeContest'
import { NpcDialogueFrame } from '../features/ai/NpcDialogueFrame'
import './jokeRanking.css'

type Submission = { id: string; question: string; answer: string; status: string; scoreX10: number | null; reaction: string; reactionSource: string; reason: string }
type Mine = { date: string; remaining: number; unlimitedAttempts?: boolean; submissions: Submission[]; judge: string; reactionProvider: string }
type Ranked = { id: string; nickname: string; scoreX10: number; question?: string; rank?: number; date?: string }
type Stage = 'greeting' | 'question' | 'answer' | 'confirm' | 'judging' | 'result'
const labels: Record<string, string> = { PENDING: '심사 중', SCORED: '심사 완료', REJECTED: '공개 부적합', REVIEW: '공개 보류', INVALID_JOKE: '개그 미성립', FAILED: '처리 실패 · 기회 반환' }

async function read<T>(path: string, body?: object): Promise<T> {
  return await parkRuntime.requestJSON(jokeContestPath(path), body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined) as T
}
export function JokeContestPanel() {
  const { open, tab } = useJokeContest()
  const session = useSession(s => s.sessionId), channel = useSession(s => s.roomId)
  const [mine, setMine] = useState<Mine | null>(null), [rankings, setRankings] = useState<Ranked[]>([]), [hall, setHall] = useState<Ranked[]>([])
  const [yesterday, setYesterday] = useState<{ available: boolean; date: string; winner?: Ranked } | null>(null)
  const [reveals, setReveals] = useState<Record<string, { answer: string; reaction: string }>>({})
  const [expandedAnswers, setExpandedAnswers] = useState<Record<string, boolean>>({})
  const [answerErrors, setAnswerErrors] = useState<Record<string, string>>({})
  const [question, setQuestion] = useState(''), [answer, setAnswer] = useState('')
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [selected, setSelected] = useState(''), [stage, setStage] = useState<Stage>('greeting')
  const [rankingView, setRankingView] = useState<'today' | 'hall' | 'mine'>('today')
  const key = useRef(''), generation = useRef(0), spoken = useRef(''), dialog = useRef<HTMLElement>(null), advance = useRef<() => void>(() => {})
  const revealRequests = useRef(new Map<string, number>())
  const result = selected ? mine?.submissions.find(s => s.id === selected) : mine?.submissions.at(-1)
  const pending = mine?.submissions.find(s => s.status === 'PENDING')
  const exhausted = !!mine && !mine.unlimitedAttempts && mine.remaining === 0
  const attemptsLabel = mine?.unlimitedAttempts ? '로컬 테스트 · 횟수 제한 없음' : mine ? `남은 도전 ${mine.remaining} / 3회` : '기록 조회 중'
  const canSubmit = !!mine && !exhausted && !pending && !busy

  useEffect(() => { generation.current++; setMine(null); setReveals({}); setExpandedAnswers({}); setAnswerErrors({}); setSelected(''); key.current = ''; setBusy(false); closeJokeContest() }, [session, channel])
  useEffect(() => {
    if (!open) return
    setStage('greeting'); setError(''); setBusy(false)
    const id = ++generation.current
    let live = true, timer: ReturnType<typeof setTimeout>
    const refresh = async () => {
      try {
        const [m, r, h, w] = await Promise.all([read<Mine>('me'), read<Ranked[]>('rankings'), read<Ranked[]>('hall'), read<{ available: boolean; date: string; winner?: Ranked }>('yesterday')])
        if (!live || generation.current !== id) return
        setMine(m); setRankings(r); setHall(h); setYesterday(w)
      } catch { if (live && generation.current === id) setError('기록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.') }
      finally { if (live) timer = setTimeout(() => void refresh(), 1500) }
    }
    void refresh()
    return () => { live = false; clearTimeout(timer); generation.current++ }
  }, [open, session, channel])
  useEffect(() => {
    if (!open || tab !== 'submit') return
    if (pending) { setSelected(pending.id); setStage('judging') }
    else if (stage === 'judging' && result && result.status !== 'PENDING') setStage('result')
  }, [open, tab, pending?.id, result?.id, result?.status, stage])
  useEffect(() => { if (result?.status === 'FAILED') key.current = '' }, [result?.id, result?.status])
  useEffect(() => {
    if (!open || stage !== 'result' || !result || result.status === 'PENDING' || spoken.current === result.id) return
    spoken.current = result.id
    acceptPolice({ incidentId: result.id, name: '김부장', ...jokeJudgePosition, speech: result.reaction, expiresAt: Date.now() + 10_000 }, 'joke-judge')
  }, [open, stage, result?.id, result?.status])

  const begin = () => {
    if (pending) { useJokeContest.setState({ tab: 'submit' }); setStage('judging'); return }
    if (exhausted) { useJokeContest.setState({ tab: 'ranking' }); return }
    if (stage === 'result') { setQuestion(''); setAnswer(''); key.current = '' }
    useJokeContest.setState({ tab: 'submit' }); setError(''); setStage('question')
  }
  advance.current = () => { if (tab === 'submit' && (stage === 'greeting' || stage === 'result')) begin() }
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.current?.focus({ preventScroll: true })
    const keys = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); closeJokeContest(); return }
      if (event.key === 'Enter' && !event.repeat && !(event.target instanceof HTMLElement && event.target.closest('input,textarea,button,summary,select'))) {
        event.preventDefault(); event.stopImmediatePropagation(); advance.current()
      }
      if (event.key === 'Tab') {
        const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),summary') ?? [])].filter(control => control.getClientRects().length > 0)
        const index = controls.indexOf(document.activeElement as HTMLElement)
        if (controls.length && (index < 0 || (!event.shiftKey && index === controls.length - 1) || (event.shiftKey && index === 0))) {
          event.preventDefault(); controls[event.shiftKey ? controls.length - 1 : 0]?.focus()
        }
      }
    }
    window.addEventListener('keydown', keys, true)
    return () => { window.removeEventListener('keydown', keys, true); if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [open])
  useEffect(() => {
    if (!open) return
    if (tab === 'submit' && (stage === 'question' || stage === 'answer')) dialog.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus({ preventScroll: true })
    else dialog.current?.focus({ preventScroll: true })
  }, [open, stage, tab])

  const say = () => {
    const value = (stage === 'question' ? question : answer).trim()
    const minimum = stage === 'question' ? 2 : 1, maximum = stage === 'question' ? 100 : 60
    if (value.length < minimum || value.length > maximum) { setError(stage === 'question' ? '문제를 2~100자로 들려주세요.' : '정답을 1~60자로 들려주세요.'); return }
    setError('')
    if (stage === 'question') { setQuestion(value); setStage('answer') }
    else if (stage === 'answer') { setAnswer(value); setStage('confirm') }
  }
  const submit = async (agreed: boolean) => {
    if (!agreed || stage !== 'confirm' || !canSubmit) return
    setBusy(true); setError('')
    const id = generation.current
    if (!key.current) key.current = crypto.randomUUID()
    try {
      const row = await read<Submission>('submissions', { question, answer, consent: agreed, idempotencyKey: key.current })
      if (generation.current !== id) return
      setSelected(row.id); setStage(row.status === 'PENDING' ? 'judging' : 'result')
      const m = await read<Mine>('me')
      if (generation.current === id) setMine(m)
    } catch (error) { if (generation.current === id) setError(jokeSubmissionError(error)) }
    finally { if (generation.current === id) setBusy(false) }
  }
  const reveal = async (id: string) => {
    const current = generation.current
    if (revealRequests.current.get(id) === current) return
    revealRequests.current.set(id, current)
    setAnswerErrors(values => ({ ...values, [id]: '' }))
    try { const value = await read<{ answer: string; reaction: string }>('reveal/' + encodeURIComponent(id)); if (generation.current === current) setReveals(s => ({ ...s, [id]: value })) }
    catch { if (generation.current === current) setAnswerErrors(values => ({ ...values, [id]: '정답을 불러오지 못했어요. 다시 시도해주세요.' })) }
    finally { if (revealRequests.current.get(id) === current) revealRequests.current.delete(id) }
  }
  const row = (r: Ranked, index: number, historical = false) => <article key={r.id} className="joke-rank-row" data-place={historical ? undefined : r.rank ?? index + 1} data-historical={historical || undefined}>
    <span className="joke-place" aria-label={historical ? '일일 우승' : `${r.rank ?? index + 1}위`}>{historical ? '장원' : r.rank ?? index + 1}</span>
    <div className="joke-entry"><div className="joke-entry-meta"><strong>{r.nickname}</strong>{r.date && <time dateTime={r.date}>{r.date.replaceAll('-', '.')}</time>}</div>{r.question ? <p className="joke-entry-question"><span>문제</span>{r.question}</p> : <span className="joke-entry-private">문답 비공개</span>}
      {r.question && (historical || (r.rank ?? index + 1) <= 5) && <>
        <button className="joke-answer-toggle" aria-expanded={!!expandedAnswers[r.id]} aria-controls={`joke-answer-${r.id}`} onClick={() => { const expand = !expandedAnswers[r.id]; setExpandedAnswers(values => ({ ...values, [r.id]: expand })); if (expand && !reveals[r.id]) void reveal(r.id) }}>
          <svg className="joke-answer-book" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 4.5h5.5L10 6l1.5-1.5H17v11h-5.5L10 17l-1.5-1.5H3zM10 6v11M5.5 8h2M12.5 8h2M5.5 11h2M12.5 11h2" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
          {expandedAnswers[r.id] ? '정답 접기' : '정답 보기'}
          <svg className="joke-answer-chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div className="joke-rank-answer" id={`joke-answer-${r.id}`} hidden={!expandedAnswers[r.id]} role="region" aria-label={`${r.nickname}의 정답`}>
          <small>정답</small>{answerErrors[r.id] ? <div className="joke-answer-error"><p role="alert">{answerErrors[r.id]}</p><button onClick={() => void reveal(r.id)}>다시 불러오기</button></div> : <p role="status">{reveals[r.id]?.answer ?? '정답을 펼치는 중…'}</p>}
        </div>
      </>}
    </div><b className="joke-rank-score">{(r.scoreX10 / 10).toFixed(1)}<small>점</small></b>
  </article>
  const bestToday = mine?.submissions.reduce<number | null>((best, item) => item.status === 'SCORED' && item.scoreX10 !== null ? Math.max(best ?? 0, item.scoreX10) : best, null)
  const line = tab === 'ranking' ? '허허, 오늘 공원을 웃긴 주인공들을 함께 보겠나?'
    : stage === 'greeting' ? '허허! 자네도 오늘의 아재왕에 도전해 보겠나?'
      : stage === 'question' ? '좋네! 어떤 개그를 준비했나? 먼저 문제를 들려주게.'
        : stage === 'answer' ? '흐음, 그래서 정답은 뭔가? 궁금하구먼!'
          : stage === 'confirm' ? mine?.unlimitedAttempts ? '이대로 심사받겠나? 상위 작품은 닉네임·문제·정답이 공개된다네. 지금은 로컬 연습이니 횟수 걱정 없이 도전해 보게.' : '이대로 심사받겠나? 상위 작품은 닉네임·문제·정답이 공개되고, 공개 부적합·미성립·보류도 도전 한 번을 쓰게 된다네.'
        : stage === 'judging' ? '흐음… 자네의 개그를 찬찬히 살펴보는 중일세. 잠시만 기다려 주게.'
          : result?.reaction ?? '자, 준비한 개그 한 수 들려주게!'
  const nextLabel = exhausted ? '랭킹 보기' : stage === 'result' ? '다시 도전' : '다음'

  return <>
    {open && <div className={`joke-backdrop${tab === 'ranking' ? ' joke-backdrop-ranking' : ''}`}><section ref={dialog} className="joke-dialog" data-stage={tab === 'ranking' ? 'ranking' : stage} role="dialog" aria-modal="true" aria-label="탑골 아재왕 선발대회" tabIndex={-1}>
      {tab === 'ranking' && <div className="joke-ledger">
        <span className="joke-scroll-roller joke-scroll-roller-top" aria-hidden="true" /><span className="joke-scroll-roller joke-scroll-roller-bottom" aria-hidden="true" />
        <div className="joke-scroll-paper">
          <header className="joke-scroll-heading"><div><span className="joke-scroll-emblem" aria-hidden="true">장원</span><h2>탑골 아재왕</h2><p>{rankingView === 'hall' ? '공원의 웃음을 모아 둔 장원록' : rankingView === 'mine' ? '자네가 들려준 웃음 한 수' : '오늘 공원을 웃긴 한 수'}</p></div><div className="joke-scroll-heading-right"><button className="joke-scroll-close" aria-label="아재왕 창 닫기" onClick={closeJokeContest}><kbd>ESC</kbd> 닫기 <span aria-hidden="true">×</span></button><time>{mine?.date.replaceAll('-', '.') ?? '오늘의 순위'}</time></div></header>
          <nav className="joke-rank-nav" aria-label="랭킹 보기 선택">{([['today', '오늘 순위'], ['hall', '역대 아재왕'], ['mine', '내 오늘 기록']] as const).map(([view, label]) => <button key={view} aria-pressed={rankingView === view} onClick={() => { setRankingView(view); setError('') }}>{label}{view === 'today' && <span>{rankings.length}</span>}{view === 'mine' && <span>{mine?.submissions.length ?? 0}</span>}</button>)}</nav>
          <div className="joke-rank-layout">
            <section className="joke-rank-main" aria-label={rankingView === 'today' ? '오늘 순위' : rankingView === 'hall' ? '역대 아재왕' : '내 오늘 기록'}>
              <div className="joke-rank-list-heading"><h3>{rankingView === 'today' ? '오늘의 웃음 고수' : rankingView === 'hall' ? '날짜별 아재왕' : '내가 들려준 개그'}</h3><p>{rankingView === 'today' ? '상위 10명 · 상위 5위까지 정답 공개' : rankingView === 'hall' ? '날짜별 우승 개그의 정답을 펼쳐보세요.' : '심사 결과와 제출한 문답을 확인하세요'}</p></div>
              {rankingView === 'mine' ? <div className="joke-mine-columns" aria-hidden="true"><span>제출한 개그와 심사 결과</span><span>점수</span></div> : <div className="joke-rank-columns" aria-hidden="true"><span>{rankingView === 'hall' ? '우승' : '순위'}</span><span>닉네임 / 개그</span><span>점수</span></div>}
              <div className="joke-ledger-body" key={rankingView}>
                {!mine && !error ? <p className="joke-rank-empty" role="status">기록을 불러오고 있어요.</p> : rankingView === 'today' ? rankings.length ? rankings.map((r, index) => row(r, index)) : <p className="joke-rank-empty">아직 순위에 오른 개그가 없어요.<br />첫 번째 웃음의 주인공이 되어보세요.</p> : rankingView === 'hall' ? hall.length ? hall.map((r, index) => row(r, index, true)) : <p className="joke-rank-empty">아직 우승 기록이 없어요.<br />매일 00:05에 전날 아재왕이 정해져요.</p> : mine?.submissions.length ? mine.submissions.map(s => <article className="joke-mine-row" key={s.id}><div><span className="joke-mine-status" data-status={s.status}>{labels[s.status]}</span><b>{s.scoreX10 !== null ? `${(s.scoreX10 / 10).toFixed(1)}점` : '—'}</b></div><p>{s.question}</p><p className="joke-mine-answer"><small>정답</small>{s.answer}</p><button onClick={() => { setSelected(s.id); useJokeContest.setState({ tab: 'submit' }); setStage(s.status === 'PENDING' ? 'judging' : 'result') }}>심사 결과 보기</button></article>) : <p className="joke-rank-empty">오늘은 아직 도전하지 않았어요.<br />준비한 개그를 심사위원에게 들려주세요.</p>}
                {error && <p className="joke-rank-error" role="alert">{error}</p>}
              </div>
            </section>
            <aside className="joke-rank-aside" aria-label="대회 안내"><section className="joke-yesterday"><span className="joke-champion-mark" aria-hidden="true">왕</span><h3>어제의 아재왕</h3>{yesterday?.available && yesterday.winner ? <><strong>{yesterday.winner.nickname}</strong><b>{(yesterday.winner.scoreX10 / 10).toFixed(1)}<small>점</small></b><time>{yesterday.date}</time></> : <><strong>첫 아재왕을 기다려요</strong><p>매일 00:05에<br />전날 우승자가 정해져요.</p></>}</section><section className="joke-ranking-guide"><h3>오늘의 내 도전</h3><dl><div><dt>남은 기회</dt><dd>{mine ? mine.unlimitedAttempts ? '제한 없음' : `${mine.remaining} / 3회` : '조회 중'}</dd></div><div><dt>내 최고 점수</dt><dd>{bestToday != null ? `${(bestToday / 10).toFixed(1)}점` : '아직 없음'}</dd></div></dl><p>한 사람당 최고 점수로 순위를 매겨요.<br />상위 5명의 정답을 열어볼 수 있어요.</p></section></aside>
          </div>
          <footer className="joke-ledger-footer"><p><strong>{attemptsLabel}</strong><span> · 기발한 한마디로 아재왕에 도전하세요.</span></p><button disabled={exhausted && !pending} onClick={begin}>{pending ? '내 심사 확인하기' : exhausted ? '오늘 도전 완료' : '김부장에게 도전하기'}</button></footer>
        </div>
      </div>}
      {tab === 'submit' && <NpcDialogueFrame portrait="/art/ai-joke/judge-portrait-v2.png" portraitAlt="안경과 노란 넥타이를 착용한 김부장">
          <header className="joke-dialogue-heading">
            <div className="joke-nameplate"><span aria-hidden="true">✥</span> 김부장 <span aria-hidden="true">✥</span></div>
            <button className="joke-close" onClick={closeJokeContest} aria-label="아재왕 창 닫기"><kbd>ESC</kbd> 닫기 <span aria-hidden="true">×</span></button>
          </header>
          {tab === 'submit' && (stage === 'answer' || stage === 'confirm') && <div className="joke-user-echo"><span>나</span><p>{question}{stage === 'confirm' && <><br /><strong>{answer}</strong></>}</p></div>}
          <div className="joke-speech" role="status"><p>{line}</p>{stage === 'result' && tab === 'submit' && result?.scoreX10 != null && <span className="joke-result-score">{labels[result.status]} · <strong>{(result.scoreX10 / 10).toFixed(1)}점</strong></span>}</div>
          {tab === 'submit' && (stage === 'question' || stage === 'answer') && <form className="joke-chat-input" onSubmit={event => { event.preventDefault(); say() }}>
            <textarea key={stage} aria-label="김부장에게 말하기" placeholder={stage === 'question' ? '준비한 개그의 문제를 말해보세요…' : '정답을 말해보세요…'} minLength={stage === 'question' ? 2 : 1} maxLength={stage === 'question' ? 100 : 60} value={stage === 'question' ? question : answer} onChange={event => { if (stage === 'question') setQuestion(event.target.value); else setAnswer(event.target.value); key.current = '' }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); if (!event.repeat) event.currentTarget.form?.requestSubmit() } }} required />
            <button type="submit" aria-label="말하기"><kbd>Enter</kbd> 말하기 <span aria-hidden="true">↵</span></button>
          </form>}
          {error && <p className="joke-error" role="alert">{error}</p>}
          <footer className="joke-dialogue-actions">
            <small className="joke-mode">{attemptsLabel}{mine?.judge.startsWith('OFFLINE') && ' · 로컬 시연'}</small>
            {tab === 'submit' && stage === 'answer' && <button onClick={() => { setStage('question'); setError('') }}>문제 고치기</button>}
            {tab === 'submit' && stage === 'confirm' && <><button disabled={busy} onClick={() => { setStage('question'); setError('') }}>아니, 고칠게</button><button className="joke-consent-choice" disabled={!canSubmit} onClick={() => void submit(true)}>{busy ? '접수 중…' : mine?.unlimitedAttempts ? '공개에 동의하고 심사받기' : '공개에 동의하고 심사받기 · 1회'}</button></>}
            {tab === 'submit' && (stage === 'greeting' || stage === 'result') && <><button onClick={() => useJokeContest.setState({ tab: 'ranking' })}>오늘의 아재왕</button><button className="joke-next" onClick={begin}><kbd>Enter</kbd> {nextLabel}<span aria-hidden="true"> ▾</span></button></>}
          </footer>
      </NpcDialogueFrame>}
    </section></div>}
  </>
}
