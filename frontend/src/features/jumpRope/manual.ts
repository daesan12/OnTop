import type { GameManual } from '../manual/types'

export const jumpRopeManual: GameManual = {
  id: 'jump-rope', status: 'available', category: 'minigame', title: '구구구 줄넘기',
  subtitle: '비둘기들이 당신을 시험합니다.', keywords: '구구구 줄넘기 비둘기 전깃줄 오락기 완주 엽전 랭킹',
  players: '1명', goal: '비둘기가 돌리는 줄을 넘으며 60초 완주하기', timing: '준비 3초 · 플레이 60초',
  summary: '비둘기들이 돌리는 줄을 넘으며 60초 완주에 도전해요. MISS가 세 번이면 경기가 끝나요.',
  flow: [
    { title: '참가', body: '공원 오락기에서 구구구 줄넘기를 고르고 게임 시작을 눌러요. 3·2·1·GO 카운트다운 뒤 시작해요.' },
    { title: '줄넘기', body: '줄이 발밑에 오기 전에 Space를 눌러 뛰어요. PERFECT를 이어가면 두 번째부터 한 번에 30점을 받아요.' },
    { title: '결과', body: '60초를 버티면 정상 완주예요. MISS가 세 번이면 60초 전에 끝나요.' },
  ],
  keys: [['Space', '점프'], ['Esc', '그만하기·다시하기 확인']],
  points: [
    'GOOD 판정은 10점이에요.',
    '첫 PERFECT는 15점, 2연속 이상 PERFECT는 매번 30점이에요.',
    'GOOD 또는 MISS가 나오면 PERFECT 콤보가 초기화돼요. MISS는 0점이에요.',
  ],
  sections: [
    { id: 'jump-rope-reward', title: '참가비와 엽전', paragraphs: ['참가비는 무료예요. 60초를 완주하면 서버가 확정한 점수 50점당 1냥을 받아요. 실제 지급액은 미니게임 공통 하루 상한의 남은 범위에서 결정돼요.', 'MISS 세 번으로 조기 종료하면 엽전은 받지 못해요.'] },
    { id: 'jump-rope-rankings', title: '최고 기록과 랭킹', paragraphs: ['서버에서 확정한 최고 점수로 순위를 매겨요. 게임 메인 화면의 랭킹 보기에서 확인할 수 있어요.'] },
  ],
}
