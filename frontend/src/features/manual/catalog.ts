import { rulebooks } from './rulebooks';
import type { GameManual, GuideId, ManualCategory, ManualSection } from './types';

// Current dev contracts: docs/{omok,farkle,onecard,bridge,minigame-api}.md.
// This guide never calculates legality, deadlines, outcomes or rewards.
export const gameManuals: GameManual[] = [
  {id:'gomoku',status:'available',category:'game',title:'오목',subtitle:'다섯 돌로 잇는 한 수 · 렌주',keywords:'흑돌 백돌 금수 삼삼 사사 장목 렌주',players:'2명',goal:'흑 정확히 5목 · 백 5목 이상',timing:'한 차례 30초 · 만료 시 시간패',summary:'흑의 삼삼·사사·장목은 금수예요. 정확한 5목 승리가 우선하며, 서버가 착수와 결과를 판정해요.',sections:rulebooks.gomoku.sections,rulebook:rulebooks.gomoku},
  {id:'farkle',status:'available',category:'game',title:'주사위 한 판',subtitle:'한 번 더 굴릴까, 여기서 멈출까?',keywords:'파클 farkle 점수 확정 굴리기 핫다이스 버스트',players:'2명',goal:'화면에 표시된 목표 점수 확정',timing:'한 차례 전체 30초',summary:'득점 조합을 골라 다시 굴리거나 점수를 확정해요. 시간이 끝나면 이번 턴 점수만 잃고 상대에게 넘어가요.',sections:rulebooks.farkle.sections,rulebook:rulebooks.farkle},
  {id:'onecard',status:'available',category:'game',title:'원카드',subtitle:'마지막 한 장, 잊지 말고 외쳐요',keywords:'카드 손패 공격 방어 조커 원카드 신고 무늬 K J Q A',players:'2–4명',goal:'손패 0장 즉시 승리',timing:'한 차례 30초 · 원카드 기회 3초',summary:'숫자나 유효 무늬가 같은 카드를 내요. 공격 중에는 대응표를 따라요. 마지막 카드는 추가 효과 없이 즉시 승리예요.',sections:rulebooks.onecard.sections,rulebook:rulebooks.onecard},
  {id:'bridge',status:'available',category:'game',title:'거짓말 다리 건너기',subtitle:'그 숫자, 믿어도 될까요?',keywords:'차오차오 ciao 블러핑 믿기 다우트 비밀 주사위 골인 점수',players:'2–4명',goal:'유효 골인 말 3개 · 또는 종료 시 점수 비교',timing:'굴리기·선언·각 판단 30초',summary:'나만 본 눈을 숨기고 1~4를 선언해요. 모두 믿으면 눈은 비공개예요. 굴리기·선언 시간 초과는 자동 행동 없이 차례를 넘겨요.',sections:rulebooks.bridge.sections,rulebook:rulebooks.bridge},
  {id:'fish-bread',status:'available',category:'minigame',title:'붕어빵 굽기',subtitle:'노릇노릇, 타이밍의 한 판',keywords:'붕어빵 카트 반죽 팥 황금 콤보 요리',players:'1명',goal:'양면을 노릇하게 구워 꺼내기',timing:'조리 60초 · 40초부터 센 불',summary:'여섯 칸을 클릭하거나 Q W E / A S D로 조작해요. 서버가 시작을 승인하고 기록을 검증해 정산해요. 지갑·서버 준비 상태에 따라 시작이 제한될 수 있어요.',sections:[
    {id:'bread-start',title:'카트에서 시작하기',steps:['카트 가까이에서 E 또는 붕어빵 굽기 버튼을 눌러요.','서버 상태와 안내를 확인하고 시작을 눌러요. 준비가 안 됐다면 오류 안내에 따라 다시 시도해요.','조리와 결과는 기존 화면에서 확인해요. 설명서를 열어도 60초는 계속 흘러요.']},
    {id:'bread-keys',title:'반죽 → 팥 → 뒤집기 → 꺼내기',table:{headers:['조작','하는 일'],rows:[['Space / 휠 위','반죽 들기'],['1 / 휠 아래','팥 들기'],['Q W E / A S D · 철판 클릭','위 3칸 / 아래 3칸 조작'],['우클릭 / Shift + 칸 키','해당 칸 버리기'],['Esc','설명서 닫기 · 게임 중에는 그만두기 확인']]},paragraphs:['노릇한 황금색일 때 뒤집고 양면을 구워 꺼내요. 덜 익거나 타면 0점이에요. 양면 황금 콤보 3~5는 ×1.2, 6 이상은 ×1.5예요. 40초부터 불이 세져요.']},
    {id:'bread-result',title:'결과와 엽전 확인',paragraphs:['60초 후 서버가 조리 기록을 검증해 결과를 확정해요. 기본 정책은 15점당 1냥, 한국 날짜 기준 하루 최대 100냥이며 최종 지급은 서버 결과를 따라요.','정산이 지연되면 결과 화면에서 다시 확인해요. 화면을 닫았다고 지급 성공으로 간주하지 않아요. 지갑 준비 오류가 보이면 안내를 확인해 주세요.']},
  ]},
];

