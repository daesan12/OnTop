import type { BangAction, BangCard, BangCharacter, BangRole, CardKind } from './protocol'

export const GAME_NAME = '탑골 총잡이'

export const ROLE_NAME: Record<BangRole, string> = { SHERIFF: '보안관', DEPUTY: '부관', OUTLAW: '무법자', RENEGADE: '배신자' }
export const ROLE_GOAL: Record<BangRole, string> = { SHERIFF: '무법자와 배신자를 모두 제거하세요.', DEPUTY: '보안관을 지키고 무법자와 배신자를 제거하세요.', OUTLAW: '보안관을 제거하세요.', RENEGADE: '마지막 한 사람으로 살아남으세요.' }
export const CARD_NAME: Record<CardKind, string> = { BANG: '사격', MISSED: '회피', BEER: '맥주', SALOON: '주점', DUEL: '결투', INDIANS: '습격', GATLING: '기관총', STAGECOACH: '역마차', WELLS_FARGO: '보급 마차', GENERAL_STORE: '잡화점', PANIC: '강탈', CAT_BALOU: '장비 파괴', BARREL: '술통', JAIL: '감옥', DYNAMITE: '다이너마이트', MUSTANG: '야생마', SCOPE: '조준경', VOLCANIC: '연발 권총', SCHOFIELD: '장거리 권총', REMINGTON: '사냥 소총', REV_CARABINE: '연발 소총', WINCHESTER: '명사수 소총' }
export const CARD_DESCRIPTION: Record<CardKind, string> = {
  BANG: '사거리 안의 한 사람을 공격해요. 한 턴에 1장.', MISSED: '사격이나 기관총 공격을 1회 피할 때 사용해요.', BEER: '생명력 1 회복. 최후의 2인에게는 효과가 없어요.', SALOON: '생존자 모두 생명력을 1 회복해요.', DUEL: '거리와 관계없이 번갈아 사격을 버려요.', INDIANS: '다른 생존자는 사격을 버리거나 생명력 1을 잃어요.', GATLING: '다른 생존자 모두에게 사격 공격.', STAGECOACH: '카드 2장을 뽑아요.', WELLS_FARGO: '카드 3장을 뽑아요.', GENERAL_STORE: '나부터 시계 방향으로 공개된 카드 1장씩 선택.', PANIC: '거리 1인 사람의 무작위 손패나 공개 장비를 가져와요.', CAT_BALOU: '거리와 관계없이 손패 1장이나 공개 장비를 버려요.', BARREL: '사격 공격마다 판정 1회. 하트면 회피.', JAIL: '보안관을 제외한 사람에게 설치. 하트가 아니면 다음 턴을 쉬어요.', DYNAMITE: '다음 턴 시작에 스페이드 2~9면 피해 3. 아니면 다음 사람에게.', MUSTANG: '다른 사람이 나를 보는 거리 +1.', SCOPE: '내가 다른 사람을 보는 거리 -1.', VOLCANIC: '사거리 1 · 사격 사용 횟수 무제한.', SCHOFIELD: '공격 사거리 2인 무기예요.', REMINGTON: '공격 사거리 3인 무기예요.', REV_CARABINE: '공격 사거리 4인 무기예요.', WINCHESTER: '공격 사거리 5인 무기예요.',
}

