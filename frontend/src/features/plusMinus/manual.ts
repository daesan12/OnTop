import type { GameManual } from '../manual/types'
import { PlusMinusExamplesFigure, PlusMinusMachineFigure } from './manualArt'

export const plusMinusManual: GameManual = {
  id: 'plus-minus', status: 'available', category: 'minigame', title: '더하기 빼기 아케이드', subtitle: '숫자와 부호를 멈춰 계산해요',
  keywords: '더하기 빼기 아케이드 게임기 오락기 숫자 계산 정지 잭팟 JACKPOT 엽전 붕어빵',
  players: '1명', goal: '계산 결과만큼 엽전 받기',
  timing: '버튼마다 5초 · 횟수 제한 없음',
  summary: '붕어빵 가게 옆 오락기에서 더하기 빼기를 골라 30냥을 넣고 숫자1 · 더하기/빼기 · 숫자2를 차례로 멈춰요. 결과가 1 이상이면 결과 × 10냥을 받아요.',
  flow: [
    { title: '30냥 넣고 START', body: 'START를 누르면 참가비 30냥과 오늘 판 수가 함께 빠지고 세 원판이 돌기 시작해요.' },
    { title: '1번 → 2번 → 3번 정지', body: '불이 켜진 버튼만 누를 수 있어요. 숫자1, 더하기·빼기, 숫자2 순서로 멈춰요.' },
    { title: '계산하기', body: '멈춘 세 칸으로 "숫자1 ± 숫자2"를 계산해 LED에 보여 줘요.' },
    { title: '결과 × 10냥 받기', body: '결과가 1 이상이면 결과 × 10냥, 0 이하면 꽝이에요. 7과 JACKPOT이 함께 서면 500냥!' },
  ],
  keys: [['1 / 2 / 3', '1번 정지 / 2번 정지 / 3번 정지'], ['Enter', 'START'], ['Esc', '게임기 닫기'], ['E', '오락기 앞에서 열고 더하기 빼기 고르기']],
  points: [
    '결과는 START를 누를 때 서버가 정해요. 정지 버튼은 멈추는 순간을 고르는 재미이고 결과를 바꾸지 않아요.',
    '버튼을 누르면 릴이 조금 미끄러지다 멈춰요. 5초 안에 누르지 않으면 저절로 멈춰요.',
    'JACKPOT은 숫자1이 7일 때만 500냥이에요. 다른 숫자와 함께 서면 꽝이에요.',
    '창을 닫거나 나가도 이미 정해진 결과는 그대로 지갑에 반영돼요.',
    '배당은 보상이 아니라서 미니게임 하루 1000냥 한도와 따로예요. 플레이 횟수 제한은 없어요.',
  ],
  sections: [
    { id: 'plus-minus-machine', title: '게임기 살펴보기', figure: { caption: '불빛이 도는 칸에서 멈춘 값이 가운데 LED에 떠요.', render: PlusMinusMachineFigure },
      paragraphs: ['지금 누를 수 있는 버튼만 테두리에 불이 켜져요.'] },
    { id: 'plus-minus-examples', title: '계산 예시', figure: { caption: '결과 × 10냥, 0 이하는 꽝', render: PlusMinusExamplesFigure },
      paragraphs: ['가장 큰 계산 결과는 8 + 9 = 17로 170냥이에요.'] },
    { id: 'plus-minus-reels', title: '원판 구성과 확률',
      table: { headers: ['원판', '칸 구성'], rows: [
        ['숫자1 (16칸)', '0·1·2 각 3칸, 3 2칸, 4·5·6·7·8 각 1칸'],
        ['더하기·빼기 (8칸)', '+ 4칸, − 4칸'],
        ['숫자2 (16칸)', '1·2 각 3칸, 0·3 각 2칸, 4·5·6·8·9·JACKPOT 각 1칸'],
      ] },
      paragraphs: ['칸 수가 곧 확률이에요. 서버가 원판마다 한 칸을 똑같은 확률로 골라요.'] },
    { id: 'plus-minus-odds', title: '얼마나 자주 받나요?',
      table: { headers: ['결과', '받는 엽전', '확률'], rows: [
        ['꽝 (결과 0 이하)', '0냥', '29.3%'], ['JACKPOT 꽝 (숫자1이 7이 아님)', '0냥', '5.9%'],
        ['결과 1~2', '10~20냥', '16.6%'], ['결과 3', '30냥', '8.2%'], ['결과 4~9', '40~90냥', '31.4%'],
        ['결과 10~17', '100~170냥', '8.2%'], ['7 + JACKPOT', '500냥', '0.4%'],
      ] },
      tip: '한 판 평균 약 35.7냥을 받아요. 참가비 30냥보다 조금 많지만 판마다 결과는 달라요.' },
  ],
}
