import { HallIcon } from './serviceHall/Icons'
import { closingTime } from './closingTime'
import './businessStatus.css'

export function businessStatus(seconds: number, score: number, served: number) {
  const s = Math.max(0, Math.ceil(seconds))
  return [
    { label: '남은 영업시간', value: `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`, unit: '', icon: 'clock', testId: 'remaining-time' },
    { label: '팀 점수', value: score.toLocaleString('ko-KR'), unit: '점', icon: 'score', testId: 'team-score' },
    { label: '서빙 완료', value: String(served), unit: '팀', icon: 'check', testId: 'served-count' },
  ] as const
}

export function BusinessStatus({ seconds, score, served, paused = false }: { seconds: number; score: number; served: number; paused?: boolean }) {
  return <header className="skewer-business-status" aria-label="영업 상태" data-clock-phase={closingTime(seconds).phase} data-paused={paused}>
    <span className="skewer-business-alert" role="status" aria-live="polite">{closingTime(seconds).message}</span>
    {businessStatus(seconds, score, served).map(item => <div className="skewer-business-stat" key={item.icon}>
      <HallIcon name={item.icon} /><span>{item.label}<strong><span data-testid={item.testId}>{item.value}</span>{item.unit ? <small>{item.unit}</small> : null}</strong></span>
    </div>)}
  </header>
}

/** The immersive scoreboard uses the same metrics and warm serving-bar styling. */
export function paintBusinessStatus(ctx: CanvasRenderingContext2D, seconds: number, score: number, served: number, pulse: number) {
  ctx.clearRect(0, 0, 1200, 240)
  ctx.fillStyle = '#563a2b'; ctx.beginPath(); ctx.roundRect(8, 8, 1184, 224, 36); ctx.fill()
  ctx.strokeStyle = '#d6b783'; ctx.lineWidth = 4; ctx.stroke()
  if (closingTime(seconds).phase !== 'normal') {
    ctx.fillStyle = `rgba(255,214,132,${pulse * .25})`; ctx.fill()
    ctx.strokeStyle = `rgba(255,226,165,${.45 + pulse * .55})`; ctx.lineWidth = 9; ctx.stroke()
  }
  businessStatus(seconds, score, served).forEach((item, i) => {
    const x = i * 400 + 232
    ctx.save(); ctx.translate(i * 400 + 58, 130); ctx.strokeStyle = '#edce8f'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath()
    if (i === 0) { ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(0, 1); ctx.lineTo(12, 9) }
    else if (i === 1) {
      for (let point = 0; point < 10; point++) { const angle = -Math.PI / 2 + point * Math.PI / 5, radius = point % 2 ? 12 : 26; if (point === 0) ctx.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius); else ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius) }
      ctx.closePath(); ctx.fillStyle = '#e9c16e'; ctx.fill()
    } else { ctx.moveTo(-21, 1); ctx.lineTo(-5, 17); ctx.lineTo(23, -19) }
    ctx.stroke(); ctx.restore()
    if (i) { ctx.strokeStyle = '#e3cfad55'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(i * 400, 42); ctx.lineTo(i * 400, 198); ctx.stroke() }
    ctx.textAlign = 'center'; ctx.fillStyle = '#e0d0b1'; ctx.font = '30px "Malgun Gothic",sans-serif'; ctx.fillText(item.label, x, 70)
    ctx.fillStyle = '#fff7e7'; ctx.font = '700 68px "Malgun Gothic",sans-serif'; ctx.fillText(item.value + item.unit, x, 163, 280)
  })
}
