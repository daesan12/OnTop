import { Component, type ReactNode } from 'react'
import { PaperPopup } from '../tableLobby/PaperPopup'

/** Keep the entry visible even before the lazy game bundle has loaded. */
export function CoopEntryStatus({ failed = false, onClose }: { failed?: boolean; onClose: () => void }) {
  return <div className="vr-zone-coop-entry"><PaperPopup title="VR 체험관 · 온탑 꼬치왕"
    label={failed ? '꼬치왕 화면 연결 안내' : '꼬치왕 입장 준비'} closeLabel="공원으로 돌아가기" onClose={onClose}>
    <h2>{failed ? '가게 화면을 불러오지 못했어요' : '가게를 준비하고 있어요'}</h2>
    <p role={failed ? 'alert' : 'status'}>{failed
      ? '연결 상태를 확인하고 새로고침해 주세요. 진행 중인 가게가 있다면 다시 연결할 수 있어요.'
      : '처음 입장할 때는 화면을 불러오는 데 잠시 시간이 걸릴 수 있어요.'}</p>
    <div className="paper-actions">{failed ? <button className="paper-primary" onClick={() => window.location.reload()}>새로고침</button> : null}
      <button onClick={onClose}>공원으로 돌아가기</button></div>
  </PaperPopup></div>
}

/** A failed lazy import must not remove the entire park or leave input blocked without a way back. */
export class CoopEntryBoundary extends Component<{ children: ReactNode; onClose: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? <CoopEntryStatus failed onClose={this.props.onClose} /> : this.props.children
  }
}
