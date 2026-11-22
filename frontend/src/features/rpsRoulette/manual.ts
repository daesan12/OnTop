import type { GameManual } from '../manual/types'
import { RpsHandsFigure, RpsLadderFigure, RpsMachineFigure } from './manualArt'

export const rpsRouletteManual: GameManual = {
  id: 'rps-roulette', status: 'available', category: 'minigame', title: '가위바위보 룰렛', subtitle: '이기면 돌리고, 더 걸면 두 배',
  keywords: '가위바위보 룰렛 게임기 오락기 엽전 배수 도전 대박 붕어빵',
  players: '1명', goal: '기계를 이기고 룰렛으로 엽전 받기',
  timing: '대결 5초 · 선택 10초 · 횟수 제한 없음',
  summary: '붕어빵 가게 옆 게임기에서 참가비를 넣고 기계와 가위바위보를 해요. 이기면 룰렛이 돌아 참가비 × 칸 × 배수만큼 엽전을 받아요.',
  flow: [
    { title: '참가비 고르고 START', body: '10·20·30냥 중 하나를 고르고 START를 눌러요. 이때 참가비와 오늘 판 수가 함께 빠져요.' },
    { title: '5초 안에 손 내기', body: '가운데 LED에 손이 번갈아 떠요. 바위·가위·보 버튼(1·2·3)을 누르면 기계가 미리 정한 손이 공개돼요.' },
    { title: '이기면 멈출지 도전할지', body: '10초 안에 멈춤을 누르면 지금 배수로 룰렛이 돌아요. 도전하면 한 번 더 가위바위보를 해요.' },
    { title: '룰렛 칸만큼 받기', body: '불빛이 멈춘 칸의 숫자 × 참가비 × 배수만큼 엽전이 들어와요.' },
  ],
  keys: [['1 / 2 / 3', '바위 / 가위 / 보'], ['Enter', 'START'], ['Esc', '게임기 닫기'], ['E', '오락기 앞에서 열고 가위바위보 룰렛 고르기']],
  points: [
    '기계 손은 바위·가위·보가 각각 1/3이에요. 버튼을 누르기 전에 서버가 정하고 확인용 해시를 먼저 보내요.',
    '비기면 엽전 없이 바로 다시 대결해요.',
    '시간 안에 누르지 않으면 서버가 무작위 손을 대신 내고, 선택 시간이 지나면 지금 배수로 자동으로 멈춰요.',
    '손이 공개된 판은 창을 닫거나 나가도 결과가 적용돼요.',
    '배당은 보상이 아니라서 미니게임 하루 1000냥 한도와 따로예요. 플레이 횟수 제한은 없어요.',
  ],
  sections: [
    { id: 'rps-machine', title: '게임기 살펴보기', figure: { caption: '가운데 LED에는 기계가 낸 손 하나만 떠요.', render: RpsMachineFigure },
      paragraphs: ['참가비 스위치에서 금액을 고른 뒤 START를 누르면 시작해요. 지금 누를 수 있는 버튼만 테두리에 불이 켜져요.'] },
    { id: 'rps-hands', title: '기계가 내는 손', figure: { caption: '바위 · 가위 · 보', render: RpsHandsFigure },
      paragraphs: ['바위는 가위를, 가위는 보를, 보는 바위를 이겨요. 공개 뒤에는 결과 리본(이겼다·비겼다·졌다)이 켜져요.'] },
    { id: 'rps-challenge', title: '도전과 배수', figure: { caption: '도전은 두 번까지, 지면 꽝이에요.', render: RpsLadderFigure },
      table: { headers: ['단계', '배수', '지면'], rows: [['이긴 직후 멈춤', '×1.0', '-'], ['도전 1차 성공', '×2.0', '꽝 (0냥)'], ['도전 2차 성공', '×4.0', '꽝 (0냥)']] },
      tip: '2차 도전까지 성공하면 바로 룰렛이 돌아요. 배수 LED의 불빛으로 지금 단계를 확인해요.' },
    { id: 'rps-roulette-cells', title: '룰렛 30칸 구성',
      table: { headers: ['칸 숫자', '칸 수', '이겼을 때 확률'], rows: [
        ['1', '15칸', '50.0%'], ['2', '7칸', '23.3%'], ['3', '3칸', '10.0%'], ['4', '2칸', '6.7%'],
        ['5 · 7 · 10', '각 1칸', '각 3.3%'],
      ] },
      paragraphs: ['칸 수가 곧 확률이에요. 서버가 30칸 중 한 칸을 똑같은 확률로 골라요.', '받는 엽전 = 참가비 × 칸 숫자 × 배수. 한 판 최대 30냥 × 10칸 × 4.0 = 1,200냥이에요.'] },
  ],
}
