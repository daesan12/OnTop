import { useCallback, useEffect, useRef, useState } from 'react'
import { AdminRewardGrantForm } from './AdminRewardGrantForm'
import { findRewardRecipients, InboxError, loadRewardHistory, rewardLabel, type RewardHistoryPage, type RewardRecipient } from './api'

/** 종류별 지급은 기존 발급·수령 경계를 공유하고, 회원 선택과 이력 화면만 담당한다. */
export function AdminRewardManager({ onAuthEnded }: { onAuthEnded: () => void }) {
  const [query, setQuery] = useState(''), [results, setResults] = useState<RewardRecipient[]>([])
  const [selected, setSelected] = useState<RewardRecipient | null>(null)
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [locked, setLocked] = useState(false)
  const [revision, setRevision] = useState(0)
  const search = useRef<AbortController | null>(null)
  useEffect(() => () => search.current?.abort(), [])
  const find = async () => {
    search.current?.abort()
    const controller = search.current = new AbortController()
    setBusy(true); setMessage(''); setResults([])
    try {
      const users = await findRewardRecipients(query.trim(), controller.signal)
      if (controller.signal.aborted) return
      setResults(users); if (!users.length) setMessage('일치하는 활성 회원이 없어요. 닉네임 전체 또는 회원 ID를 확인해주세요.')
    } catch (cause) {
      if (controller.signal.aborted) return
      if (cause instanceof InboxError && cause.status === 401) onAuthEnded()
      else setMessage(cause instanceof Error ? cause.message : '회원을 찾지 못했어요.')
    } finally { if (!controller.signal.aborted) setBusy(false) }
  }
  return <section className="admin-reward-manager" aria-label="회원별 보상 관리">
    <section className="admin-feedback-content">
      <h2>누구에게 선물을 보낼까요?</h2><p>닉네임 전체 또는 회원 ID로 검색한 뒤 받는 사람을 선택해주세요.</p>
      <form className="admin-reward-search" onSubmit={event => { event.preventDefault(); if (!busy && !locked && query.trim()) void find() }}>
        <label>회원 찾기<input value={query} maxLength={19} disabled={locked} placeholder="닉네임 또는 회원 ID" onChange={event => { search.current?.abort(); setBusy(false); setQuery(event.target.value); setResults([]); setMessage('') }}/></label>
        <button disabled={busy || locked || !query.trim()}>{busy ? '찾는 중…' : '회원 검색'}</button>
      </form>
      <ul className="admin-reward-results">{results.map(user => <li key={user.userId}>
        <button disabled={locked} aria-pressed={selected?.userId === user.userId} onClick={() => setSelected(user)}>
          <strong>{user.nickname}</strong><span>회원 #{user.userId}</span>{selected?.userId === user.userId && ' · 선택됨'}
        </button>
      </li>)}</ul>
      {message && <p role="status">{message}</p>}
      {locked && <p>발송 확인 중에는 받는 사람을 변경할 수 없어요. 결과를 확인하거나 입력 수정으로 돌아가주세요.</p>}
    </section>
    {selected && <>
      <AdminRewardGrantForm key={selected.userId} recipient={selected} onAuthEnded={onAuthEnded} onPendingChange={setLocked} onSent={() => setRevision(value => value + 1)}/>
      <RewardHistory key={selected.userId + ':' + revision} recipient={selected} onAuthEnded={onAuthEnded}/>
    </>}
  </section>
}

function RewardHistory({ recipient, onAuthEnded }: { recipient: RewardRecipient; onAuthEnded: () => void }) {
  const [page, setPage] = useState<RewardHistoryPage>({ items: [], nextCursor: null })
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  const load = useCallback(async (cursor = '') => {
    request.current?.abort()
    const controller = request.current = new AbortController()
    setBusy(true); setError('')
    try {
      const next = await loadRewardHistory(recipient.userId, cursor, controller.signal)
      if (!controller.signal.aborted) setPage(previous => ({ items: cursor ? [...previous.items, ...next.items] : next.items, nextCursor: next.nextCursor }))
    } catch (cause) {
      if (controller.signal.aborted) return
      if (cause instanceof InboxError && cause.status === 401) onAuthEnded()
      else setError(cause instanceof Error ? cause.message : '발송 내역을 확인하지 못했어요.')
    } finally { if (!controller.signal.aborted) setBusy(false) }
  }, [recipient.userId, onAuthEnded])
  useEffect(() => { void load(); return () => request.current?.abort() }, [load])
  const labels = { PENDING: '수령 대기', CLAIMED: '수령 완료', EXPIRED: '기한 만료' }
  return <section className="admin-feedback-content" aria-label="보상 발송 내역">
    <h2>{recipient.nickname}님의 보상 내역</h2><button disabled={busy} onClick={() => void load()}>내역 새로고침</button>
    {busy && <p role="status">보상 내역을 확인하고 있어요…</p>}{error && <p role="alert">{error}</p>}
    {!busy && !error && !page.items.length && <p>아직 발송한 보상이 없어요.</p>}
    <ul className="admin-reward-history">{page.items.map(entry => <li key={entry.notificationId}>
      <div><strong>{rewardLabel(entry)}</strong><span className={'reward-state reward-state-' + entry.status.toLowerCase()}>{labels[entry.status]}</span></div>
      <p>{entry.title}</p><small>발송 {new Date(entry.createdAt).toLocaleString('ko-KR')} · 수령 기한 {new Date(entry.expiresAt).toLocaleString('ko-KR')}</small>
      {entry.claimedAt && <small>수령 {new Date(entry.claimedAt).toLocaleString('ko-KR')}</small>}
    </li>)}</ul>
    {page.nextCursor && <button disabled={busy} onClick={() => void load(page.nextCursor!)}>이전 발송 내역 더 보기</button>}
  </section>
}
