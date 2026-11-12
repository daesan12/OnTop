import { STONE_RUMBLE_ENABLED, TABLE_GAMES, type TableGameCode } from '../tableLobby/model'
import { STONE_RUMBLE_ANCHOR_ID } from '../../game/stone-rumble/entrance'
import { renewalMap } from '../../park/renewalMap'
import { SKEWER_COOP_ENABLED } from '../skewer/coop/availability'

import fruitArt from '../../game/halligalli/assets/thumbnail.webp'
import ledgerArt from '../../game/ledger/assets/thumbnail.webp'
import alkkagiArt from '../../game/alkkagi/assets/thumbnail.webp'
import bungeoppangArt from './art/bungeoppang-fortune-v1.png'
import jumpmapArt from './art/jumpmap-fortune-v1.png'
import moleArt from './art/mole-fortune-v1.png'
import speedMoleArt from './art/speed-mole-fortune-v1.png'
import rpsArt from './art/rps-roulette-fortune-v1.png'
import plusMinusArt from './art/plus-minus-fortune-v1.png'
import stoneRumbleArt from './art/stone-rumble-fortune-v2.png'
import guguJumpRopeArt from './art/gugu-jump-rope-fortune-v1.png'
import skewerArt from './art/skewer-fortune-v1.png'

type FortuneDestination = 'table' | 'mini' | 'jumpmap' | 'arcade' | 'vr' | 'pagoda'
export type FortuneCardContent = { id: string; name: string; title: string; omen: string; advice: string; symbol: string; art: string; destination?: FortuneDestination }
export type FortuneGame = FortuneCardContent & { destination: FortuneDestination }

const jumpRopeCard: FortuneGame = {
  id: 'gugu-jump-rope',
  name: '구구구 줄넘기',
  title: '가볍게 넘는 신기록',
  omen: '오늘은 발끝과 박자가 딱 맞을 것 같아요. 비둘기들이 돌리는 줄을 가볍게 넘으며 구구구 줄넘기의 새 기록에 도전해보세요.',
  advice: '다가오는 줄의 박자를 살피고, 뛰어오르는 타이밍을 일정하게 이어가세요.',
  symbol: '跳',
  art: guguJumpRopeArt,
  destination: 'mini',
}
const jumpRopeAvailable = renewalMap?.data.interactions.recreation?.some(entry => entry.id === 'pigeon-jump-rope') === true
const skewerAvailable = SKEWER_COOP_ENABLED && !!renewalMap?.data.interactions.vrEntrance
const skewerCard: FortuneGame = {
  id: 'skewer',
  name: '온탑 꼬치왕',
  title: '손발이 척척 맞는 날',
  omen: '오늘은 친구와 호흡이 잘 맞을 것 같아요. 온탑 꼬치왕에서 주문에 맞는 꼬치를 함께 만들어보세요.',
  advice: '주문표를 먼저 확인하고, 필요한 재료를 서로 알려주세요.',
  symbol: '炙',
  art: skewerArt,
  destination: 'vr',
}

const tableOmens: Partial<Record<TableGameCode, Omit<FortuneGame, 'id' | 'name' | 'destination'>>> = {
  OMOK: { title: '다섯 수 앞의 직감', omen: '오늘은 숨은 한 수가 눈에 들어오는 날. 오목에서 승리의 흐름을 잡을 수 있겠어요.', advice: '서두르지 말고 상대가 놓친 자리를 찾아보세요.', symbol: '五', art: '/art/tablet/omok.webp' },
  DICE: { title: '손끝에 깃든 행운', omen: '주사위가 당신 편을 들어줄 것 같은 날. 주사위 한 판에서 멋진 점수에 도전해보세요.', advice: '좋은 흐름에도 점수를 챙기는 타이밍을 기억하세요.', symbol: '⚄', art: '/art/tablet/dice-v2.webp' },
  ONE_CARD: { title: '마지막 한 장의 주인', omen: '필요한 카드가 찾아올 것 같은 예감. 원카드에서 짜릿한 역전승을 노려볼 만해요.', advice: '마지막 한 장이 남으면 원카드 선언을 잊지 마세요.', symbol: '♠', art: '/art/tablet/onecard-v2.webp' },
  DICE_LEDGER: { title: '장부에 새길 대기록', omen: '빈칸마다 좋은 숫자가 모일 기운이에요. 주사위 장부에서 나만의 최고 점수를 세울 수 있겠어요.', advice: '지금의 점수와 남은 칸을 함께 살펴보세요.', symbol: '帳', art: ledgerArt },
  HALLI_GALLI: { title: '번개 같은 손놀림', omen: '눈과 손의 호흡이 잘 맞을 것 같은 날. 과일 땡에서 누구보다 빠르게 승기를 잡아보세요.', advice: '같은 과일이 정확히 다섯 개일 때 종을 울리세요.', symbol: '✦', art: fruitArt },
  ALKKAGI: { title: '한 번에 꿰뚫는 기세', omen: '섬세한 힘 조절이 빛날 기운이에요. 알까기에서 멋진 한 방으로 승리를 노려보세요.', advice: '각도와 힘을 함께 살피면 기회가 보여요.', symbol: '○', art: alkkagiArt },
}

