// Explicit test expectations, never used by the classifier or the application's hide logic.
export const moderationCases=[
  {id:'swear',category:'PROFANITY',text:'씨발, 진짜 짜증 나네.',expectedHidden:true},
  {id:'direct-insult',category:'PERSONAL_INSULT',text:'{target} 너 진짜 병신이냐?',expectedHidden:true},
  {id:'polite-insult',category:'PERSONAL_INSULT',text:'{target} 님, 왜 이렇게 멍청하세요?',expectedHidden:true},
  {id:'greeting',category:'NORMAL',text:'안녕하세요! 같이 산책할까요?',expectedHidden:false},
  {id:'game',category:'NORMAL',text:'오목 한 판 같이 하실래요?',expectedHidden:false},
  {id:'report',category:'QUOTATION',text:'누가 저한테 "씨발"이라고 했어요. 신고하고 싶어요.',expectedHidden:false},
  {id:'advice',category:'QUOTATION',text:'"병신"은 상대를 모욕하는 말이라 쓰면 안 돼요.',expectedHidden:false},
  {id:'explanation',category:'QUOTATION',text:'욕설 예시로 "씨발"이라는 단어를 설명한 글을 봤어요.',expectedHidden:false},
  {id:'compliment',category:'NORMAL',text:'와, 정말 멋진 수네요!',expectedHidden:false},
  {id:'previous-load',category:'PROFANITY',text:'씨발 테스트 5',expectedHidden:true},
]
export function moderationCase(round,userIndex) {
  const selected=moderationCases[((round-1)*3+userIndex)%moderationCases.length]
  return {...selected,text:selected.text.replaceAll('{target}',userIndex===1?'홍팀로컬':'청팀로컬')}
}

// Declared before the v7 live run; these cases were not used to select the candidate threshold.
export const thresholdHoldoutCases=[
  {id:'holdout-expletive',category:'PROFANITY',text:'아 씨발, 또 졌네.',expectedHidden:true},
  {id:'holdout-variant',category:'PROFANITY',text:'시발 진짜 답답하네.',expectedHidden:true},
  {id:'holdout-spaced',category:'PROFANITY',text:'씨 발, 진짜 열받네.',expectedHidden:true},
  {id:'holdout-insult',category:'PERSONAL_INSULT',text:'{target}, 너 진짜 개새끼네.',expectedHidden:true},
  {id:'holdout-sneer',category:'PERSONAL_INSULT',text:'{target}, 넌 대체 머리에 든 게 있냐?',expectedHidden:true},
  {id:'holdout-polite',category:'PERSONAL_INSULT',text:'{target}, 참 한심하고 멍청하시네요.',expectedHidden:true},
  {id:'holdout-kitten',category:'NORMAL',text:'새끼 고양이가 정말 귀엽네요.',expectedHidden:false},
  {id:'holdout-starting-point',category:'NORMAL',text:'시발점부터 차근차근 설명해 주세요.',expectedHidden:false},
  {id:'holdout-compliment',category:'NORMAL',text:'와, 미친 실력이네요! 정말 잘하시네요.',expectedHidden:false},
  {id:'holdout-walk',category:'NORMAL',text:'잠깐 쉬었다가 공원 한 바퀴 더 돌까요?',expectedHidden:false},
  {id:'holdout-direction',category:'NORMAL',text:'오목판은 어느 방향에 있나요?',expectedHidden:false},
  {id:'holdout-thanks',category:'NORMAL',text:'설명해 주셔서 감사합니다. 이해했어요.',expectedHidden:false},
  {id:'holdout-report',category:'QUOTATION',text:'채팅에서 "시발"이라고 욕하는 사람이 있어요.',expectedHidden:false},
  {id:'holdout-advice',category:'QUOTATION',text:'"개새끼"라는 표현은 욕설이니 사용하지 마세요.',expectedHidden:false},
  {id:'holdout-dictionary',category:'QUOTATION',text:'국어사전에서 "씨발"의 뜻을 찾아봤어요.',expectedHidden:false},
  {id:'holdout-quoted-insult',category:'QUOTATION',text:'친구가 "너는 병신이야"라고 해서 기분이 나빴어요.',expectedHidden:false},
  {id:'holdout-threat-report',category:'QUOTATION',text:'누가 "죽여버린다"고 위협했어요. 도와주세요.',expectedHidden:false},
  {id:'holdout-where-to-report',category:'QUOTATION',text:'"씨발"이라는 욕을 들었는데 신고는 어디서 하나요?',expectedHidden:false},
  {id:'holdout-word-explanation',category:'QUOTATION',text:'병신년이라는 말은 역사 자료에 나오는 간지 표현이에요.',expectedHidden:false},
  {id:'holdout-correction',category:'QUOTATION',text:'시발역이 아니라 출발역을 말한 거예요.',expectedHidden:false},
]
export function thresholdCase(round,userIndex) {
  const selected=thresholdHoldoutCases[((round-1)*3+userIndex)%thresholdHoldoutCases.length]
  return {...selected,text:selected.text.replaceAll('{target}',userIndex===1?'홍팀로컬':'청팀로컬')}
}
