import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import avatarImage from '../../assets/entry/park-avatar.webp'
import coinImage from '../../assets/entry/yeopjeon-icon.webp'
import { useSession } from '../../network/worldClient'
import { parkName } from '../../config/parkName'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { MenuDialog } from './MenuDialog'
import { NICKNAME_MAX, NICKNAME_PATTERN, checkNickname, nicknameProblem, updateNickname, type NicknameProblem } from './service'
import closeIcon from './icons/icon-close.svg'
import lockIcon from './icons/icon-lock.svg'
import errorIcon from './icons/icon-error.svg'
import doneIcon from './icons/icon-done.svg'
import arrowIcon from './icons/icon-arrow.svg'

type Check = { value: string; status: 'checking' | 'available' | NicknameProblem }

const helpText = {
  idle: ' 2~8자 · 한글, 영문, 숫자만 쓸 수 있어요. 바꾼 이름은 바로 공원에 보여요',
  format: '2~8자 한글, 영문, 숫자만 쓸 수 있어요.',
  taken: '이미 사용 중인 닉네임이에요. 다른 이름을 입력해 주세요.',
  unavailable: '지금은 닉네임을 확인할 수 없어요. 잠시 후 다시 시도해 주세요.',
  checking: '닉네임을 확인하고 있어요…',
  available: '사용할 수 있는 닉네임이에요. 저장을 눌러 바꿔 주세요.',
}

/** 내 정보: nickname change only; the character chosen at onboarding has no change API. */
export function ProfileDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (from: string, to: string) => void }) {
  const runtime = useParkRuntime()
  const session = useSession(useShallow(s => ({
    nickname: s.account?.nickname ?? '', balance: s.account?.balance ?? null,
    character: s.profiles[s.sessionId]?.character, channelName: s.channelName,
  })))
  const [value, setValue] = useState(session.nickname)
  const [check, setCheck] = useState<Check | null>(null)
  const [saving, setSaving] = useState(false)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  const changed = value !== session.nickname
  const valid = NICKNAME_PATTERN.test(value)
  const result = check?.value === value ? check.status : null
  const problem = changed && value && !valid ? 'format' : result === 'format' || result === 'taken' || result === 'unavailable' ? result : null
  const canCheck = changed && valid && result !== 'checking' && !saving
  const canSave = changed && result === 'available' && !saving
  const help = problem ?? (result === 'checking' || result === 'available' ? result : 'idle')

  async function runCheck() {
    if (!canCheck) return
    abort.current?.abort()
    const controller = abort.current = new AbortController()
    const target = value
    setCheck({ value: target, status: 'checking' })
    try {
      const available = await checkNickname(runtime, target, controller.signal)
      if (!controller.signal.aborted) setCheck({ value: target, status: available ? 'available' : 'taken' })
    } catch (error) {
      if (!controller.signal.aborted) setCheck({ value: target, status: nicknameProblem(error) })
    }
  }
  async function save() {
    if (!canSave) return
    const from = session.nickname, target = value
    setSaving(true)
    try {
      onSaved(from, await updateNickname(runtime, target))
    } catch (error) {
      // The GET check reserves nothing, so PATCH can still lose a race (409).
      setCheck({ value: target, status: nicknameProblem(error) })
      setSaving(false)
    }
  }

  return <MenuDialog label="내 정보" className="park-profile-dialog" onClose={onClose}>
    <header className="park-profile-dialog__header">
      <h2>내 정보</h2>
      <button type="button" className="park-menu-icon-button" aria-label="내 정보 닫기" onClick={onClose}><img src={closeIcon} alt="" /></button>
    </header>
    <div className="park-profile-summary">
      <span className="park-menu-avatar park-menu-avatar--large"><img src={avatarImage} alt="" /></span>
      <span className="park-profile-summary__info">
        <b>{session.nickname}</b>
        <small>{session.character === 'girl' ? '여자' : '남자'} 캐릭터 · {session.channelName ? `${parkName(session.channelName)}에서 산책 중` : '채널 선택 전'}</small>
      </span>
      <span className="park-profile-summary__balance">
        <img src={coinImage} alt="" />{session.balance === null ? '—' : session.balance.toLocaleString('ko-KR')}<i>냥</i>
      </span>
    </div>
    <form className="park-nickname" noValidate onSubmit={event => { event.preventDefault(); if (canSave) void save(); else void runCheck() }}>
      <div className="park-nickname__label">
        <label htmlFor="park-nickname-input">닉네임</label>
        <span>{value.length} / {NICKNAME_MAX}</span>
      </div>
      <div className="park-nickname__field" data-error={!!problem || undefined}>
        <input id="park-nickname-input" value={value} maxLength={NICKNAME_MAX} autoComplete="nickname" spellCheck={false}
          readOnly={saving} aria-invalid={!!problem} aria-describedby="park-nickname-help"
          onChange={event => setValue(event.target.value)} />
        <button type="button" disabled={!canCheck} onClick={() => void runCheck()}>중복 확인</button>
      </div>
      <p id="park-nickname-help" className="park-nickname__help" data-tone={problem ? 'error' : result === 'available' ? 'ok' : undefined}
        role={problem || result === 'available' ? 'status' : undefined}>
        {problem && <img src={errorIcon} alt="" />}{helpText[help]}
      </p>
    </form>
    <div className="park-profile-character">
      <span><b>캐릭터</b>{session.character === 'girl' ? '여자' : '남자'}</span>
      <small><img src={lockIcon} alt="" />처음 정한 캐릭터는 바꿀 수 없어요</small>
    </div>
    <div className="park-menu-actions park-menu-actions--end">
      <button type="button" className="park-menu-button" onClick={onClose}>취소</button>
      <button type="button" className="park-menu-button park-menu-button--primary" disabled={!canSave} onClick={() => void save()}>
        {saving ? '저장 중…' : '저장'}
      </button>
    </div>
  </MenuDialog>
}

export function NicknameDoneDialog({ from, to, onClose }: { from: string; to: string; onClose: () => void }) {
  return <MenuDialog label="닉네임 변경 완료" className="park-confirm-dialog park-confirm-dialog--center" onClose={onClose}>
    <header className="park-confirm-dialog__header">
      <span className="park-confirm-dialog__icon park-confirm-dialog__icon--done"><img src={doneIcon} alt="" /></span>
      <h2>닉네임을 바꿨어요</h2>
    </header>
    <p>지금부터 공원에 있는 모두에게 새 이름으로 보여요</p>
    <div className="park-nickname-change"><span>{from}</span><img src={arrowIcon} alt="에서" /><b>{to}</b></div>
    <button type="button" className="park-menu-button park-menu-button--primary park-menu-button--wide" data-autofocus onClick={onClose}>확인</button>
  </MenuDialog>
}