export const parkGuides: Record<GuideId,{title:string;subtitle:string;sections:ManualSection[]}> = {
  welcome:{title:'처음 오셨나요?',subtitle:'산책하다가, 함께 한 판.',sections:[{id:'first',title:'첫 게임 시작하기',steps:['기존 로그인 화면으로 로그인하고 채널을 선택해요.','WASD·방향키로 테이블에 다가가 E 또는 안내 버튼을 눌러요.','빈자리에 앉고 게임을 선택한 뒤 준비를 눌러요. 서버가 참가·시작을 확정하면 플레이해요.','F1 또는 게임 설명서 버튼으로 규칙을 다시 읽을 수 있어요. 설명서를 열어도 경기 시간은 멈추지 않아요.']}]},
  controls:{title:'이동과 조작',subtitle:'PC 키보드와 마우스로 함께해요.',sections:[
    {id:'keys',title:'공원에서 사용하는 키',table:{headers:['조작','하는 일'],rows:[['WASD / 방향키','이동 · 이용 중인 시설에서 일어나기(가능한 상태에서)'],['Shift + 이동','달리기'],['Space','점프'],['마우스 드래그 / 휠','공원 시점 조절 / 3인칭 거리 조절'],['Ctrl 단독 누르기','마우스 고정 켜기 / 끄기 · Esc로도 해제'],['V','산책 중 1·3인칭 전환'],['E','가까운 시설 이용'],['M','공원 지도 열기 / 닫기'],['Enter','채팅 입력창 열기 · 메시지 보내기'],['Z','이번 접속의 채팅 기록 펼치기 / 접기'],['G','감정표현 선택'],['F1','게임 설명서 열기 / 닫기'],['Esc','마우스 고정 해제 · 지도·설명서 닫기 · 망원경에서 나오기']]},paragraphs:['채팅은 이번 접속에서 받은 최근 100개를 보여줘요. Enter 전송이나 빈 입력 종료 뒤 최근 6개를 20초 보여준 다음 2개로 접어요. Z 또는 기록 보기로 펼치면 이전 내용을 스크롤할 수 있어요. 말풍선은 10초간 표시해요.','마우스 고정은 직접 켰을 때만 동작해요. 설명서·채팅·시설을 이용하거나 창을 벗어나면 해제되며, 시설을 마치면 이용 전의 고정 상태로 돌아가요. 창을 벗어나거나 직접 해제한 경우에는 다시 켜지지 않아요. 브라우저가 재고정을 허용하지 않으면 Ctrl로 다시 켤 수 있어요.','1인칭에서도 이동·시설 판정은 같아요. 시설에서는 전용 시점을 사용하고, E로 진입하는 모든 요소(벤치·운동기구·망원경·테이블·붕어빵·소리함·익명 메모) 이용을 마치면 이용 전의 1·3인칭 선택과 방향·거리로 돌아와요.','테이블 경기 중 이동키가 기권이나 퇴장으로 처리되지는 않아요. 현재 화면의 이용 안내와 버튼을 따라 주세요. 설명서를 읽을 때는 이동·게임 조작이 멈추며 닫으면 원래 화면으로 돌아와요.']},
    {id:'map',title:'지도와 나만의 길 안내',steps:['M 또는 상단 지도 버튼으로 지도를 열어요. 장소 번호·목록 또는 지도 위 지점을 선택해요.','지도에 표시된 경로를 확인한 뒤 M·Esc로 닫고 WASD로 직접 이동해요. 상단 화살표와 남은 거리를 따라가요.','길 안내의 ×로 취소할 수 있어요. 설명서·경기·시설을 이용할 때는 안내를 숨기고 산책으로 돌아오면 이어가요.'],tip:'전망대는 지상 입구까지만 안내해요. 호수 내부는 안내하지 않으며, 통행할 길이 없으면 실패를 표시해요.'},
    {id:'quality',title:'그래픽 품질과 성능 확인',paragraphs:['F1 설명서 상단 또는 오른쪽 위 내 메뉴의 설정에서 Low·Medium·High를 선택해요. 현재 채널과 인원도 설명서 상단에서 확인할 수 있어요.','품질을 낮춰도 게임 규칙·조작·채팅·관전은 같아요. 설정의 그래픽과 성능 패널에서 실제 화면의 FPS·프레임 간격·렌더 해상도를 확인하고 측정 초기화로 다시 표본을 모아요. 품질을 바꾸면 표본을 새로 모으며, 네트워크 지연이나 GPU 실행시간을 나타내는 수치는 아니에요.']},
    {id:'telescope',title:'망원경 조작 설명',steps:['망원경 가까이에서 E 또는 안내 버튼을 눌러요.','마우스 드래그로 방향을 바꾸고 휠·＋/−로 2~8배 확대해요.','F1로 이 설명서를 열고 닫아요. 설명서를 닫은 뒤 E·Esc·나가기 버튼으로 망원경에서 나와요.'],tip:'현재 망원경 점유·방향 동기화는 개발 목업이에요. 확대는 나에게만 적용돼요.'},
  ]},
  join:{title:'테이블 참여',subtitle:'착석 · 준비 · 퇴장 · 다음 판',sections:[
    {id:'seats',title:'앉고 준비하기',steps:['테이블 가까이에서 정보를 열고 빈자리에 앉아요.','선택 권한이 있는 참가자가 종목을 정해요. 오목·주사위는 2명, 원카드·다리는 2~4명이에요.','준비를 누르고 서버의 참가·시작 확정을 기다려요. 준비 취소와 자리 상태는 서버 응답을 따라요.'],tip:'준비 전 대기 상태에서만 이동키로 일어날 수 있어요. 준비 후·경기 중·결과 화면에서는 화면의 버튼을 사용해요.'},
    {id:'leave',title:'경기 종료와 다음 판',paragraphs:['진행 중에는 기권하기를 선택한 뒤 확인해요. 이동키로 기권되지 않아요. 다리는 진행 중인 판정이 끝난 뒤 기권이 반영될 수 있어요.','종료 후 서버 정산을 확인해요. 다음 판 준비와 자리에서 일어나기는 현재 테이블 버튼을 따라요. 설명서는 경기·준비·정산 상태를 바꾸지 않아요.']},
  ]},
  watch:{title:'관전과 응원',subtitle:'공개 정보로 함께 즐겨요.',sections:[
    {id:'watch-start',title:'관전하기',paragraphs:['테이블 또는 관전석의 관전 버튼으로 입장하고 서버의 승인을 기다려요. 관전 가능 거리와 경기 진행 상태에 따라 제한될 수 있어요.','F1은 현재 관전 중인 게임의 설명서를 열어요. 설명서를 닫으면 관전 화면으로 돌아와요. 관전자에게 게임 행동 권한은 없어요.']},
    {id:'privacy',title:'볼 수 있는 정보',paragraphs:['오목판·공개 주사위·점수·바닥 카드·손패 장수 같은 공개 정보를 봐요. 다른 사람의 원카드 손패와 다리의 비공개 눈은 보이지 않아요.','다리에서 모두 믿으면 실제 눈은 공개하지 않아요. 의심 판정에서 서버가 공개한 결과만 함께 확인해요.']},
  ]},
  coins:{title:'엽전 안내',subtitle:'서버가 확정한 잔액과 결과를 확인해요.',sections:[{id:'wallet',title:'잔액과 정산',paragraphs:['기존 지갑 조회와 게임 결과를 따라 잔액·정산을 표시해요. 잔액이 —이거나 지갑 준비 오류가 보이면 조회가 완료되지 않은 상태예요.','설명서는 엽전을 지급하거나 결과를 계산하지 않아요. 붕어빵의 지급량·하루 한도는 서버 정산 결과를 따르며, 확인이 지연되면 기존 결과 화면에서 다시 확인해요.']}]},
};

export function filterManuals(category:'all'|ManualCategory,query:string) {
  const words=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return gameManuals.filter(game => (category==='all'||game.category===category) && words.every(word => [game.title,game.subtitle,game.keywords,game.summary,...game.sections.flatMap(s=>[s.title,s.markdown??'',...(s.paragraphs??[]),...(s.steps??[]),...(s.table?.rows.flat()??[])])].join(' ').toLocaleLowerCase().includes(word)));
}
