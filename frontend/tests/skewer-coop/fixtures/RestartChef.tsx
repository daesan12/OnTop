import { useState } from 'react'
import type { ChefDriver } from '../../../src/features/skewer/coop/drivers'

// Session lifecycle callback double: production keeps VR selection disabled until device QA.
export default function RestartChef({ driver, onXRChanged, preferredMode }: {
  driver: ChefDriver; onXRChanged: (active: boolean) => void; preferredMode: string
}) {
  const [active, setActive] = useState(false)
  const change = (value: boolean) => { setActive(value); onXRChanged(value) }
  return <section aria-label="모의 요리사" style={{ position: 'fixed', top: 100, left: 20, color: '#fff' }}>
    <p>선택 모드 {preferredMode} / 실제 세션 {active ? '연결' : '해제'}</p>
    <button onClick={() => change(true)}>모의 VR 연결</button>
    <button onClick={() => setTimeout(() => change(true), 3000)}>모의 VR 연결 예약</button>
    <button onClick={() => change(false)}>모의 VR 종료</button>
    <button onClick={() => driver.action({ type: 'restartAccept' })}>3D 동의 선택</button>
    <button onClick={() => driver.action({ type: 'restartDecline' })}>3D 거절 선택</button>
  </section>
}
