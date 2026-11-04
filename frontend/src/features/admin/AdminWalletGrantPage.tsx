import { useEffect, useRef, useState } from 'react'
import {
  AdminWalletGrantError, executeAdminWalletGrant, previewAdminWalletGrant,
  type AdminWalletGrantCommand, type AdminWalletGrantPreview, type AdminWalletGrantResult,
} from './adminWalletGrant'
import './adminWalletGrant.css'

const coins = new Intl.NumberFormat('ko-KR')

function inputValues(amountText: string, reasonText: string) {
  const amount = Number(amountText)
  const reason = reasonText.trim()
  if (!/^\d+$/.test(amountText) || !Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000) {
    throw new Error('1인당 지급액은 1냥 이상 1,000,000냥 이하의 정수로 입력해주세요.')
  }
  if (!reason || reason.length > 200) throw new Error('지급 사유는 공백을 제외하고 1자 이상 200자 이하로 입력해주세요.')
  return { amount, reason }
}

export function AdminWalletGrantPage({ onAuthEnded }: { onAuthEnded: () => void }) {
  const [amount, setAmount] = useState('100')
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState<AdminWalletGrantPreview | null>(null)
  const [command, setCommand] = useState<AdminWalletGrantCommand | null>(null)
  const [result, setResult] = useState<AdminWalletGrantResult | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [pending, setPending] = useState<'preview' | 'execute' | null>(null)
  const [error, setError] = useState('')
  const [retryingSameRequest, setRetryingSameRequest] = useState(false)
  const request = useRef<AbortController | null>(null)
  const commandRef = useRef<AdminWalletGrantCommand | null>(null)
  const inFlight = useRef(false)

  useEffect(() => () => request.current?.abort(), [])

  const resetPreview = () => {
    commandRef.current = null
    setPreview(null); setCommand(null); setResult(null); setConfirmed(false); setError(''); setRetryingSameRequest(false)
  }

  const showError = (cause: unknown) => {
    if (cause instanceof AdminWalletGrantError && cause.authEnded) { onAuthEnded(); return }
    setError(cause instanceof Error ? cause.message : '요청을 처리하지 못했습니다. 다시 시도해주세요.')
  }

  const loadPreview = async () => {
    if (inFlight.current) return
    setError(''); setResult(null); setCommand(null); setConfirmed(false); setRetryingSameRequest(false)
    commandRef.current = null
    let values: ReturnType<typeof inputValues>
    try { values = inputValues(amount, reason) } catch (cause) { showError(cause); return }
    request.current?.abort()
    const abort = request.current = new AbortController()
    inFlight.current = true
    setPending('preview'); setPreview(null)
    try {
      const value = await previewAdminWalletGrant(values.amount, values.reason, abort.signal)
      if (!abort.signal.aborted) { setPreview(value); setAmount(String(value.amountPerMember)); setReason(value.reason) }
    } catch (cause) { if (!abort.signal.aborted) showError(cause) }
    finally { inFlight.current = false; if (!abort.signal.aborted) setPending(null) }
  }

  const execute = async () => {
    if (inFlight.current || !preview?.executable || !confirmed) return
    const next = commandRef.current ?? command ?? {
      requestId: crypto.randomUUID(), amountPerMember: preview.amountPerMember,
      reason: preview.reason, expectedRecipientCount: preview.recipientCount,
    }
    commandRef.current = next
    setCommand(next); setError(''); setResult(null); setRetryingSameRequest(false)
    request.current?.abort()
    const abort = request.current = new AbortController()
    inFlight.current = true
    setPending('execute')
    try {
      const value = await executeAdminWalletGrant(next, abort.signal)
      if (!abort.signal.aborted) {
        commandRef.current = null
        setResult(value); setPreview(null); setCommand(null); setConfirmed(false)
      }
    } catch (cause) {
      if (abort.signal.aborted) return
      if (cause instanceof AdminWalletGrantError && cause.requiresPreview) {
        commandRef.current = null
        setPreview(null); setCommand(null); setConfirmed(false)
      } else if (cause instanceof AdminWalletGrantError && cause.kind === 'conflict') {
        commandRef.current = null
        setPreview(null); setCommand(null); setConfirmed(false)
      } else if (cause instanceof AdminWalletGrantError && cause.retryable) setRetryingSameRequest(true)
      showError(cause)
    } finally { inFlight.current = false; if (!abort.signal.aborted) setPending(null) }
  }

  const busy = pending !== null
  return <section className="admin-feedback-content admin-wallet-grant" aria-label="전 회원 엽전 지급" aria-busy={busy}>
    <div className="admin-wallet-grant-heading">
      <div><h2>전 회원 엽전 지급</h2><p>탈퇴하지 않은 모든 회원에게 같은 금액을 한 번에 지급합니다.</p></div>
      <strong>되돌릴 수 없는 작업</strong>
    </div>
    <form onSubmit={event => { event.preventDefault(); void loadPreview() }}>
      <label>1인당 지급액
        <span className="admin-wallet-grant-input"><input type="number" inputMode="numeric" min="1" max="1000000" step="1"
          value={amount} disabled={busy} onChange={event => { setAmount(event.target.value); resetPreview() }} />냥</span>
      </label>
      <label>지급 사유
        <textarea rows={3} maxLength={200} value={reason} disabled={busy}
          placeholder="예: 서비스 출시 기념" onChange={event => { setReason(event.target.value); resetPreview() }} />
        <small>{reason.length}/200자 · 감사 기록과 엽전 원장에 남습니다.</small>
      </label>
      <button type="submit" disabled={busy}>{pending === 'preview' ? '대상과 총액을 확인하는 중…' : '지급 미리보기'}</button>
    </form>
    {error && <div className="admin-feedback-error" role="alert"><p>{error}</p>
      {retryingSameRequest && <p><strong>새 요청을 만들지 않습니다.</strong> 아래 버튼은 같은 요청 ID로 완료 여부를 확인합니다.</p>}</div>}
    {preview && <section className="admin-wallet-grant-preview" aria-label="지급 미리보기">
      <h3>지급 전 최종 확인</h3>
      <dl>
        <div><dt>1인당 지급액</dt><dd>{coins.format(preview.amountPerMember)}냥</dd></div>
        <div><dt>지급 대상</dt><dd>{coins.format(preview.recipientCount)}명</dd></div>
        <div><dt>총 지급액</dt><dd>{coins.format(preview.totalAmount)}냥</dd></div>
        <div><dt>지갑 미준비 회원</dt><dd>{coins.format(preview.missingWalletCount)}명</dd></div>
      </dl>
      <p><strong>지급 사유</strong><span>{preview.reason}</span></p>
      {!preview.executable && <p className="admin-wallet-grant-blocked" role="alert">지갑이 준비되지 않은 회원이 있어 실행할 수 없습니다. 서버 상태를 확인한 뒤 다시 미리보기해주세요.</p>}
      {preview.executable && <>
        <label className="admin-wallet-grant-confirm"><input type="checkbox" checked={confirmed} disabled={busy}
          onChange={event => setConfirmed(event.target.checked)} />
          <span><strong>{coins.format(preview.recipientCount)}명에게 총 {coins.format(preview.totalAmount)}냥을 지급합니다.</strong><br />대상·금액·사유를 확인했습니다.</span>
        </label>
        <button className="admin-wallet-grant-execute" type="button" disabled={busy || !confirmed} onClick={() => void execute()}>
          {pending === 'execute' ? '지급 결과를 확인하는 중…' : retryingSameRequest ? '같은 요청으로 결과 확인' : '전 회원에게 지급 실행'}
        </button>
      </>}
    </section>}
    {result && <section className="admin-wallet-grant-success" role="status">
      <h3>일괄 지급이 완료되었습니다</h3>
      <p>{coins.format(result.recipientCount)}명에게 1인당 {coins.format(result.amountPerMember)}냥,
        총 {coins.format(result.totalAmount)}냥을 지급했습니다.</p>
      <dl><div><dt>배치 번호</dt><dd>#{result.batchId}</dd></div>
        <div><dt>완료 시각</dt><dd>{new Date(result.executedAt).toLocaleString('ko-KR')}</dd></div></dl>
    </section>}
  </section>
}