const stoneRumbleAvailable = STONE_RUMBLE_ENABLED && renewalMap?.data.tables.some(table => table.id === STONE_RUMBLE_ANCHOR_ID)
const stoneRumbleCard: FortuneGame = {
  id: 'STONE_RUMBLE', name: '돌탑 생존전', title: '끝까지 남을 발걸음',
  omen: '다음 한 걸음이 또렷하게 보일 것 같은 날. 돌탑 생존전에서 마지막까지 남는 주인공에 도전해보세요.',
  advice: '밟은 발판에 머무르지 말고 다음 착지점을 먼저 살펴보세요.',
  symbol: '生', art: stoneRumbleArt, destination: 'pagoda',
}

/** Follow the actual table selector's availability; unfinished games never enter the draw. */
export const FORTUNE_GAMES: readonly FortuneGame[] = [
  ...TABLE_GAMES.flatMap(game => {
    const omen = tableOmens[game.code]
    return game.playable && omen ? [{ ...omen, id: game.code, name: game.name, destination: 'table' as const }] : []
  }),
  { id: 'bungeoppang', name: '붕어빵 굽기', title: '노릇노릇한 대박 예감', omen: '오늘은 굽는 타이밍이 딱 맞을 것 같아요. 붕어빵 굽기에서 새로운 기록을 세울 수 있겠어요.', advice: '한눈팔지 않고 익는 순간을 지켜보세요.', symbol: '福', art: bungeoppangArt, destination: 'mini' },
  { id: 'jumpmap', name: '돌탑 점프맵', title: '구름을 딛는 발걸음', omen: '발끝이 유난히 가벼운 날. 돌탑 점프맵에서 한 층 더 높이, 더 빠른 기록에 도전해보세요.', advice: '다음 발판을 먼저 보고 한 걸음씩 올라가세요.', symbol: '雲', art: jumpmapArt, destination: 'jumpmap' },
  { id: 'whack-a-mole', name: '두더지 잡기', title: '손끝으로 이어지는 대기록', omen: '오늘은 눈과 손이 척척 맞을 것 같아요. 두더지 잡기에서 콤보를 이어 나만의 최고 기록에 도전해보세요.', advice: '두더지가 나온 구멍을 정확히 노리고 빈 구멍은 피하세요.', symbol: '捷', art: moleArt, destination: 'arcade' },
  { id: 'speed-mole', name: '스피드 두더지 잡기', title: '손끝에 붙은 속도', omen: '빠른 판단과 정확한 손놀림이 빛날 것 같은 날이에요. 스피드 두더지 잡기에서 60초의 새 기록에 도전해보세요.', advice: '위 RTYU, 아래 FGHJ의 8개 구멍을 살피세요. 빠르기만큼 정확도도 중요해요.', symbol: '速', art: speedMoleArt, destination: 'arcade' },
  { id: 'rps-roulette', name: '가위바위보 룰렛', title: '한 수에 찾아오는 좋은 예감', omen: '오늘은 선택의 순간에 좋은 예감이 함께해요. 가위바위보 룰렛에서 기분 좋은 한 판을 만나보세요.', advice: '참가비와 남은 횟수를 확인하고, 더 도전할지 멈출지 천천히 정하세요.', symbol: '運', art: rpsArt, destination: 'arcade' },
  { id: 'plus-minus', name: '더하기 빼기 아케이드', title: '좋은 수가 모이는 하루', omen: '숫자들이 기분 좋게 모일 것 같은 날이에요. 더하기 빼기 아케이드에서 오늘의 한 판을 즐겨보세요.', advice: '세 칸을 차례로 멈춰보세요. 멈추는 타이밍이 결과를 바꾸지는 않아요.', symbol: '數', art: plusMinusArt, destination: 'arcade' },
  ...(jumpRopeAvailable ? [jumpRopeCard] : []),
  ...(skewerAvailable ? [skewerCard] : []),
  ...(stoneRumbleAvailable ? [stoneRumbleCard] : []),
]

/** Preview cards stay out of the live draw until their games are integrated. */
export const FORTUNE_PENDING_GAMES: readonly FortuneCardContent[] = [
  ...(stoneRumbleAvailable ? [] : [stoneRumbleCard]),
  ...(jumpRopeAvailable ? [] : [jumpRopeCard]),
]

export function parseFortuneNickname(value: string): string | null {
  const name = value.normalize('NFC').trim()
  return name.length >= 1 && name.length <= 20 && !/[\p{Cc}\p{Cf}]/u.test(name) ? name : null
}

export function drawFortune(previousId = '', random = Math.random): FortuneGame {
  const choices = FORTUNE_GAMES.filter(game => game.id !== previousId)
  return choices[Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)))]!
}

export function drawFortuneDeck(previousId = '', random = Math.random): FortuneGame[] {
  const pool = FORTUNE_GAMES.filter(game => game.id !== previousId)
  return Array.from({ length: Math.min(3, pool.length) }, () => {
    const index = Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)))
    return pool.splice(index, 1)[0]!
  })
}
