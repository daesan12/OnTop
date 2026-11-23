import type { GameManual } from '../manual/types'
import { LAP_REWARD, REWARDS, STAGES, renewalCourse } from './activeCourse'

const guideLocation = renewalCourse ? '점프맵 비석' : '출발 표식'

export const jumpManual: GameManual = {
  id: 'jump', status: 'available', category: 'minigame', title: '돌탑 점프맵', subtitle: renewalCourse ? '열 구간의 하늘길' : '일곱 구간의 하늘길',
  keywords: '돌탑 점프맵 석탑 오목돌 붕어빵 구름 청사초롱 방패연 연잎 ASMR',
  players: '1명', goal: renewalCourse ? '10구간을 지나 호수섬까지 가장 빠르게 완주' : '7구간을 지나 마지막 연잎까지 가장 빠르게 완주',
  timing: '첫 발판에서 바로 도전 · 떨어져도 다시 도전',
  summary: `첫 번째 돌을 밟으면 바로 시작해요. ${guideLocation}에서 E로 안내를 볼 수 있어요.`,
  flow: [
    { title: '출발 안내는 원할 때만', body: `${guideLocation} 가까이에서 E를 눌러 안내를 읽어요. 바로 첫 발판으로 가도 돼요.` },
    { title: '첫 발판에서 바로 시작', body: '안내를 닫고 돌탑의 첫 발판을 밟으면 바로 도전이 시작돼요. 별도 시작 버튼이나 순간 이동은 없어요.' },
    { title: `${STAGES.length}구간 통과`, body: `${STAGES.map(stage => stage.name).join(' → ')}. 관문을 순서대로 지나가요.` },
    { title: '완주 기록 확인', body: renewalCourse
      ? '마지막 오리를 밟고 호수섬에 착지하면 완주해요. 기록을 확인하고 계속하기를 누르면 공원에서 다시 이동할 수 있어요.'
      : '마지막 연잎을 밟으면 시간이 멈추고 완료 화면에서 기록과 랭킹을 확인해요. 계속하기나 Esc로 닫으면 공원에서 다시 움직일 수 있어요.' },
    { title: '다시 도전', body: '떨어져도 받은 엽전은 유지돼요. 출발 자리로 걸어 돌아와 첫 발판을 밟으면 바로 다시 시작해요.' },
  ],
  keys: [['WASD', '이동'], ['Space', '점프'], ['Shift', '달리기'], ['E', `${guideLocation}에서 안내 보기`], ['F1', '놀이 방법'], ['M', '공원 지도']],
  points: [
    '소리들으며 플레이 하면 재미가 2배!! 발판마다 다른 착지 소리를 즐겨보세요. 설정에서 효과음 음량을 조절할 수 있어요.',
    '타임어택 랭킹이 있어요. 완주 화면의 타임어택 랭킹 보기에서 개인 최고 기록과 순위를 확인하세요.',
    '세이브 포인트가 없어요. 출발 자리까지 직접 걸어 돌아가요. 순간 이동은 없어요.',
    `구간 보상은 ${REWARDS.join('·')}냥 (완주 합계 ${LAP_REWARD}냥)이에요. 일일 획득 제한 없이 서버 지급 결과를 따라요.`,
    '동일 기록은 공동 순위예요. 먼저 도착한 사람이 위에 표시돼요.',
    '낙하 결과창은 뜨지 않아요. 짧은 보상 알림과 작은 구간·엽전 표시로 진행 상태를 확인해요.',
  ],
  sections: [{ id: 'jump-route', title: '함께 즐기는 하늘길', paragraphs: [
    '코스 위 캐릭터는 서로 통과해요. 가까이 겹친 다른 캐릭터는 흐리게 보여요.',
    '발판마다 착지 반응과 소리가 달라요. 깨짐·눌림·빛·물 반응 뒤 발판은 복원돼요. 설정에서 효과음을 조절할 수 있어요.',
    '서버가 코스 준비를 확인하면 발판이 열려요. 코스가 준비 중이면 잠시 기다려 주세요.',
  ] }],
}
