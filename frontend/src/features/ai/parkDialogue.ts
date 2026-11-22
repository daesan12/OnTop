export const parkDialogues = {
  snowman: {
    interactionLabel: '눈사람과 대화',
    name: '눈사람', portrait: '/art/npc-portraits/snowman/welcome.webp',
    portraits: [
      { src: '/art/npc-portraits/snowman/welcome.webp', alt: '반갑게 웃으며 인사하는 눈사람' },
      { src: '/art/npc-portraits/snowman/throw.webp', alt: '자신 있게 눈덩이 던지기를 설명하는 눈사람' },
      { src: '/art/npc-portraits/snowman/care.webp', alt: '걱정 어린 다정한 표정으로 안전을 당부하는 눈사람' },
      { src: '/art/npc-portraits/snowman/santa.webp', alt: '장난스럽게 윙크하며 산타를 소개하는 눈사람' },
    ],
    lines: [
      '안녕! 나는 광장의 눈싸움 도우미야. 눈더미 가까이에서 Q를 짧게 누르면 눈을 모을 수 있어. 눈덩이는 최대 3개까지 챙길 수 있지!',
      '캐릭터를 친구 쪽으로 돌리고 R을 눌러 봐. 한 번에 눈덩이 하나를 던져! 눈더미에서 떨어진 곳에서는 Q로도 던질 수 있어.',
      '눈덩이가 날아가 친구에게 세 번 맞으면 5초 동안 얼어붙어. 얼었을 때는 A와 D를 빠르게 번갈아 여섯 번 눌러 얼음을 깨면 돼. 서로 즐겁게 놀아 줘!',
      'Q를 꾹 누르면 큰 눈덩이를 함께 굴릴 수도 있어! 눈 세 덩이를 모아 광장 양옆 눈밭에서 E를 누르면 눈사람을 꾸밀 수 있지. 이제 트리 옆 산타도 만나 봐. 산타가 할 말이 있다던데...',
    ],
  },
  santa: {
    interactionLabel: '산타와 대화',
    name: '산타', portrait: '/art/npc-portraits/santa/encouragement.webp',
    portraits: [
      { src: '/art/npc-portraits/santa/encouragement.webp', alt: '따뜻한 미소로 한 학기의 수고를 격려하는 산타' },
      { src: '/art/npc-portraits/santa/wishes.webp', alt: '다정한 표정으로 마음속 이야기를 기다리는 산타' },
      { src: '/art/npc-portraits/santa/together.webp', alt: '희망찬 표정으로 함께 트리를 밝히자고 말하는 산타' },
      { src: '/art/npc-portraits/santa/photo.webp', alt: '활짝 웃으며 사진 모임에 초대하는 산타' },
    ],
    lines: [
      '호호호! 한 학기 동안 정말 고생 많았구나. 여기까지 함께 달려온 여러분이 참 자랑스럽단다. 앞으로 펼쳐질 날들도 힘껏 응원할게!',
      '혹시 마음속에만 담아 두었던 말이 있니? 친구에게 전하고 싶은 고마움도, 나에게 해 주고 싶은 응원도 좋아. 적고 싶었던 말을 이 트리에 남겨 주렴.',
      '이 트리는 여러분의 마음이 모여 빛나는 트리란다. 혼자보다 함께할 때 더 환해지지. 여러분이 힘을 모아 온탑의 마지막 겨울을 반짝이게 해 주겠니?',
      '온탑에서 함께 노는 마지막 날은 11월 27일 금요일이란다. 그날은 다 같이 이곳에 모여 사진을 찍자꾸나! 소중한 친구들과 우리의 추억을 오래 간직하자. 호호호!',
    ],
  },
  elder: {
    interactionLabel: '박영감과 대화',
    name: '박영감', portrait: '/art/npc-portraits/park-elder.webp',
    lines: ['허허, 공원에 잘 왔구먼. 나와 오목 한 판 두겠나? 한 수씩 천천히 생각하며 두면 재미가 쏠쏠하다네.',
      '가까운 테이블에 앉아 오목을 고른 뒤 ‘주민과 두기’에서 박영감을 찾아 주게. 엽전을 걸지 않는 연습 대국이니 편하게 오게나.'],
  },
  hansu: {
    interactionLabel: '윤한수와 대화',
    name: '윤한수', portrait: '/art/npc-portraits/yoon-hansu.webp',
    lines: ['안녕하세요, 윤한수입니다. 괜찮으시면 저와 오목 한 판 두실래요? 서로의 한 수를 읽어 가는 재미가 있거든요.',
      '테이블에서 오목을 선택하고 ‘주민과 두기’에서 저를 골라 주세요. 부담 없이 연습하면서 함께 좋은 수를 찾아봐요.'],
  },
  child: {
    interactionLabel: '강잼민과 대화',
    name: '강잼민', portrait: '/art/npc-portraits/kang-jaemmin.webp',
    lines: ['안녕! 나 강잼민이야. 나랑 오목 한 판 둘래? 나 작다고 봐주면 안 돼! 멋진 한 수 보여 줄게.',
      '테이블에 앉아서 오목, 그다음 ‘주민과 두기’에서 강잼민을 골라 줘. 준비되면 같이 시작하자!'],
  },
} as const
export type ParkSpeaker = keyof typeof parkDialogues

export function parkDialoguePortraits(speaker: ParkSpeaker) {
  const story = parkDialogues[speaker]
  return 'portraits' in story ? story.portraits : [{ src: story.portrait, alt: story.name }]
}

export function parkDialoguePortrait(speaker: ParkSpeaker, index: number) {
  const portraits = parkDialoguePortraits(speaker)
  return portraits[index] ?? portraits[0]!
}
