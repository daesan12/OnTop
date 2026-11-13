import { RestError } from '../../network/restError'

/** Public copy only. Never show provider messages, URLs or server internals. */
export function gachaFailureMessage(cause: unknown, action = false): string {
  if (cause instanceof RestError) {
    const messages: Record<string, string> = {
      GACHA_NOT_CONFIGURED: '뽑기와 캡슐 보관함을 아직 이용할 수 없어요. 잠시 후 다시 확인해주세요.',
      GACHA_NO_TICKET: '뽑기권이 없어요. 뽑기권을 구매한 뒤 다시 이용해주세요.',
      GACHA_NO_BOX: '선택한 캡슐이 없어요. 보유한 캡슐을 다시 확인해주세요.',
      INSUFFICIENT_BALANCE: '엽전이 부족해요. 보유 엽전을 확인해주세요.',
      GACHA_NO_COMPATIBLE_PRODUCT: '현재 캐릭터가 받을 수 있는 의상이 없어요. 잠시 후 다시 이용해주세요.',
      GACHA_CAPACITY_EXCEEDED: '보유할 수 있는 수량을 초과했어요. 보유 수량을 확인해주세요.',
      INVALID_REQUEST: '요청 내용을 확인하지 못했어요. 수량과 선택한 캡슐을 확인해주세요.',
    }
    if (Object.hasOwn(messages, cause.code)) return messages[cause.code]!
    if (cause.status === 401) return '로그인이 만료됐어요. 다시 로그인한 뒤 확인해주세요.'
    if (cause.status === 403) return '지금은 이용할 수 없어요. 접속 상태를 확인해주세요.'
    if (cause.status === 429) return '요청이 잠시 몰렸어요. 조금 기다린 뒤 다시 확인해주세요.'
  }
  const timeout = cause instanceof Error && ['TimeoutError', 'AbortError'].includes(cause.name)
  if (action) return (timeout ? '결과 확인이 늦어지고 있어요.' : '결과를 확인하지 못했어요.')
    + ' 새로 구매하거나 뽑지 말고 이전 거래 결과를 확인해주세요.'
  return timeout
    ? '불러오는 데 시간이 오래 걸려요. 잠시 후 다시 불러오기를 눌러주세요.'
    : '뽑기 정보를 불러오지 못했어요. 연결 상태를 확인하고 다시 불러오기를 눌러주세요.'
}
