import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import avatarImage from '../../assets/entry/park-avatar.webp'
import coinImage from '../../assets/entry/yeopjeon-icon.webp'
import { QUALITY_PRESETS, type QualityPreset } from '../../config/quality'
import { useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { WalletBalance } from '../wallet/WalletBalance'
import { MenuDialog } from './MenuDialog'
import { NicknameDoneDialog, ProfileDialog } from './ProfileDialog'
import { withdraw } from './service'
import profileIcon from './icons/icon-profile.svg'
import settingsIcon from './icons/icon-settings.svg'
import logoutIcon from './icons/icon-logout.svg'
import withdrawIcon from './icons/icon-withdraw.svg'
import logoutDialogIcon from './icons/dialog-logout.svg'
import warningIcon from './icons/dialog-warning.svg'
import chevronIcon from './icons/chevron-profile.svg'
import './parkMenus.css'

type Dialog = null | 'profile' | 'logout' | 'withdraw' | { from: string; to: string }

/** Account pill with the profile menu (내 정보 · 설정 · 로그아웃 · 회원 탈퇴). */
export function AccountMenu({ quality, exitError, onExit, onWithdrawn }: {
  quality: QualityPreset
  exitError: string
  onExit: () => void | Promise<void>
  onWithdrawn: () => void
}) {
  const account = useSession(useShallow(s => ({ nickname: s.account?.nickname ?? '정보 미연동', balance: s.account?.balance ?? null })))
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true })
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => {
      if (event.code !== 'Escape') return
      setOpen(false)
      trigger.current?.focus({ preventScroll: true })
    }
    window.addEventListener('pointerdown', outside, true)
    window.addEventListener('keydown', escape)
    return () => { window.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', escape) }
  }, [open])
  const choose = (next: Dialog) => { setOpen(false); setDialog(next) }

  return <div className="park-account" ref={root}>
    <div className="park-account__summary" aria-label="내 정보">
      <img className="park-account__coin" src={coinImage} alt="엽전" />
      <WalletBalance />
      <span className="park-account__separator" aria-hidden="true" />
      <button ref={trigger} type="button" className="park-account__trigger" aria-label="내 메뉴" aria-haspopup="menu"
        aria-expanded={open} aria-controls="park-account-menu" onClick={() => setOpen(value => !value)}>
        <span className="park-account__nickname">{account.nickname}</span>
        <span className="park-account__avatar"><img src={avatarImage} alt="내 캐릭터" /></span>
        <img className="park-chevron" src={chevronIcon} alt="" />
      </button>
    </div>
    {open && <div id="park-account-menu" className="park-menu-dropdown park-account-dropdown" role="menu" aria-label="내 메뉴">
      <div className="park-account-dropdown__header">
        <span className="park-menu-avatar"><img src={avatarImage} alt="" /></span>
        <span>
          <b>{account.nickname}</b>
          <small><img src={coinImage} alt="" />{account.balance === null ? '—' : account.balance.toLocaleString('ko-KR')}<i>냥</i></small>
        </span>
      </div>
      <hr />
      <button type="button" role="menuitem" className="park-menu-item" onClick={() => choose('profile')}>
        <img src={profileIcon} alt="" /><span><b>내 정보</b><small>닉네임 변경</small></span>
      </button>
      <button type="button" role="menuitem" className="park-menu-item" onClick={() => {
        setOpen(false)
        // The menu item unmounts, so the panel returns focus to the menu trigger.
        trigger.current?.focus({ preventScroll: true })
        window.dispatchEvent(new Event('ontop-open-graphics-settings'))
      }}>
        <img src={settingsIcon} alt="" /><span><b>설정</b><small>그래픽 품질 · {QUALITY_PRESETS[quality].label}</small></span>
      </button>
      <hr />
      <button type="button" role="menuitem" className="park-menu-item" onClick={() => choose('logout')}>
        <img src={logoutIcon} alt="" /><span><b>로그아웃</b></span>
      </button>
      <button type="button" role="menuitem" className="park-menu-item park-menu-item--danger" onClick={() => choose('withdraw')}>
        <img src={withdrawIcon} alt="" /><span><b>회원 탈퇴</b></span>
      </button>
    </div>}
    {exitError && <p className="park-exit-error" role="alert">{exitError}</p>}
    {dialog === 'profile' && <ProfileDialog onClose={() => setDialog(null)} onSaved={(from, to) => setDialog({ from, to })} />}
    {typeof dialog === 'object' && dialog && <NicknameDoneDialog {...dialog} onClose={() => setDialog(null)} />}
    {dialog === 'logout' && <LogoutDialog onClose={() => setDialog(null)} onExit={onExit} />}
    {dialog === 'withdraw' && <WithdrawDialog onClose={() => setDialog(null)} onWithdrawn={onWithdrawn} />}
  </div>
}