export const WEAPON_RANGE: Partial<Record<CardKind, number>> = { VOLCANIC: 1, SCHOFIELD: 2, REMINGTON: 3, REV_CARABINE: 4, WINCHESTER: 5 }
export function cardCategory(kind: CardKind) {
  return WEAPON_RANGE[kind] ? '무기' : ['BARREL', 'JAIL', 'DYNAMITE', 'MUSTANG', 'SCOPE'].includes(kind) ? '지속 장비'
    : ['BANG', 'DUEL', 'INDIANS', 'GATLING'].includes(kind) ? '공격' : kind === 'MISSED' ? '방어'
      : ['BEER', 'SALOON'].includes(kind) ? '회복' : '특수'
}
export const CARD_RULE: Record<CardKind, string> = {
  BANG: '대상은 회피 카드나 술통 판정으로 막을 수 있어요. 막지 못하면 생명력 1을 잃어요. 연발 권총 또는 윌리 더 키드는 한 턴 사용 제한이 없어요.',
  MISSED: '공격에 응답할 때 사용해요. 결투와 습격에는 사격 카드가 필요해요. 슬랩 더 킬러의 사격은 회피 효과가 두 번 필요해요.',
  BEER: '최대 생명력을 넘길 수 없어요. 자기 차례에 사용하거나, 생명력이 0 이하가 되는 순간 손패의 맥주로 살아남을 수 있어요. 생존자가 2명이면 회복되지 않아요.',
  SALOON: '자기 차례에만 사용해요. 탈락한 사람은 회복되지 않고, 생존자 2명일 때도 효과가 있어요. 빈사 상태를 구하는 용도로는 사용할 수 없어요.',
  DUEL: '지목한 상대부터 사격 카드를 한 장씩 번갈아 버려요. 먼저 내지 못한 사람이 생명력 1을 잃어요. 결투에서 버린 사격은 턴당 사격 제한에 포함되지 않아요.',
  INDIANS: '나를 제외한 생존자들이 시계 방향으로 사격 카드 한 장을 버리거나 생명력 1을 잃어요. 회피나 술통으로 막을 수 없어요.',
  GATLING: '나를 제외한 생존자 모두를 차례로 공격해요. 각자 회피 카드나 술통으로 막을 수 있어요. 턴당 사격 1장 제한에 포함되지 않아요.',
  STAGECOACH: '뽑는 더미에서 카드 2장을 손패로 가져오고 이 카드는 버려요.',
  WELLS_FARGO: '뽑는 더미에서 카드 3장을 손패로 가져오고 이 카드는 버려요.',
  GENERAL_STORE: '생존자 수만큼 카드를 공개해요. 사용한 사람부터 시계 방향으로 한 장씩 골라 손패에 넣어요.',
  PANIC: '무기의 사거리와 달리 실제 거리가 1인 상대만 지목해요. 손패는 무작위 한 장, 공개 장비는 원하는 한 장을 가져와요.',
  CAT_BALOU: '어떤 거리의 상대라도 지목할 수 있어요. 손패는 무작위 한 장, 공개 장비는 원하는 한 장을 버리게 해요. 빼앗아 내 손에 넣는 효과는 아니에요.',
  BARREL: '공격마다 판정 카드를 한 장 공개해요. 하트면 회피 효과 1회를 얻어요. 실패하면 손패의 회피 카드를 사용할 수 있어요.',
  JAIL: '보안관 외의 상대 앞에 놓아요. 그 사람의 턴 시작에 하트가 나오면 정상 진행, 아니면 턴을 쉬고 감옥을 버려요. 감옥에 있어도 다른 사람의 공격에는 응답할 수 있어요.',
  DYNAMITE: '자기 앞에 놓아요. 다음 턴 시작에 스페이드 2~9가 나오면 생명력 3을 잃고 버려요. 그 외에는 다음 생존자에게 넘어가요. 감옥보다 먼저 판정해요.',
  MUSTANG: '다른 사람이 나를 보는 거리를 1 늘려요. 공격 사거리 자체를 늘려주는 무기는 아니에요.',
  SCOPE: '내가 다른 사람을 보는 거리를 1 줄여요. 계산한 거리는 최소 1이에요.',
  VOLCANIC: '장착 중에는 사거리 1 안의 대상에게 사격 카드를 여러 장 사용할 수 있어요. 새 무기를 장착하면 기존 무기를 버려요.',
  SCHOFIELD: '사거리 2까지 사격할 수 있어요. 새 무기를 장착하면 기존 무기는 버려요. 사격은 기본적으로 한 턴에 한 장이에요.',
  REMINGTON: '사거리 3까지 사격할 수 있어요. 새 무기를 장착하면 기존 무기는 버려요. 사격은 기본적으로 한 턴에 한 장이에요.',
  REV_CARABINE: '사거리 4까지 사격할 수 있어요. 새 무기를 장착하면 기존 무기는 버려요. 사격은 기본적으로 한 턴에 한 장이에요.',
  WINCHESTER: '사거리 5까지 사격할 수 있어요. 새 무기를 장착하면 기존 무기는 버려요. 사격은 기본적으로 한 턴에 한 장이에요.',
}
export const CHARACTER: Record<BangCharacter, [string, string]> = {
  BART_CASSIDY: ['바트 캐시디', '생명력 1을 잃을 때마다 카드 1장.'], BLACK_JACK: ['블랙 잭', '두 번째 뽑는 카드가 빨간색이면 1장 추가.'], CALAMITY_JANET: ['칼라미티 자넷', '사격과 회피를 서로 바꿔 사용해요.'], EL_GRINGO: ['엘 그링고', '다른 사람이 준 피해 1마다 그 사람 손패 1장.'], JESSE_JONES: ['제시 존스', '첫 카드를 다른 사람 손패에서 뽑을 수 있어요.'], JOURDONNAIS: ['주르도네', '항상 술통 효과. 실제 술통과 중첩돼요.'], KIT_CARLSON: ['킷 칼슨', '3장을 보고 덱에 돌려놓을 1장을 선택.'], LUCKY_DUKE: ['럭키 듀크', '판정할 때 2장을 보고 원하는 결과 선택.'], PAUL_REGRET: ['폴 리그렛', '항상 야생마 효과. 실제 야생마와 중첩돼요.'], PEDRO_RAMIREZ: ['페드로 라미레즈', '첫 카드를 버린 더미에서 가져올 수 있어요.'], ROSE_DOOLAN: ['로즈 둘란', '항상 조준경 효과. 실제 조준경과 중첩돼요.'], SID_KETCHUM: ['시드 케첨', '언제든 손패 2장을 버리고 생명력 1 회복.'], SLAB_THE_KILLER: ['슬랩 더 킬러', '내 사격을 피하려면 회피 효과 2회 필요.'], SUZY_LAFAYETTE: ['수지 라파예트', '손패가 비면 카드 1장을 뽑아요.'], VULTURE_SAM: ['벌처 샘', '탈락한 사람의 손패와 장비를 가져와요.'], WILLY_THE_KID: ['윌리 더 키드', '내 턴에 사격을 횟수 제한 없이 사용.'],
}
export const PHASE_LABEL: Record<string, string> = { PLAY: '카드를 사용하거나 턴을 마치세요', DRAW: '첫 카드를 뽑을 곳을 선택하세요', KIT: '덱에 돌려놓을 카드 1장을 선택하세요', LUCKY: '적용할 판정 카드 1장을 선택하세요', DISCARD: '현재 생명력보다 많은 손패를 버리세요', RESPONSE: '방어 카드를 내거나 피해를 받으세요', RESCUE: '맥주 또는 인물 능력으로 살아남으세요', STORE: '잡화점에서 가져갈 카드 1장을 선택하세요', FINISHED: '경기가 끝났어요' }
export const END_REASON: Record<string, string> = { LAW_WINS: '보안관과 부관 승리', OUTLAWS_WIN: '무법자 승리', RENEGADE_WINS: '배신자 승리', NO_ELIGIBLE_WINNERS: '승리 자격이 남지 않아 무효 처리' }
export const SUIT = { HEARTS: '♥', DIAMONDS: '♦', CLUBS: '♣', SPADES: '♠' }
export function cardRank(card: BangCard) { return `${SUIT[card.suit]} ${({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[card.rank] ?? card.rank}` }
export function actionLabel(action: BangAction, name: (id: string) => string) {
  const labels: Record<string, string> = { play: '카드 사용', end_turn: '턴 종료', discard: '선택 카드 버리기', respond: '방어 카드 사용', barrel: '술통 판정', take_hit: '피해 받기', rescue: '맥주로 생존', give_up: '탈락 수락', choose: '선택 확정', sid_heal: '2장 버리고 생명력 회복', draw: action.fromDiscard ? '버린 더미에서 뽑기' : action.targetUserId ? `${name(action.targetUserId)} 손패에서 뽑기` : '덱에서 뽑기' }
  return (labels[action.kind] ?? '행동 선택') + (action.zone === 'HAND' ? ' · 무작위 손패' : action.zone === 'TABLE' ? ' · 공개 장비' : '')
}
