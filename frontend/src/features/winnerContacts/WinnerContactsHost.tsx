import { useEffect, useRef, useState, type FormEvent } from 'react'
import { MenuDialog } from '../parkMenus/MenuDialog'
import { awardLabels, canSubmit, groupWinnings, loadMyWinnings, normalizePhone, submitContact,
  type Winning, type WinnerContactsError } from './winnerContacts'
import './winnerContacts.css'

type Props = {
  open: boolean
  refreshKey: number
  onAutoOpen: () => void
  onClose: () => void
}

const kstDate = (value: string) => new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric',
  hour: 'numeric', minute: '2-digit',
}).format(new Date(value))

export function WinnerContactsHost({ open, refreshKey, onAutoOpen, onClose }: Props) {
  const [items, setItems] = useState<Winning[] | null>(null)
  const [reload, setReload] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [phoneByWeek, setPhoneByWeek] = useState<Record<string, string>>({})
  const [agreedByWeek, setAgreedByWeek] = useState<Record<string, boolean>>({})
  const [editingWeek, setEditingWeek] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<Record<string, string>>({})
  const [pendingWeek, setPendingWeek] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const request = useRef<AbortController | null>(null)
  const submitRequest = useRef<AbortController | null>(null)
  const submitting = useRef(false)
  const autoShown = useRef(false)

  useEffect(() => {
    const controller = request.current = new AbortController()
    setLoadError('')
    setItems(null)
    void loadMyWinnings(controller.signal).then(result => {
      if (controller.signal.aborted) return
      setItems(result)
      if (!autoShown.current && groupWinnings(result).some(group =>
        group.status === 'NOT_SUBMITTED' && canSubmit(group.status, group.deadline))) {
        autoShown.current = true
        onAutoOpen()
      }
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      setLoadError(error instanceof Error ? error.message : '당첨 내역을 불러오지 못했습니다.')
    })
    return () => controller.abort()
  }, [refreshKey, reload, onAutoOpen])

  useEffect(() => () => { request.current?.abort(); submitRequest.current?.abort() }, [])
  useEffect(() => {
    if (!open) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [open])

  async function save(week: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    const phone = normalizePhone(phoneByWeek[week] ?? '')
    if (!phone) {
      setSubmitError(errors => ({ ...errors, [week]: '휴대전화 번호를 확인해주세요.' }))
      return
    }
    if (!agreedByWeek[week]) {
      setSubmitError(errors => ({ ...errors, [week]: '연락처 수집·보관 안내를 확인해주세요.' }))
      return
    }
    const controller = submitRequest.current = new AbortController()
    submitting.current = true
    setPendingWeek(week)
    setSubmitError(errors => ({ ...errors, [week]: '' }))
    try {
      const receipt = await submitContact(week, phone, controller.signal)
      if (controller.signal.aborted) return
      setItems(current => current?.map(item => item.weekStart === week ? {
        ...item, contactStatus: receipt.status, maskedPhone: receipt.maskedPhone,
        contactExpiresAt: receipt.expiresAt, submissionDeadline: receipt.submissionDeadline,
      } : item) ?? null)
      setPhoneByWeek(values => ({ ...values, [week]: '' }))
      setAgreedByWeek(values => ({ ...values, [week]: false }))
      setEditingWeek(null)
    } catch (error) {
      if (controller.signal.aborted) return
      const failure = error as WinnerContactsError
      setSubmitError(errors => ({ ...errors, [week]: failure.message || '연락처를 저장하지 못했습니다.' }))
    } finally {
      submitting.current = false
      if (!controller.signal.aborted) setPendingWeek(null)
    }
  }

  function close() {
    if (pendingWeek !== null) return
    setPhoneByWeek({})
    setAgreedByWeek({})
    setSubmitError({})
    setEditingWeek(null)
    onClose()
  }

  if (!open) return null
  const groups = groupWinnings(items ?? [])
  return <MenuDialog label="내 당첨 내역" className="winner-contacts-dialog" onClose={close}>
    <header className="winner-contacts-header">
      <div><span className="winner-contacts-eyebrow">온탑 이벤트</span><h2>내 당첨 내역</h2></div>
      <button type="button" aria-label="당첨 내역 닫기" onClick={close} disabled={pendingWeek !== null}>×</button>
    </header>
    <p className="winner-contacts-intro">발표된 당첨 상품과 연락처 제출 상태를 확인할 수 있어요.</p>
    {items === null && !loadError && <p role="status">당첨 내역을 확인하고 있어요…</p>}
    {loadError && <div className="winner-contacts-notice" role="alert"><p>{loadError}</p>
      <button type="button" onClick={() => { request.current?.abort(); setReload(value => value + 1) }}>다시 조회</button></div>}
    {items && groups.length === 0 && <p className="winner-contacts-empty">아직 발표된 당첨 내역이 없어요.</p>}
    {groups.map(group => {
      const editable = canSubmit(group.status, group.deadline, now)
      const showForm = editable && (group.status === 'NOT_SUBMITTED' || editingWeek === group.weekStart)
      return <section className="winner-contacts-week" key={group.weekStart} aria-label={`${group.weekStart} 주차 당첨`}>
        <h3>{group.weekStart} 주차</h3>
        <ul>{group.awards.map(award => <li key={award.winnerId}>
          <strong>{awardLabels[award.eventType]} {award.place}등</strong>
          <span>{award.prizeName}</span>
        </li>)}</ul>
        <p className="winner-contacts-deadline">연락처 제출·수정 마감: {kstDate(group.deadline)}</p>
        {group.status === 'SUBMITTED' && <p className="winner-contacts-success" role="status">연락처 제출 완료 · {group.maskedPhone}</p>}
        {group.status === 'EXPIRED' && <p className="winner-contacts-deadline">연락처 보관 기간이 종료되었습니다.</p>}
        {group.status === 'NOT_SUBMITTED' && !editable && <p className="winner-contacts-deadline">연락처 제출 기간이 종료되었습니다.</p>}
        {group.status === 'SUBMITTED' && editable && !showForm && <button type="button" className="winner-contacts-secondary"
          onClick={() => setEditingWeek(group.weekStart)}>연락처 수정</button>}
        {showForm && <form onSubmit={event => void save(group.weekStart, event)} noValidate>
          <label htmlFor={`winner-phone-${group.weekStart}`}>경품 전달용 휴대전화 번호</label>
          <input id={`winner-phone-${group.weekStart}`} type="tel" inputMode="tel" autoComplete="tel" placeholder="010-1234-5678"
            value={phoneByWeek[group.weekStart] ?? ''} disabled={pendingWeek !== null}
            onChange={event => setPhoneByWeek(values => ({ ...values, [group.weekStart]: event.target.value }))} />
          <p className="winner-contacts-privacy">경품 전달 연락을 위해 번호를 수집합니다. 최초 입력 후 14일이 지나면 번호가 삭제됩니다.
            발표 후 7일 동안 제출·수정할 수 있어요.</p>
          <label className="winner-contacts-consent"><input type="checkbox" checked={agreedByWeek[group.weekStart] ?? false}
            disabled={pendingWeek !== null} onChange={event => setAgreedByWeek(values => ({ ...values, [group.weekStart]: event.target.checked }))} />
            연락처 수집·보관 안내를 확인했습니다.</label>
          {submitError[group.weekStart] && <p className="winner-contacts-error" role="alert">{submitError[group.weekStart]}</p>}
          <div className="winner-contacts-actions"><button type="submit" disabled={pendingWeek !== null || !editable}>
            {pendingWeek === group.weekStart ? '저장 중…' : group.status === 'SUBMITTED' ? '번호 수정' : '연락처 제출'}</button>
            {group.status === 'SUBMITTED' && <button type="button" className="winner-contacts-secondary" disabled={pendingWeek !== null}
              onClick={() => { setEditingWeek(null); setPhoneByWeek(values => ({ ...values, [group.weekStart]: '' })) }}>취소</button>}</div>
        </form>}
      </section>
    })}
  </MenuDialog>
}