function LogoutDialog({ onClose, onExit }: { onClose: () => void; onExit: () => void | Promise<void> }) {
  const [pending, setPending] = useState(false)
  return <MenuDialog label="로그아웃 확인" className="park-confirm-dialog" onClose={onClose}>
    <header className="park-confirm-dialog__header">
      <span className="park-confirm-dialog__icon"><img src={logoutDialogIcon} alt="" /></span>
      <h2>로그아웃할까요?</h2>
    </header>
    <p>공원에서 나가고 로그인 화면으로 돌아가요.<br />다시 들어오려면 네이버나 SSAFY로 로그인해 주세요.</p>
    <div className="park-menu-actions">
      <button type="button" className="park-menu-button" onClick={onClose}>취소</button>
      <button type="button" className="park-menu-button park-menu-button--primary" disabled={pending}
        onClick={() => { setPending(true); void Promise.resolve(onExit()).finally(onClose) }}>로그아웃</button>
    </div>
  </MenuDialog>
}

function WithdrawDialog({ onClose, onWithdrawn }: { onClose: () => void; onWithdrawn: () => void }) {
  const runtime = useParkRuntime()
  const [agreed, setAgreed] = useState(false)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  async function confirm() {
    setPending(true); setFailed(false)
    try {
      await withdraw(runtime)
      onWithdrawn()
    } catch {
      setFailed(true); setPending(false)
    }
  }
  return <MenuDialog label="회원 탈퇴 확인" className="park-confirm-dialog" onClose={() => { if (!pending) onClose() }}>
    <header className="park-confirm-dialog__header">
      <span className="park-confirm-dialog__icon park-confirm-dialog__icon--danger"><img src={warningIcon} alt="" /></span>
      <h2>정말 탈퇴할까요?</h2>
    </header>
    <p>탈퇴하면 바로 로그아웃되고 공원에 들어올 수 없어요.</p>
    <ul className="park-withdraw-notes">
      <li>탈퇴 후 7일 안에 다시 로그인하면 계정을 되살릴 수 있어요</li>
      <li>7일이 지나면 같은 계정으로 바로 다시 가입할 수 없어요</li>
      <li>쓰던 닉네임은 탈퇴 후에도 다른 사람이 쓸 수 없어요</li>
    </ul>
    <label className="park-withdraw-agree">
      <input type="checkbox" checked={agreed} disabled={pending} onChange={event => setAgreed(event.target.checked)} />
      안내를 모두 확인했습니다
    </label>
    {failed && <p className="park-menu-error" role="alert">탈퇴를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.</p>}
    <div className="park-menu-actions">
      <button type="button" className="park-menu-button" disabled={pending} onClick={onClose}>취소</button>
      <button type="button" className="park-menu-button park-menu-button--danger" disabled={!agreed || pending} onClick={() => void confirm()}>
        {pending ? '처리 중…' : '탈퇴하기'}
      </button>
    </div>
  </MenuDialog>
}
