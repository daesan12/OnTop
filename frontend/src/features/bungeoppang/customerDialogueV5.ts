import { customerAssetV5, type CustomerAssetV5 } from './customerAssetsV5';

type RequestTemplate = `${string}{order}${string}`;
export type CustomerDialogueV5 = { greeting: string; request: RequestTemplate };

/** Presentation copy only. {order} always comes from the approved order's actual items. */
export const CUSTOMER_DIALOGUE_V5 = {
  'boy-red-scarf': {
    greetings: ['와, 붕어빵이다!', '안녕! 저 왔어요!', '놀다 왔어요!', '좋은 냄새 나요!', '오늘도 왔어요!', '우와, 따뜻하겠다!'],
    requests: ['{order} 주세요!', '저는 {order} 먹을래요!', '{order} 부탁해요!', '{order} 골랐어요!', '오늘은 {order} 주세요!', '{order} 사 갈래요!'],
  },
  'student-brown-coat': {
    greetings: ['수업 끝나고 왔어요.', '공부하다 들렀어요.', '안녕하세요, 사장님!', '잠깐 쉬러 왔어요.', '간식 사러 왔어요!', '도서관 가는 길이에요.'],
    requests: ['{order} 부탁드려요.', '오늘 간식은 {order} 주세요!', '{order} 사 갈게요.', '저는 {order} 주세요.', '{order} 챙겨 주세요.', '생각해 보니 {order} 먹고 싶어요.'],
  },
  'worker-earmuffs': {
    greetings: ['퇴근길에 들렀어요.', '오늘도 수고 많으세요.', '귀마개 해도 춥네요!', '따뜻한 냄새가 나네요.', '집에 가다 들렀어요.', '하루 끝에 딱 좋네요.'],
    requests: ['{order} 부탁합니다.', '{order} 사 갈게요.', '오늘은 {order} 주세요.', '가는 길에 {order} 챙겨 주세요.', '저는 {order} 부탁드려요.', '간식으로 {order} 주세요.'],
  },
  'older-flat-cap': {
    greetings: ['산책하다 들렀어요.', '사장님, 반갑습니다.', '고소한 냄새가 좋네요.', '오늘 바람이 차네요.', '붕어빵 생각이 났어요.', '지나가다 또 왔네요.'],
    requests: ['{order} 부탁해요.', '오늘은 {order} 주시겠어요?', '{order} 사 가려고요.', '간식으로 {order} 주세요.', '저는 {order} 먹을게요.', '{order} 챙겨 주시겠어요?'],
  },
  'girl-pink-hat': {
    greetings: ['안녕하세요, 헤헤!', '붕어빵 보러 왔어요!', '눈 구경하다 왔어요!', '엄청 따뜻해 보여요!', '모자 쓰고 왔어요!', '오늘 간식은 여기!'],
    requests: ['{order} 주세요, 헤헤!', '저는 {order} 먹고 싶어요!', '{order} 부탁해요!', '음, {order} 골랐어요!', '오늘은 {order} 먹을래요!', '{order} 사 갈래요!'],
  },
  'woman-glasses-bun': {
    greetings: ['잠깐 바람 쐬러 왔어요.', '안녕하세요, 반가워요.', '일하다 잠깐 들렀어요.', '오늘도 좋은 냄새네요.', '산책길에 들렀어요.', '따뜻한 간식이 당기네요.'],
    requests: ['{order} 부탁드릴게요.', '저는 {order} 주세요.', '오늘은 {order} 사 갈게요.', '간식으로 {order} 부탁해요.', '{order} 챙겨 주실래요?', '{order} 먹고 가려고요.'],
  },
} as const satisfies Record<CustomerAssetV5['id'], { greetings: readonly string[]; requests: readonly RequestTemplate[] }>;

/** Each character exhausts a shuffled bag before repeating; adjacent visits never repeat a line. */
export class CustomerDialogueDeckV5 {
  private bags = new Map<string, number[]>();
  private last = new Map<string, number>();
  constructor(private random: () => number = Math.random) {}

  private pick<T extends string>(key: string, lines: readonly T[]): T {
    let bag = this.bags.get(key);
    if (!bag?.length) {
      bag = lines.map((_, i) => i);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j]!, bag[i]!];
      }
      const end = bag.length - 1;
      if (bag.length > 1 && bag[end] === this.last.get(key)) [bag[0], bag[end]] = [bag[end]!, bag[0]!];
      this.bags.set(key, bag);
    }
    const index = bag.pop()!;
    this.last.set(key, index);
    return lines[index]!;
  }

  next(orderId: string): CustomerDialogueV5 {
    const { id } = customerAssetV5(orderId), profile = CUSTOMER_DIALOGUE_V5[id];
    return { greeting: this.pick(`${id}:greeting`, profile.greetings), request: this.pick(`${id}:request`, profile.requests) };
  }
}
