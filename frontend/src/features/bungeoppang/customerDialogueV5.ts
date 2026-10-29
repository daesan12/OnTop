import { customerAssetV5, type CustomerAssetV5 } from './customerAssetsV5';

type RequestTemplate = `${string}{order}${string}`;
export type CustomerDialogueV5 = { greeting: string; request: RequestTemplate; thanks: string };

/** Presentation copy only. {order} always comes from the approved order's actual items. */
export const CUSTOMER_DIALOGUE_V5 = {
  'boy-red-scarf': {
    greetings: ['와, 붕어빵이다!', '안녕! 저 왔어요!', '놀다 왔어요!', '좋은 냄새 나요!', '오늘도 왔어요!', '우와, 따뜻하겠다!'],
    requests: ['{order} 주세요!', '저는 {order} 먹을래요!', '{order} 부탁해요!', '{order} 골랐어요!', '오늘은 {order} 주세요!', '{order} 사 갈래요!'],
    thanks: ['우와! 잘 먹겠습니다!', '고마워요! 친구랑 나눠 먹을게요!', '따끈따끈해요! 또 올게요!', '신난다! 감사합니다!', '냄새가 최고예요! 잘 먹을게요!', '고마워요! 꼬리부터 먹어야지!'],
  },
  'student-brown-coat': {
    greetings: ['수업 끝나고 왔어요.', '공부하다 들렀어요.', '안녕하세요, 사장님!', '잠깐 쉬러 왔어요.', '간식 사러 왔어요!', '도서관 가는 길이에요.'],
    requests: ['{order} 부탁드려요.', '오늘 간식은 {order} 주세요!', '{order} 사 갈게요.', '저는 {order} 주세요.', '{order} 챙겨 주세요.', '생각해 보니 {order} 먹고 싶어요.'],
    thanks: ['감사해요! 공부할 힘이 나겠어요.', '따뜻한 간식 덕분에 든든해요!', '잘 먹겠습니다. 다음 수업도 힘내야죠!', '고마워요! 친구한테도 추천할게요.', '도서관 가는 길이 즐거워졌어요!', '덕분에 쉬는 시간이 달콤해졌어요.'],
  },
  'worker-earmuffs': {
    greetings: ['퇴근길에 들렀어요.', '오늘도 수고 많으세요.', '귀마개 해도 춥네요!', '따뜻한 냄새가 나네요.', '집에 가다 들렀어요.', '하루 끝에 딱 좋네요.'],
    requests: ['{order} 부탁합니다.', '{order} 사 갈게요.', '오늘은 {order} 주세요.', '가는 길에 {order} 챙겨 주세요.', '저는 {order} 부탁드려요.', '간식으로 {order} 주세요.'],
    thanks: ['감사합니다. 퇴근길이 따뜻해졌네요.', '오늘 피로가 좀 풀리는 기분이에요.', '잘 먹겠습니다. 수고하세요!', '손도 마음도 따뜻해지네요. 고마워요.', '가족이랑 맛있게 나눠 먹을게요.', '덕분에 하루 마무리가 좋네요!'],
  },
  'older-flat-cap': {
    greetings: ['산책하다 들렀어요.', '사장님, 반갑습니다.', '고소한 냄새가 좋네요.', '오늘 바람이 차네요.', '붕어빵 생각이 났어요.', '지나가다 또 왔네요.'],
    requests: ['{order} 부탁해요.', '오늘은 {order} 주시겠어요?', '{order} 사 가려고요.', '간식으로 {order} 주세요.', '저는 {order} 먹을게요.', '{order} 챙겨 주시겠어요?'],
    thanks: ['고맙습니다. 참 맛있게 구우셨네요.', '허허, 따끈하니 좋네요. 잘 먹겠어요.', '산책길 간식으로 딱이네요!', '잘 먹겠습니다. 장사 잘되시길요.', '이 맛 생각나서 또 들를게요.', '고소한 냄새가 좋네요. 고마워요.'],
  },
  'girl-pink-hat': {
    greetings: ['안녕하세요, 헤헤!', '붕어빵 보러 왔어요!', '눈 구경하다 왔어요!', '엄청 따뜻해 보여요!', '모자 쓰고 왔어요!', '오늘 간식은 여기!'],
    requests: ['{order} 주세요, 헤헤!', '저는 {order} 먹고 싶어요!', '{order} 부탁해요!', '음, {order} 골랐어요!', '오늘은 {order} 먹을래요!', '{order} 사 갈래요!'],
    thanks: ['고맙습니다아! 잘 먹을게요!', '헤헤, 엄마랑 나눠 먹을래요!', '와아! 따뜻해서 손도 안 추워요!', '붕어빵 너무 귀여워요! 고마워요!', '잘 먹겠습니다! 또 놀러 올게요!', '호호 불어서 먹을게요! 감사해요!'],
  },
  'woman-glasses-bun': {
    greetings: ['잠깐 바람 쐬러 왔어요.', '안녕하세요, 반가워요.', '일하다 잠깐 들렀어요.', '오늘도 좋은 냄새네요.', '산책길에 들렀어요.', '따뜻한 간식이 당기네요.'],
    requests: ['{order} 부탁드릴게요.', '저는 {order} 주세요.', '오늘은 {order} 사 갈게요.', '간식으로 {order} 부탁해요.', '{order} 챙겨 주실래요?', '{order} 먹고 가려고요.'],
    thanks: ['감사해요. 잠깐 쉬어 갈 여유가 생겼네요.', '정성껏 구워 주셔서 고마워요.', '따뜻할 때 맛있게 먹을게요.', '달콤한 휴식이 되겠네요. 감사해요.', '잘 먹겠습니다. 다음에 또 들를게요.', '덕분에 오후가 조금 더 즐거워졌어요.'],
  },
} as const satisfies Record<CustomerAssetV5['id'], { greetings: readonly string[]; requests: readonly RequestTemplate[]; thanks: readonly string[] }>;

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
    return { greeting: this.pick(`${id}:greeting`, profile.greetings), request: this.pick(`${id}:request`, profile.requests),
      thanks: this.pick(`${id}:thanks`, profile.thanks) };
  }
}
