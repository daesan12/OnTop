const presentations = {
  normal: { phase: 'normal', label: '남은 시간', message: '', color: '#ffe8ba' },
  warning: { phase: 'warning', label: '마감까지 1분', message: '남은 시간 1분! 마무리를 준비해 주세요.', color: '#ffd17c' },
  urgent: { phase: 'urgent', label: '마감 임박', message: '30초 남았어요! 서빙을 마무리해 주세요.', color: '#ffb099' },
  critical: { phase: 'critical', label: '곧 종료', message: '마지막 10초! 곧 영업이 끝나요.', color: '#ffb099' },
} as const

export function closingTime(remaining: number) {
  const seconds = Number.isFinite(remaining) ? Math.max(0, Math.ceil(remaining)) : 0
  return presentations[seconds === 0 || seconds > 60 ? 'normal' : seconds <= 10 ? 'critical' : seconds <= 30 ? 'urgent' : 'warning']
}
