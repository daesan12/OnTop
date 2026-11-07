import { useEffect, useRef, useState } from 'react'
import { InboxError, isNotificationId, rewardLabel, sendReward, type RewardGrantInput, type RewardKind } from './api'
import './rewards.css'

/** 전 회원 즉시 지급과 구분되는, 회원 한 명의 알림함으로 보내는 수령형 보상. */
export function AdminRewardGrantForm({ onAuthEnded }: { onAuthEnded: () => void }) {
  const [user, setUser] = useState(''), [kind, setKind] = useState<RewardKind>('GACHA_TICKET')
  const [amount, setAmount] = useState('1'), [title, setTitle] = useState(''), [text, setText] = useState(''), [expiry, setExpiry] = useState('')
  const [command, setCommand] = useState<RewardGrantInput | null>(null), [done, setDone] = useState(''), [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [canEdit, setCanEdit] = useState(true)
  const pending = useRef(false), request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  const preview = () => {
    setError(''); setDone(''); setCanEdit(true)
    const count = Number(amount), expires = new Date(expiry)
    if (!isNotificationId(user) || !/^[1-9]\d*$/.test(amount) || !Number.isSafeInteger(count)
      || !title.trim() || !text.trim() || !Number.isFinite(expires.getTime()) || expires.getTime() <= Date.now()) {
      setError('회원 ID·양의 정수 수량·제목·메시지·미래 수령 기한을 모두 입력해주세요.'); return
    }
    setCommand({ operationId: crypto.randomUUID(), userId: user, kind, amount: count,
      title: title.trim(), text: text.trim(), expiresAt: expires.toISOString() })
  }
  const send = async () => {
    if (!command || pending.current) return
    pending.current = true; setBusy(true); setError('')
    const controller = request.current = new AbortController()
    try {
      await sendReward(command, controller.signal)
      if (controller.signal.aborted) return
      setDone(`회원 #${command.userId}에게 ${rewardLabel(command)}을 보냈어요. 본인이 받아야 보유량에 반영됩니다.`)
      setCommand(null); setText(''); setTitle('')
    } catch (cause) {
      if (controller.signal.aborted) return
      if (cause instanceof InboxError && cause.status === 401) { onAuthEnded(); return }
      setCanEdit(cause instanceof InboxError && [400,403,404,409].includes(cause.status))
      setError(cause instanceof Error ? cause.message : '같은 발급 요청으로 다시 확인해주세요.')
    } finally { pending.current = false; if (!controller.signal.aborted) setBusy(false) }
  }
  return <section className="admin-feedback-content admin-reward-form" aria-label="개인 보상 보내기">
    <h2>알림함으로 선물 보내기</h2><p>한 회원에게 엽전이나 뽑기권을 보내요. 수령 전에는 보유량이 늘어나지 않습니다.</p>
    <fieldset disabled={busy || !!command}>
      <label>받는 회원 ID<input inputMode="numeric" value={user} onChange={event => setUser(event.target.value)} placeholder="내부 회원 ID"/></label>
      <label>보상 종류<select value={kind} onChange={event => setKind(event.target.value as RewardKind)}><option value="GACHA_TICKET">뽑기권</option><option value="COIN">엽전</option></select></label>
      <label>수량<input inputMode="numeric" value={amount} onChange={event => setAmount(event.target.value)}/></label>
      <label>알림 제목<input value={title} maxLength={100} onChange={event => setTitle(event.target.value)}/></label>
      <label>함께 보낼 메시지<textarea value={text} maxLength={1000} rows={3} onChange={event => setText(event.target.value)}/></label>
      <label>수령 기한<input type="datetime-local" value={expiry} onChange={event => setExpiry(event.target.value)}/></label>
    </fieldset>
    {!command ? <button onClick={preview}>보낼 내용 확인</button> : <div className="admin-reward-confirm">
      <strong>회원 #{command.userId} · {rewardLabel(command)}</strong><p>{command.title}</p>
      <p>수령 기한 {new Date(command.expiresAt).toLocaleString('ko-KR')}</p>
      <button disabled={busy} onClick={() => void send()}>{busy ? '발송 확인 중…' : error ? '같은 요청으로 다시 확인' : '이 내용으로 보상 보내기'}</button>
      {canEdit && <button disabled={busy} onClick={() => { setCommand(null); setError('') }}>입력 수정</button>}
    </div>}
    {error && <p role="alert">{error}</p>}{done && <p role="status">{done}</p>}
  </section>
}
