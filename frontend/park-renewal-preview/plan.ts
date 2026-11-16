import {staticPark} from './static/store'
import {hillGradedHeight} from './hillGrading.ts'
import {CAFE_APPROACH_OFFSETS,cafeApproachDistance} from './cafeApproach.ts'
import {HILL_COORDINATES,HILL_NODE_IDS,HILL_ROAD_WIDTH} from './hillRoute.ts'
import {horrorApronHeight,hiddenExitGrade} from './horrorPlan.ts'
import {roundedPolygon,inPolygon,clipHalfPlane} from './roundedFootprint.ts'
import {inSummit,forestBaseHeight,constraintWeight,SUMMIT_HEIGHT} from './hybridTerrainPlan.ts'
import {cafeApronHeight,hiddenOutletApronHeight} from './siteFinishingPlan.ts'
import {ROAD_GRADE_HEIGHTS} from './roadGradePlan.ts'
import {fixedMappedRoadSupport,preserveMappedGround} from './mappedGroundSupports.ts'
import { MONUMENT_STAIRS, MONUMENT_TREAD_OFFSET } from './monumentStairPlan.ts'
export { MONUMENT_STAIRS }
export type Point=readonly [number,number]
export type District='첫걸음'|'중앙마당'|'놀이숲'|'버들호수'|'언덕과 숲'
export interface Site {id:string;name:string;x:number;z:number;radius:number;district:District;note:string;node:string;asset?:string;yaw?:number;label?:boolean;kind?:'reserve'|'npc'}
export const LAKE={x:62,z:-18,rx:29,rz:36,y:3.45,island:{x:62,z:-18,rx:14,rz:17}}
export const BOAT_ROUTE={x:61,z:-18,rx:17,rz:24,period:2*Math.PI/.018,y:LAKE.y+.33,half:[.83,.76,1.45] as const}
export const PLAZA_RADIUS=20
export const TABLES:Point[]=[[-10,27],[10,27],[-16,37],[16,37],[-10,49],[10,49]]
export const JUMP_TABLES:Point[]=[[-78,19.5]]
export const REST_PAVILIONS:Point[]=[[-71,66],[-89,-43],[64,-71],[73,48]]
export const SUB_PAVILION_SCALE=2.05
export const MAILBOX_SCALE=2.7
export const DOCK_SCALE=1.25
export const RENTAL_PAIR_SPACING=3.4
export const RENTAL_VEHICLE_X=[-.9,0,.9] as const
export const BALLOON_SCALE=1.45
export const STATION_SCALE=1.7
export const BALLOON_DOCK_OFFSET=[2.35*1.6*STATION_SCALE,.65*STATION_SCALE-.37*BALLOON_SCALE+.12,0] as const
const shelterScale=1.6*STATION_SCALE
export const STATION_SHELTER={x:-2.15*shelterScale,z:-1.7*shelterScale,width:4.58*shelterScale,
 depth:2.95*shelterScale,floor:.9125*STATION_SCALE,entryWidth:7.8,entryRun:1.5} as const
export const STATION_BENCH={x:STATION_SHELTER.x,z:-2.42*shelterScale,floor:STATION_SHELTER.floor,seatHeight:.56} as const
export const STATION_STEPS={halfX:5.1408,z0:14.4568,z1:18.9448}
export function underStation(x:number,z:number){const s=site('balloon'),dx=Math.abs(x-s.x),dz=z-s.z;return Math.hypot(dx,dz)<15.95||dx<STATION_STEPS.halfX&&dz>STATION_STEPS.z0&&dz<STATION_STEPS.z1}
export const STATION_STAIRS={zTop:16.048,zBottom:18.9448,width:7.48,steps:6,top:.65*STATION_SCALE}
export const STATION_APPROACH={a:[-40,-54]as Point,b:[-40,-76+18.9448]as Point,width:7.2}
export const TOWER_ACCESS={a:[84,34]as Point,b:[89.5,24]as Point,width:4.2,points:[[84,34],[86.5,32],[88.5,29.5],[89.5,27],[89.5,24]]as readonly Point[]}
export function onTowerAccess(x:number,z:number,extra=0){if(z<24-extra)return false;return TOWER_ACCESS.points.slice(1).some((b,i)=>i===TOWER_ACCESS.points.length-2?onSquareEndedPath(x,z,TOWER_ACCESS.points[i]!,b,TOWER_ACCESS.width,extra):distanceToSegment(x,z,TOWER_ACCESS.points[i]!,b)<TOWER_ACCESS.width/2+extra)}
export const DOCK_ACCESS={points:[[51,26.8],[51,20.5625],[53.475,20.5625]] as readonly Point[],width:2.4,top:LAKE.y+.65*DOCK_SCALE}
export const FISHING_SHOP={x:81.5,z:-45.6,clearance:7.8,y:7.42,yaw:Math.PI/2}
export const FISHING_SUPPORTS={upper:[[79,-49],[85.5,-49],[79,-42.2],[88.6,-43]]as readonly Point[],lower:[[79,-39],[80,-37.2],[88.8,-38.2]]as readonly Point[]}
export const FISHING_BENCHES=[[86,-45,Math.PI/2],[81.1,-46.4,0],[81.1,-44.4,0]]as const
export const FISHING_ROD_RACKS = [[79.85, -39.7], [80.05, -37.85]] as const
export const FISHING_NOTICE={x:90.9,z:-32.6,yaw:Math.PI/2}
export const FISHING_DECK={x:83,z:-43,base:3.8,top:4.28,halfX:5,halfZ:7.2,yaw:0}
// Both storeys stop before the full 8 m public road, including the diagonal bend.
const fishingRoadSide=(x:number,z:number)=>Math.max(8*(x-95.5)-2*(z+39)+3.6*Math.hypot(2,8),-7.5*(z+47)+9*(x-93.5)+3.6*Math.hypot(7.5,9))
export const FISHING_OUTLINE=roundedPolygon(clipHalfPlane([[78,-49],[80,-50],[87.6,-49.2],[89.5,-46],[89.5,-38],[87.8,-35.5],[79.5,-36.5],[78,-39]],fishingRoadSide),1.1)
export const FISHING_UPPER={top:7.5,outline:roundedPolygon(clipHalfPlane([[77.3,-50.5],[89.3,-50.5],[89.3,-41.5],[77.3,-41.5]],fishingRoadSide),.65)}
export const FISHING_STAIRS={x:82.9,zBottom:-37.2,zTop:-41.5,width:2.5,steps:19,bottom:4.28,top:7.5}
export const FISHING_ACCESS={points:[[91.5,-41.4],[89.4,-40.0421]] as readonly Point[],width:3.4,top:4.28}
export const DISTRICTS:District[]=['첫걸음','중앙마당','놀이숲','버들호수','언덕과 숲']
export const SITES:Site[]=[
 {id:'fortune',name:'오늘의 운세',x:9,z:90,radius:6,district:'첫걸음',node:'arrival',asset:'fortune',yaw:Math.PI,note:'정문에서 카드를 고르고 오늘의 게임과 길 안내를 확인하는 첫 장소입니다.',label:true},
 {id:'mobility-entry',name:'정문 전기자전거·킥보드',x:-10,z:86.5,radius:7,district:'첫걸음',node:'entryRentals',asset:'pair',note:'전기자전거와 킥보드 대여소를 나란히 붙인 첫 이동 거점입니다.'},
 {id:'tower',name:'40m 전망대',x:96,z:24,radius:13,district:'첫걸음',node:'tower',note:'동쪽 외곽. 기존 전망대의 망원경·메모함을 함께 가져옵니다.',label:true},
 {id:'fitness',name:'나무그늘 운동마당',x:-24,z:72,radius:23,district:'첫걸음',node:'fitness',note:'남쪽 외곽. 원래 운동기구·나무 벤치·중앙 나무·주변 수목의 상대 배치를 통째로 보존하고 출입구가 있는 울타리로 둘렀습니다.',label:true},
 {id:'fountain',name:'만남의 분수',x:47,z:58,radius:18,district:'중앙마당',node:'fountain',note:'원래 맵의 분수 크기와 주변 화단·벤치 배치를 그대로 보존합니다. 광장·팔각정·숲길을 잇는 쉼터입니다.',label:true},
 {id:'plaza',name:'온탑 중앙마당',x:0,z:38,radius:20,district:'중앙마당',node:'square',note:'기존 타일 무늬를 살린 작은 광장. 돌 테이블 6개와 랭킹·뽑기·복권방·소리함이 모여 있습니다.',label:true},
 {id:'pavilion',name:'메인 팔각정',x:0,z:4,radius:16,district:'중앙마당',node:'pavilion',asset:'main',yaw:Math.PI,note:'원래 −Z 정면을 돌려 정문 쪽으로 출입구와 계단을 맞췄습니다. 뒤로 높은 대석탑 정원과 직선 계단·우회 오름길이 이어집니다.',label:true},
 {id:'gacha',name:'의상 뽑기',x:22,z:29,radius:4,district:'중앙마당',node:'gachaFront',note:'광장 옆에서 정문 방향으로 비스듬히 바라보는 뽑기 기계입니다.'},
 {id:'ranking',name:'랭킹 보드',x:-24,z:26,radius:6,district:'중앙마당',node:'rankingFront',note:'돌 테이블 옆. 정문을 향해 비스듬히 배치합니다.'},
 {id:'mailbox',name:'소리함',x:-21.9715,z:24.0095,radius:3,district:'중앙마당',node:'rankingFront',note:'랭킹·뽑기·복권방과 함께 광장 가장자리에서 정문을 바라봅니다.'},
 {id:'lottery',name:'온탑 복권방',x:23,z:35,radius:6,district:'중앙마당',node:'lotteryFront',asset:'lottery',note:'뽑기·랭킹·소리함과 모으고 입구 쪽으로 기울여 배치합니다.'},
 {id:'mole',name:'두더지 잡기',x:-36,z:31,radius:10,district:'놀이숲',node:'mole',note:'광장에서 서쪽 놀이숲으로 이어지는 두더지 미니게임입니다.',label:true},
 {id:'bread',name:'붕어빵 가게',x:-19,z:-22,radius:9,district:'놀이숲',node:'bread',asset:'bread',yaw:0,note:'사격장 규모로 확대한 v4 건물. 공원 안쪽에서 방문객을 이끄는 위치입니다.',label:true},
 {id:'pigeon',name:'비둘기 가게',x:-38,z:4,radius:9,district:'놀이숲',node:'pigeon',asset:'pigeon',yaw:0,note:'사격장 규모로 키운 건물과 주변 숲. 광장과 서쪽 게임 동선 사이에 있습니다.',label:true},
 {id:'arcade',name:'온탑 오락실',x:-65,z:47,radius:11,district:'놀이숲',node:'arcade',note:'건물과 내부 게임기를 함께 축소해 VR 체험관 정도의 크기로 맞췄습니다.',label:true},
 {id:'vr',name:'VR 꼬치왕',x:-57,z:-19,radius:12,district:'놀이숲',node:'vr',note:'로컬 확정 VR 체험관의 외관·실내·화로를 재사용합니다.',label:true},
 {id:'folk',name:'민속놀이 존',x:-61,z:78,radius:10,district:'놀이숲',node:'folk',asset:'folk',note:'로컬 전통놀이존 에셋을 사격장 규모로 맞춰 내부 놀이 길에 배치했습니다.',label:true},
 {id:'shooting',name:'온탑 사격장',x:-34,z:-22,radius:9,district:'놀이숲',node:'shooting',asset:'shooting',note:'다른 건물 확대의 기준이 되는 승인된 사격장입니다.',label:true},
 {id:'island-pavilion',name:'호수섬 팔각정',x:62,z:-18,radius:7,district:'버들호수',node:'island',note:'크기를 키운 팔각정과 주변 버드나무. 연결 다리는 한 개이며 오리배가 아래로 지납니다.',label:true},
 {id:'lake',name:'버들호수',x:62,z:-18,radius:0,district:'버들호수',node:'cafe',note:'약 58×72m. 울타리·낚시터·물고기·오리배를 두고 섬 주위 풍경을 즐기는 호수입니다.',label:true},
 {id:'dock',name:'오리배 선착장',x:59,z:18.5,radius:8,district:'버들호수',node:'dock',asset:'dock',note:'조금 물 안쪽으로 들어간 접안장. 2대가 나란히 들어갈 공간을 확보하고 원본 오리배는 머리 방향으로 전진합니다.',label:true},
 {id:'cafe',name:'한정선 카페',x:16,z:-18,radius:9,district:'버들호수',node:'cafe',asset:'cafe',yaw:Math.PI,note:'사격장 정도의 건물 크기로 맞춘 로컬 카페입니다. 수변길과 내부 놀이 길이 만납니다.',label:true},
 {id:'fishing',name:'호숫가 낚시터',x:83,z:-43,radius:7,district:'버들호수',node:'fishing',note:'둥근 1층 낚시 데크와 2층 매점, 목재 계단을 육지 진입로와 연결합니다.',label:true},
 {id:'pagoda',name:'온탑 대석탑 정원',x:0,z:-80,radius:19,district:'언덕과 숲',node:'monument',note:'가장 높은 +22m 언덕 위. 원본 대석탑·26m 석단·돌울타리·사방 계단을 한 덩어리로 보존하고 긴 계단과 우회 산책길로 연결합니다.',label:true},
 {id:'jump',name:'10단계 돌탑 점프맵',x:-66,z:13,radius:10,district:'언덕과 숲',node:'jump',note:'전용 입구에서 시작하는 10단계 코스. 1~6단계는 기존 dev 배치를 보존합니다. 연잎·두더지·비둘기 기믹을 지나 고정 오리 발판으로 호수섬까지 내려옵니다. 첫 발판 착지 후 코스 공개 · 한 바퀴 예상 보상 500냥.',label:true},
 {id:'stele',name:'점프맵 안내 비석',x:-58,z:26,radius:3,district:'언덕과 숲',node:'jumpApproach',asset:'stele',yaw:Math.PI/6,note:'첫 발판 바로 옆에서 눌러볼 수 있는 큰 안내 비석입니다.'},
 {id:'balloon',name:'하늘언덕 열기구',x:-40,z:-76,radius:21,district:'언덕과 숲',node:'balloon',note:'북서 외곽 +22m의 높은 언덕. 승강장을 1.7배로 크게 늘리고 굽이진 오름길과 대기 공간을 연결했습니다.',label:true},
 {id:'rest-1',name:'남서 숲속 팔각정',x:-71,z:66,radius:8,district:'첫걸음',node:'rest-sw',note:'8명 이상이 머물도록 2.05배로 키운 쉼터. 입구와 계단은 길을 향하고 나머지 둘레는 나무로 감쌉니다.'},
 {id:'rest-2',name:'서북 언덕 팔각정',x:-89,z:-43,radius:8,district:'언덕과 숲',node:'rest-nw',note:'열기구 오름길 근처의 큰 쉼터. 길 쪽 계단을 비우고 삼면을 숲으로 감쌉니다.'},
 {id:'rest-3',name:'동북 버들 팔각정',x:64,z:-71,radius:8,district:'버들호수',node:'rest-ne',note:'수변 북쪽 길을 바라보는 큰 팔각정입니다.'},
 {id:'rest-4',name:'남동 숲속 팔각정',x:73,z:48,radius:8,district:'버들호수',node:'rest-se',note:'호수와 분수로 이어지는 길에 계단을 맞춘 큰 쉼터입니다.'},
 {id:'mobility-plaza',name:'광장 전기자전거·킥보드',x:60,z:38,radius:7,district:'중앙마당',node:'mobilityPlazaFront',asset:'pair',note:'분수 진입 경사를 비우고 평평한 수변길 옆에 놓은 짝 대여소입니다.'},
 {id:'mobility-rest',name:'서쪽 쉼터 전기자전거·킥보드',x:-27.5,z:49.5,radius:7,district:'중앙마당',node:'westRestFront',asset:'pair',note:'벤치·가로등과 같은 줄에 놓은 잔디 쉼터 대여소입니다.'},
 {id:'mobility-west',name:'놀이숲 전기자전거·킥보드',x:-76,z:40,radius:7,district:'놀이숲',node:'jumpWest',asset:'pair',note:'오락실·VR·점프맵 가까이 전기자전거와 킥보드를 함께 둡니다.'},
 {id:'mobility-north',name:'북쪽 전기자전거·킥보드',x:79.8,z:-64.66,radius:7,district:'버들호수',node:'east-north',asset:'pair',yaw:-Math.PI*3/4,note:'북쪽 놀이 길과 쉼터에서 두 탈것을 함께 이용하는 거점입니다.'},
 {id:'mobility-lake',name:'동쪽 전기자전거·킥보드',x:95.5,z:38.5,radius:7,district:'버들호수',node:'east-south',asset:'pair',note:'전망대와 선착장 사이에서 두 대여소를 붙였습니다.'},
 {id:'mobility-fitness',name:'운동마당 전기자전거·킥보드',x:-52.59,z:85.87,radius:7,district:'첫걸음',node:'west-south',asset:'pair',note:'원본 운동마당 수목 배치를 피해서 놓은 짝 대여소입니다.'},
 {id:'mobility-hill',name:'정상 전기자전거·킥보드',x:-13.3,z:-59,radius:7,district:'언덕과 숲',node:'summitRentals',asset:'pair',note:'대석탑·열기구 정상 +22m의 대여와 반납 거점입니다.'},
 {id:'reserve-north',name:'북쪽 확장 부지',x:39,z:-86,radius:12,district:'언덕과 숲',node:'lake-north',kind:'reserve',note:'약 24×20m. 앞으로 새 장소를 넣을 북쪽 공간입니다.'},
 {id:'reserve-west',name:'서쪽 확장 부지',x:-93,z:-4,radius:11,district:'놀이숲',node:'west-south',kind:'reserve',note:'약 22×18m. 기존 건물과 도로를 유지하면서 확장할 여유입니다.'},
 {id:'reserve-south',name:'정원 옆 확장 부지',x:-18,z:-38,radius:9,district:'언덕과 숲',node:'shooting',kind:'reserve',note:'약 18×14m. 정원 아래 숲 속에 향후 시설 자리를 남깁니다.'},
 {id:'npc-entry',name:'입구 NPC 자리',x:9,z:90,radius:2,district:'첫걸음',node:'arrival',kind:'npc',note:'이후 역할을 정할 NPC 자리입니다.'},
 {id:'npc-plaza',name:'광장 NPC 자리',x:-18,z:55,radius:2,district:'중앙마당',node:'southWestPlaza',kind:'npc',note:'광장 길을 막지 않는 대화 자리입니다.'},
 {id:'npc-lake',name:'호수 NPC 자리',x:29,z:8,radius:2,district:'버들호수',node:'cafe',kind:'npc',note:'수변길 옆의 향후 대화 자리입니다.'},
 {id:'npc-forest',name:'숲길 NPC 자리',x:-48,z:14,radius:2,district:'놀이숲',node:'pigeon',kind:'npc',note:'게임 사이에서 쉬는 NPC 자리입니다.'},
]
export const site=(id:string)=>SITES.find(s=>s.id===id)!
export const NODES:Record<string,Point>={
 entry:[0,99],entryFolk:[-28,98],entryEast:[23,96],entryFork:[0,103.5],entryRentals:[-5.5,86.5],frontL0:[-18,99],frontL1:[-38,94],frontL2:[-52,84],frontR0:[18,99],frontR1:[38,94],frontR2:[52,84],fitnessJunction:[-22,101],arrival:[0,86],square:[0,38],pavilion:[0,19],eastPavilion:[17,4],rankingFront:[-19,30],gachaFront:[17,30],mailboxFront:[-14.5,25],lotteryFront:[18.5,36],eastCluster:[20,43],southPlaza:[0,57],southWestPlaza:[-19,55],southEastPlaza:[16,52.5],westPavilion:[-17,4],eastPavilionNorth:[15,-6],westPavilionNorth:[-17,-11],northCenter:[0,-16],
 fountain:[26,58],fountainGate:[29.63,50.81],fountainCourt:[32.4,51.95],fountainEastGate:[66.863410,66.227694],fountainEastCourt:[61.597297,64.046397],westRestFront:[-27.5,41.8194444444],fountainApproach:[18,82],fountainSW:[28,89],fountainSouth:[48,89],fitness:[-24,86],fitnessNorth:[-24,58],fitnessWest:[-43,72],fitnessEast:[-5,72],fitnessEastToe:[-9,72],fitnessWestToe:[-39,72],fitnessSouthToe:[-24,82],fitnessNorthToe:[-24,62],fitnessFrontWest:[-43,94],entranceWest:[-44,94],entranceEast:[73,72],entranceEastNorth:[84.5,58],pavilionBypass:[88.5,48],'west-south':[-45,57],arcade:[-65,56],arcadeSouthEast:[-46,53],arcadeFrontWest:[-75,54],arcadeEast:[-51,35],moleFrontBend:[-43,43],moleWest:[-51,22],pigeonApproach:[-51,13],westAround:[-86,31],westArcade:[-83,54],westLower:[-76,6],'west-rim':[-86,12],mole:[-36,43],pigeon:[-38,17],jumpEntry:[-66,21.9],jumpApproach:[-57,32.2],jump:[-66,28],jumpWest:[-83,28],forestBypass:[-86,12],'west-fork':[-75,-8],vr:[-57,-6],bread:[-19,-10],shooting:[-34,-10],
 hill0:[-79,-26],hill1:[-73,-47],hillBend:[-80,-57],hill2:[-80,-68],'hill-loop':[-68,-82],'hill-cross':[-68,-58],summitBend:[-54,-58],summitFrontBend:[-48,-52],balloon:[-40,-54],monument:[0,-52],monumentW:[-20,-52],monumentE:[22,-52],monumentNE:[22,-101],monumentN:[0,-101],monumentNW:[-20,-101],monumentWestToe:[-17,-80],monumentEastToe:[17,-80],monumentNorthToe:[0,-97],monumentWestSide:[-20,-80],monumentEastSide:[22,-80],monumentLanding:[0,-48],monumentSouthToe:[0,-63],summitRentals:[-13.3,-52],
 cafe:[28,-3],'bridge-bank':[26.5,-18],bankNorth:[26.5,-24],bankSouth:[26.5,-12],'island-entry':[53.5,-18],island:[55.8,-18],folk:[-53,69],folkSide:[-44,87],folkWest:[-58,89],'lake-west-north':[30.6,-35],lakeWestBend:[30.6,-49],'lake-nw':[30.6,-61],lakeCurve0:[29.5,-30.3],lakeCurve1:[28.5,-27.9],lakeCurve2:[27.6,-25.7],lakeCurve3:[26.8,-24.5],'lake-north':[62,-59],'east-north':[86,-56],fishingShopFront:[89.5,-48],fishing:[95.5,-39],'east-mid':[97.5,-10],towerNorth:[94,12],towerNW:[85.7,14],tower:[84,24],mobilityPlazaFront:[60,30.3636363636],'east-south':[84,34],dock:[51,29],'lake-south':[43,32],lakeSW:[32,22],'south-east':[53,91],
 'rest-sw':[-62,58],'rest-nw':[-77,-43],'rest-ne':[64,-59],'rest-se':[73,60],restSEBend:[85,60],plazaLakeLink:[29,43],
}
Object.assign(NODES,HILL_COORDINATES,{westLower:[-81,2],restRampBend:[-75,-40],fishingBypass:[93.5,-47]})
export const NODE_HEIGHTS:Record<string,number>=Object.fromEntries(Object.keys(NODES).map(k=>[k,4]))
Object.assign(NODE_HEIGHTS,{eastPavilionNorth:4.7,westPavilionNorth:5,northCenter:5,'west-rim':5,'west-fork':6,vr:5.7,bread:5,shooting:5,forestBypass:5,hill0:9,hill1:12.5,hillBend:14.2,hill2:16.2,'hill-loop':18.5,'hill-cross':22,summitBend:22,summitFrontBend:22,balloon:22,monument:22,monumentLanding:22,monumentSouthToe:22,summitRentals:22,monumentWestToe:22,monumentEastToe:22,monumentNorthToe:22,monumentWestSide:22,monumentEastSide:22,monumentW:22,monumentE:22,monumentNE:22,monumentN:22,monumentNW:22,cafe:4.2,'bridge-bank':4.6,bankNorth:4.6,bankSouth:4.6,'island-entry':4.2,island:4.2,'lake-west-north':4,lakeCurve0:4,lakeCurve1:4,lakeCurve2:4,lakeCurve3:4.2,lakeWestBend:7,'lake-nw':7,'lake-north':4,'east-north':4.2,fishingShopFront:4.2,'rest-nw':11.53076923076923,'rest-ne':4})
export const EDGES:readonly (readonly [string,string,number])[]=[
 ['square','rankingFront',3],['square','eastCluster',4],['eastPavilion','gachaFront',3],['eastCluster','lotteryFront',3],['southPlaza','southWestPlaza',4],['southPlaza','southEastPlaza',4],
 ['entry','entryFolk',4.5],['entryFolk','folkSide',4.5],['folkSide','folk',4],['entry','arrival',8],['entryFolk','fitness',4],['entry','entryEast',4.5],['entryEast','fountainSW',4.5],['fitnessWest','folkSide',4],['folkSide','rest-sw',3.5],['jumpWest','forestBypass',4],['forestBypass','westLower',4],['westArcade','jumpWest',4],['fountainSouth','entranceEast',3],['entranceEast','entranceEastNorth',8],['entranceEastNorth','pavilionBypass',8],['pavilionBypass','east-south',8],['arrival','southPlaza',8],['southPlaza','square',8],['square','pavilion',6],['square','westPavilion',6],['eastCluster','gachaFront',4],['eastPavilion','eastPavilionNorth',5],['westPavilion','westPavilionNorth',5],['eastPavilionNorth','northCenter',5],['westPavilionNorth','northCenter',5],
 ['entry','entryFork',8],['arrival','entryRentals',3],['arrival','fitnessEast',4],['fitnessEast','fitnessEastToe',4],['fitnessWest','fitnessWestToe',4],['fitness','fitnessSouthToe',4],['fitnessNorth','fitnessNorthToe',4],['fitnessNorth','southWestPlaza',4],['fitnessNorth','west-south',4],['folkSide','west-south',4],['west-south','arcadeSouthEast',4],['arcadeSouthEast','arcade',3],['west-south','arcadeEast',5],['arcade','arcadeFrontWest',3.5],['arcadeFrontWest','westArcade',3.5],['jumpWest','jump',5],['jump','jumpEntry',4.5],['jump','jumpApproach',4],['jumpApproach','arcadeEast',4],['westLower','west-fork',4.5],['west-fork','vr',4.5],['vr','pigeonApproach',4.5],['pigeonApproach','pigeon',4.5],['pigeon','westPavilion',5],['square','westRestFront',5.5],['westRestFront','mole',5.5],['mole','moleFrontBend',5],['moleFrontBend','arcadeEast',5],['arcadeEast','moleWest',7],['moleWest','pigeon',7],['westPavilionNorth','bread',5],['bread','shooting',5],['shooting','vr',5],
 ...HILL_NODE_IDS.slice(1).map((id,i)=>[HILL_NODE_IDS[i]!,id,HILL_ROAD_WIDTH]as const),['summitBend','balloon',4],['summitBend','summitFrontBend',8],['summitFrontBend','monumentW',8],['summitRentals','monument',8],['monument','monumentE',5],['monument','monumentLanding',6.5],['monument','monumentSouthToe',6.5],['monumentW','summitRentals',8],['monumentNE','monumentN',5],['monumentN','monumentNW',5],['monumentNW','monumentWestSide',5],['monumentWestSide','monumentW',5],['monumentWestSide','monumentWestToe',4.5],['monumentE','monumentEastSide',5],['monumentEastSide','monumentNE',5],['monumentEastSide','monumentEastToe',4.5],['monumentN','monumentNorthToe',4.5],
 ['entranceEast','fountainEastGate',4.5],['fountainEastGate','fountainEastCourt',4.5],['eastCluster','fountainGate',7],['southEastPlaza','fountainGate',7],['fountainGate','fountainCourt',6],['arrival','fountain',5],['fountain','fountainSW',4],['fountainSW','fountainSouth',4],['square','plazaLakeLink',6],['plazaLakeLink','lake-south',6],['lake-south','dock',5],['dock','mobilityPlazaFront',5],['mobilityPlazaFront','east-south',5],['east-south','tower',5],['tower','towerNW',5],['towerNW','towerNorth',5],['towerNorth','east-mid',5],['east-mid','fishing',6],['fishing','fishingBypass',6],['fishingBypass','east-north',6],['east-north','lake-north',5],['lake-north','lake-nw',5],['lake-nw','lakeWestBend',6],['lakeWestBend','lake-west-north',6],['lake-west-north','lakeCurve0',6],['lakeCurve0','lakeCurve1',6],['lakeCurve1','lakeCurve2',6],['lakeCurve2','lakeCurve3',6],['lakeCurve3','bankNorth',6],['bankNorth','bridge-bank',6],['eastPavilionNorth','cafe',5],['cafe','bankSouth',6],['bankSouth','bridge-bank',6],['cafe','lakeSW',6],['lakeSW','lake-south',6],
 ['west-south','rest-sw',4],['hill1','restRampBend',4],['restRampBend','rest-nw',4],['lake-north','rest-ne',4],['east-south','restSEBend',4],['restSEBend','rest-se',4],
]
const activeNodes=new Set([...EDGES.flatMap(([a,b])=>[a,b]),...SITES.map(s=>s.node),'bridge-bank','island-entry','island'])
for(const name of Object.keys(NODES))if(!activeNodes.has(name)){delete NODES[name];delete NODE_HEIGHTS[name]}
export const BRIDGE={x0:29.7,x1:51.5,z:-18,width:3.4,base:4.285,rise:3.4,pierX:[33.5,50]} as const
export const BRIDGE_LANDINGS=[{x0:29.5,x1:BRIDGE.x0,top:4.685,width:3.4},{x0:BRIDGE.x1,x1:LAKE.x-3.77*1.1*SUB_PAVILION_SCALE,top:4.305,width:5}] as const
export function bridgeLandingHeight(landing: (typeof BRIDGE_LANDINGS)[number], x:number) {
 if(landing === BRIDGE_LANDINGS[0])return landing.top
 const blendLength=.45
 const bridgeBlend=smooth((x-landing.x0)/blendLength)
 const islandBlend=smooth((landing.x1-x)/blendLength)
 return landing.top-(landing.top-BRIDGE.base)*(1-bridgeBlend*islandBlend)
}
export const BRIDGE_EDGES:readonly (readonly [string,string,number])[]=[['bridge-bank','island-entry',3.4],['island-entry','island',3.4]]
export function onBridge(x:number,z:number){return x>=BRIDGE.x0&&x<=BRIDGE.x1&&Math.abs(z-BRIDGE.z)<BRIDGE.width/2}
export function bridgeDeckHeight(x:number){const t=Math.max(0,Math.min(1,(x-BRIDGE.x0)/(BRIDGE.x1-BRIDGE.x0)));return BRIDGE.base+(1-t)*.4+BRIDGE.rise*4*t*(1-t)}
export const directionTo=(x:number,z:number,p:Point)=>Math.atan2(p[0]-x,p[1]-z)
const board=site('ranking'),mail=site('mailbox'),boardYaw=directionTo(board.x,board.z,[0,58]);mail.x=board.x+6.6*Math.cos(boardYaw);mail.z=board.z-6.6*Math.sin(boardYaw);const towardPavilion=Math.hypot(mail.x-site('pavilion').x,mail.z-site('pavilion').z);mail.x+=(site('pavilion').x-mail.x)/towardPavilion;mail.z+=(site('pavilion').z-mail.z)/towardPavilion
for(const s of SITES){if(['gacha','ranking','mailbox','lottery'].includes(s.id))s.yaw=s.id==='ranking'?boardYaw+Math.PI/60:s.id==='mailbox'?directionTo(s.x,s.z,[0,58]):directionTo(s.x,s.z,[0,38]);if(s.id==='folk')s.yaw=directionTo(s.x,s.z,NODES.folk!);if(s.id.startsWith('rest-'))s.yaw=directionTo(s.x,s.z,NODES[s.node]!)}
const jumpStele=site('stele');jumpStele.yaw=Math.atan2(NODES.jumpEntry![1]-jumpStele.z,jumpStele.x-NODES.jumpEntry![0])
export function rawHeight(x:number,z:number){return Math.min(22,4+19*Math.exp(-((x+43)**2+(z+79)**2)/1050)+18*Math.exp(-(x*x+(z+66)**2)/800)+2*Math.exp(-((x+95)**2+(z+6)**2)/600))}
const smooth=(n:number)=>{const t=Math.max(0,Math.min(1,n));return t*t*(3-2*t)}
export const rentalYaw=(s:Site)=>s.yaw??Math.atan2(s.x-NODES[s.node]![0],s.z-NODES[s.node]![1])
/** Full roof, stair and vehicle footprint in local metres. */
export function facilityFootprint(s:Site){
 const halves:Record<string,Point>={plaza:[20.6,20.6],fortune:[2.6,1.6],lottery:[2.5,1.6],mole:[7.4,5.4],vr:[7,5],arcade:[6.2,5],bread:[5.7,4],pigeon:[5.7,4],cafe:[5.7,4],folk:[5.7,4],shooting:[5.7,4],ranking:[4.3,1.7],mailbox:[1.7,1.5],gacha:[2.25,2.1],pavilion:[13.7,13.7],pagoda:[17.1,17.1],balloon:[17.2,17.2],fitness:[17,13],fountain:[18,18],'island-pavilion':[8.2,8.7],tower:[8.6,8.6],dock:[5.8,6],jump:[9,9],stele:[1.3,1.2]}
 const yaw=s.id==='fortune'?directionTo(s.x,s.z,[0,108]):s.asset==='pair'?rentalYaw(s):s.id==='dock'?0:s.yaw??directionTo(s.x,s.z,NODES[s.node]!)
 return {half:s.asset==='pair'?[3.5,1.8] as Point:s.id.startsWith('rest-')?[8.2,8.7] as Point:halves[s.id]??[3,3] as Point,yaw}
}
export function footprintDistance(s:Site,x:number,z:number){const f=facilityFootprint(s),dx=x-s.x,dz=z-s.z,c=Math.cos(f.yaw),a=Math.sin(f.yaw);if(s.id==='pagoda'){const a=Math.abs(dx),b=Math.abs(dz);return Math.min(Math.max(a-13,b-13),Math.max(a-3,b-17.1),Math.max(a-17.1,b-3))}if(s.id==='pavilion'){const a=Math.abs(dx),b=Math.abs(dz);return Math.min(Math.max(a-11.3,b-11.3,(a+b-16.3)/Math.SQRT2),Math.max(a-3.3,b-13.7),Math.max(a-13.7,b-3.3))}return s.id.startsWith('rest-')||s.id==='island-pavilion'?Math.hypot(dx,dz)-8.7:['balloon','plaza','fountain','tower'].includes(s.id)?Math.hypot(dx,dz)-(s.id==='tower'?8.6:s.id==='balloon'?17.2:s.id==='fountain'?18:20.6):Math.max(Math.abs(c*dx-a*dz)-f.half[0],Math.abs(a*dx+c*dz)-f.half[1])}
export const facilityGroundY=(s:Site)=>NODE_HEIGHTS[s.node]??4
const ascentNodes=['forestBypass','westLower',...HILL_NODE_IDS]
function ascentSurface(x:number,z:number,fallback:number){
 if(inSummit(x,z))return fallback
 let sum=0,total=0,nearest=Infinity
 for(let i=1;i<ascentNodes.length;i++){const a=NODES[ascentNodes[i-1]!]!,b=NODES[ascentNodes[i]!]!,dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz))),d=Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t),length=Math.hypot(dx,dz),w=Math.exp(-d*d/8);nearest=Math.min(nearest,d);const taper=Math.min(2,length/3),s=t*length;const q=ascentNodes[i]==='hillPortal'?2*t-t*t:ascentNodes[i]==='hill-loop'?(s<length-taper?s:length-taper+(s-length+taper)-(s-length+taper)**2/(2*taper))/(length-taper/2):ascentNodes[i-1]==='hillTurn'?(s<taper?s*s/(2*taper):s-taper/2)/(length-taper/2):t;sum+=((ROAD_GRADE_HEIGHTS[ascentNodes[i-1]!]??NODE_HEIGHTS[ascentNodes[i-1]!]!)*(1-q)+(ROAD_GRADE_HEIGHTS[ascentNodes[i]!]??NODE_HEIGHTS[ascentNodes[i]!]!)*q)*w;total+=w}
 if(nearest>=7)return fallback
 const blend=1-smooth((nearest-5.4)/1.6);return fallback*(1-blend)+sum/total*blend
}
/** Smooth forest interpolation with exact road and facility constraints. */
function evaluateForestHeight(x:number,z:number,mark?:{fixed:boolean;road:boolean}){
 if(mark){mark.fixed=false;mark.road=false}
 if(((x-LAKE.island.x)/LAKE.island.rx)**2+((z-LAKE.island.z)/LAKE.island.rz)**2<1)return 4.2
 let base=forestBaseHeight(x,z),l=Math.hypot((x-LAKE.x)/LAKE.rx,(z-LAKE.z)/LAKE.rz)
 if(l<1.3)base=4+(base-4)*smooth((l-1.02)/.28)
 let weighted=base*.018,total=.018,roadSum=0,roadWeights=0,insideRoad=false
 for(const[a,b,width]of EDGES){const p=NODES[a]!,q=NODES[b]!;if(inSummit(...p)&&inSummit(...q))continue
  const dx=q[0]-p[0],dz=q[1]-p[1],t=Math.max(0,Math.min(1,((x-p[0])*dx+(z-p[1])*dz)/(dx*dx+dz*dz))),distance=Math.hypot(x-p[0]-dx*t,z-p[1]-dz*t),y=(ROAD_GRADE_HEIGHTS[a]??NODE_HEIGHTS[a]!)*(1-t)+(ROAD_GRADE_HEIGHTS[b]??NODE_HEIGHTS[b]!)*t,d=distance-width/2-.45,w=constraintWeight(Math.max(0,d))
  weighted+=y*w;total+=w
  if(d<=0){insideRoad=true;const rw=1/(distance+.03)**8;roadSum+=y*rw;roadWeights+=rw}
 }
 let pad:number|undefined
 for(const s of SITES){if(s.kind||['lake','dock','island-pavilion','stele'].includes(s.id)||facilityGroundY(s)===22&&inSummit(s.x,s.z))continue
  const d=footprintDistance(s,x,z),y=facilityGroundY(s);if(d<=.05)pad=y
  const w=constraintWeight(Math.max(0,d),24);weighted+=y*w;total+=w
 }
 if(mark){mark.fixed=pad!==undefined;mark.road=insideRoad}
 let h=pad??(insideRoad?roadSum/roadWeights:weighted/total)
 const fd=Math.hypot(x-FISHING_SHOP.x,z-FISHING_SHOP.z)-5.3,fw=1-smooth(Math.max(0,fd)/4);h=h*(1-fw)+4.2*fw
 if(Math.abs(x)<MONUMENT_STAIRS.width/2+.25&&z>MONUMENT_STAIRS.zTop&&z<MONUMENT_STAIRS.zBottom){const t=(z-MONUMENT_STAIRS.zTop)/(MONUMENT_STAIRS.zBottom-MONUMENT_STAIRS.zTop);h=Math.min(h,MONUMENT_STAIRS.top*(1-t)+MONUMENT_STAIRS.bottom*t-.12)}
 if(Math.abs(z-BRIDGE.z)<2.5&&x>BRIDGE.x0-2&&x<BRIDGE.x0+.8)h=4.6
 const hidden=hiddenExitGrade(x,z);h=h*(1-hidden.weight)+(hidden.height-.085)*hidden.weight;return pad??ascentSurface(x,z,h)
}
const FIELD={x0:-122,z0:-126,width:245,depth:253}
let forestField:Float64Array|undefined=staticPark?.forestField
export function getForestField(){
 if(forestField)return forestField
 const {x0,z0,width,depth}=FIELD,n=width*depth,values=new Float64Array(n),fixed=new Uint8Array(n),summit=new Uint8Array(n),roads=new Uint8Array(n),mark={fixed:false,road:false}
 for(let i=0;i<width;i++)for(let j=0;j<depth;j++){const k=i*depth+j,x=x0+i,z=z0+j,top=inSummit(x,z);summit[k]=top?1:0;const water=inLake(x,z);mark.fixed=false;mark.road=false;values[k]=water?LAKE.y+.08:top?forestBaseHeight(x,z):evaluateForestHeight(x,z,mark);const support=fixedMappedRoadSupport(x,z);if(!top&&!water&&support!==undefined){values[k]=support;mark.fixed=true}if(!top&&x>=-59&&x< -58&&Math.abs(z+58)<4.8){values[k]=22;mark.fixed=true}roads[k]=mark.road?1:0;fixed[k]=water||top||mark.fixed||i===0||j===0||i===width-1||j===depth-1?1:0}
 const targets=values.slice()
 // Public roads relax with their shoulders: point constraints no longer create speed bumps.
 // Facility pads stay fixed, and retaining walls keep the two terrain levels separate.
 for(let pass=0;pass<600;pass++)for(let i=1;i<width-1;i++)for(let j=1;j<depth-1;j++){
  const k=i*depth+j;if(fixed[k])continue;let sum=0,count=0;for(const q of[k-depth,k+depth,k-1,k+1])if(!summit[q]){sum+=values[q]!;count++}
  if(count){const w=roads[k]?.18:0;values[k]=Math.max(4,(sum+targets[k]!*w+forestBaseHeight(x0+i,z0+j)*.012)/(count+w+.012))}
 }
 // Project adjacent public-road samples onto a gentle continuous grade. Relax both
 // sides of each join, rather than adding a short ramp over an existing bump.
 const limit=.14
 for(let pass=0;pass<1800;pass++){
  let worst=0
  for(let i=1;i<width-1;i++)for(let j=1;j<depth-1;j++){
   const a=i*depth+j;if(summit[a])continue
   for(const b of[a+depth,a+1]){
    if(summit[b]||!(roads[a]||roads[b])||fixed[a]&&fixed[b])continue
    const delta=values[b]!-values[a]!,excess=Math.abs(delta)-limit;if(excess<=.00001)continue
    worst=Math.max(worst,excess);const change=Math.sign(delta)*excess
    if(fixed[a])values[b]!-=change;else if(fixed[b])values[a]!+=change;else{values[a]!+=change/2;values[b]!-=change/2}
   }
  }
  if(worst<.0001)break
 }
 // Extend the forest-side boundary value onto the wall line for exact mesh joins.
 for(let i=1;i<width-1;i++)for(let j=1;j<depth-1;j++){const k=i*depth+j;if(!summit[k])continue;let sum=0,count=0;for(const q of[k-depth,k+depth,k-1,k+1])if(!summit[q]){sum+=values[q]!;count++}if(count)values[k]=sum/count}
 for(let x=-59;x<=-54;x++)for(let z=-62;z<=-54;z++)values[(x-x0)*depth+z-z0]=22
 forestField=values;return values
}
/** Level the full water-edge shelf before blending into the roadside terrain. */
export function coastalGrade(x:number,z:number,h:number){
 const dx=x-LAKE.x,dz=z-LAKE.z,rho=Math.hypot(dx/LAKE.rx,dz/LAKE.rz),radius=Math.hypot(dx,dz)
 if(rho<1||rho===0)return h
 const distance=radius*(1-1/rho)
 const north=smooth((-dz-1)/5),shelf=.55+5.45*north,reach=3+15*north
 if(distance>=reach)return Math.max(4,h)
 // A broad shelf prevents clipped 0.5 m cells and fixed water-grid samples
 // from forming pointed gullies. Paving and soil use this same surface.
 const t=smooth((distance-shelf)/(reach-shelf))
 return 4+(Math.max(4,h)-4)*t
}
function ungradedForestHeightAt(x:number,z:number){
 const undergroundApron=horrorApronHeight(x,z);if(undergroundApron!==null)return undergroundApron-.085
 if(Math.hypot(x-FISHING_SHOP.x,z-FISHING_SHOP.z)<=5.3)return coastalGrade(x,z,4.2)
 if(((x-LAKE.island.x)/LAKE.island.rx)**2+((z-LAKE.island.z)/LAKE.island.rz)**2<1)return 4.2
 const field=getForestField(),{x0,z0,width,depth}=FIELD,xx=Math.max(0,Math.min(width-1.00001,x-x0)),zz=Math.max(0,Math.min(depth-1.00001,z-z0)),i=Math.floor(xx),j=Math.floor(zz),a=xx-i,b=zz-j
 // Cubic B-spline reconstruction has continuous slope across metre-grid joins;
 // its convex weights cannot overshoot the solved road/soil heights.
 const weights=(t:number)=>[(1-t)**3/6,(3*t**3-6*t*t+4)/6,(-3*t**3+3*t*t+3*t+1)/6,t**3/6],wx=weights(a),wz=weights(b)
 let h=0
 for(let u=0;u<4;u++)for(let v=0;v<4;v++){
  const sx=Math.max(0,Math.min(width-1,i+u-1)),sz=Math.max(0,Math.min(depth-1,j+v-1)),px=x0+sx,pz=z0+sz
  const value=inSummit(px,pz)&&px<=-52&&Math.abs(pz+58)<8?22:field[sx*depth+sz]!
  h+=value*wx[u]!*wz[v]!
 }
 if(Math.abs(x)<MONUMENT_STAIRS.width/2+.25&&z>MONUMENT_STAIRS.zTop&&z<MONUMENT_STAIRS.zBottom){const t=(z-MONUMENT_STAIRS.zTop)/(MONUMENT_STAIRS.zBottom-MONUMENT_STAIRS.zTop);h=Math.min(h,MONUMENT_STAIRS.top*(1-t)+MONUMENT_STAIRS.bottom*t-.12)}
 h=coastalGrade(x,z,h)
 // Broad, flush bridge approach; the old hard 5m rectangle formed two transverse lips.
 const bankZone=(1-smooth((Math.abs(x-29)-6)/5))*(1-smooth((Math.abs(z+21)-9)/5))
 const bankHeight=4+.6*smooth((z+24)/6)*(1-smooth((x-30)/3))
 h+=(bankHeight-h)*bankZone
 // A level upper landing is already enforced in the height field, including both verges.
 return h
}
/** Continue the northwest pavilion pad past the stair-side garden stones. */
export function northwestPavilionApronHeight(x: number, z: number, height: number) {
 const pavilion = site('rest-2')
 const east = x - pavilion.x, north = pavilion.z - z
 if (east < 3.7 || east > 11.6 || north < -.05 || north > 6.4) return height
 const along = Math.max(0, Math.min(1, (east - 6.4) / 2.5))
 const distance = Math.hypot(east - (6.4 + 2.5 * along), north - (2.65 + 1.05 * along))
 const weight = 1 - smooth((distance - 1.05) / 1.65)
 const apron = facilityGroundY(pavilion) + .18 * Math.max(0, east - 6.4)
 return height + (apron - height) * weight
}
export function forestHeightAt(x:number,z:number){
 const cafe=site('cafe'),raw=hillGradedHeight(x,z,hiddenOutletApronHeight(x,z,ungradedForestHeightAt(x,z))),landing=1-smooth((Math.hypot(x,z+16)-4)/6)
 let h=cafeApronHeight(x,z,raw+(5-raw)*landing,{x:cafe.x,z:cafe.z,ground:facilityGroundY(cafe)})
 return northwestPavilionApronHeight(x,z,lakeWalkHeight(x,z,preserveMappedGround(x,z,h)))
}
export function heightAt(x:number,z:number){return inSummit(x,z)?SUMMIT_HEIGHT:forestHeightAt(x,z)}
export function parkRadius(angle:number){const nw=Math.atan2(Math.sin(angle+2.45),Math.cos(angle+2.45)),ne=Math.atan2(Math.sin(angle+.7),Math.cos(angle+.7));return .98+.025*Math.sin(angle*3+.4)+.015*Math.cos(angle*5)+.045*Math.exp(-((nw/.35)**2))+.035*Math.exp(-((ne/.35)**2))}
const outline=Array.from({length:4096},(_,i)=>{const a=i/4096*Math.PI*2,r=parkRadius(a);return[r*Math.cos(a),r*Math.sin(a)]})
export const PARK={width:220,depth:220,capacity:40,rx:220/(Math.max(...outline.map(p=>p[0]!))-Math.min(...outline.map(p=>p[0]!))),rz:220/(Math.max(...outline.map(p=>p[1]!))-Math.min(...outline.map(p=>p[1]!)))} as const
export function insidePark(x:number,z:number,margin=0){return Math.hypot(x/(PARK.rx-margin),z/(PARK.rz-margin))<parkRadius(Math.atan2(z/PARK.rz,x/PARK.rx))}
/** Reserve a continuous grass strip for the water-side fence before drawing paving. */
export function onLakeFenceBelt(x:number,z:number){const dx=x-LAKE.x,dz=z-LAKE.z,rho=Math.hypot(dx/LAKE.rx,dz/LAKE.rz);return rho>=1&&Math.hypot(dx,dz)*(1-1/rho)<2}
export function inLake(x:number,z:number,margin=0){return ((x-LAKE.x)/(LAKE.rx+margin))**2+((z-LAKE.z)/(LAKE.rz+margin))**2<1&&((x-LAKE.island.x)/LAKE.island.rx)**2+((z-LAKE.island.z)/LAKE.island.rz)**2>1}
export function distanceToSegment(x:number,z:number,a:Point,b:Point){const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)}
export const FACILITY_APPROACHES=SITES.filter(s=>['mole','bread','pigeon','arcade','vr','folk','shooting','cafe','balloon'].includes(s.id)||s.id.startsWith('rest-')||s.asset==='pair').map(s=>{const a=NODES[s.node]!,dx=a[0]-s.x,dz=a[1]-s.z,d=Math.hypot(dx,dz),f=facilityFootprint(s),c=Math.cos(f.yaw),v=Math.sin(f.yaw),r=Math.min(f.half[0]/Math.max(.0001,Math.abs(c*dx/d-v*dz/d)),f.half[1]/Math.max(.0001,Math.abs(v*dx/d+c*dz/d)));return {id:s.id,a,b:[s.x+dx/d*(r+.05),s.z+dz/d*(r+.05)]as Point,width:s.id.startsWith('rest-')?4.4:3}})
/** Actual doorway aprons extend past conservative roof footprints to the entry steps. */
export const ENTRANCE_PATHS=['bread','pigeon','mole','arcade','cafe','fortune'].map(id=>{
 const s=site(id),p=id==='fortune'?[0,108]as Point:NODES[s.node]!,dx=p[0]-s.x,dz=p[1]-s.z,d=Math.hypot(dx,dz)
 const offset=id==='fortune'?1.2:id==='mole'?3.4:id==='arcade'?3.8:id==='bread'?2.3:2.7,yaw=s.yaw??Math.atan2(dx,dz)+Math.PI
 // Cafe service anchor from its approved GLB, after the shared 10.46×6.29×7.02 fit.
 const b=id==='cafe'?[s.x+Math.cos(yaw)*1.90181822-Math.sin(yaw)*2.71107272,s.z-Math.sin(yaw)*1.90181822-Math.cos(yaw)*2.71107272]as Point:[s.x+dx/d*offset,s.z+dz/d*offset]as Point
 return{id,a:id==='fortune'?[s.x+dx/d*9,s.z+dz/d*9]as Point:p,b,width:id==='fortune'?2.3:id==='cafe'?4.4:id==='mole'?3.4:3}
})
export const CAFE_ENTRY_ROUTE=CAFE_APPROACH_OFFSETS.map(([x,z]):Point=>[site('cafe').x+x,site('cafe').z+z])

const lakeWalkNodes = [
 'lake-north','lake-nw','lakeWestBend','lake-west-north','lakeCurve0','lakeCurve1',
 'lakeCurve2','lakeCurve3','bankNorth','bridge-bank','bankSouth','cafe','lakeSW','lake-south','dock',
].map(id=>NODES[id]!)
const westBridgeLanding = BRIDGE_LANDINGS[0]
const bridgeApproach: Point = [23,-18]
const bridgeEntrance: Point = [westBridgeLanding.x0,BRIDGE.z]

/** Grade the western lake walk and its approaches on the existing terrain surface. */
export function lakeWalkHeight(x:number,z:number,height:number){
 if(x<9||x>57||z< -67||z>37)return height

 const dx=x-LAKE.x,dz=z-LAKE.z
 const lakeRadius=Math.hypot(dx/LAKE.rx,dz/LAKE.rz)
 const shoreDistance=Math.hypot(dx,dz)*(1-1/lakeRadius)
 const shoreBlend=smooth((shoreDistance-1.2)/1.1)
 if(!shoreBlend)return height

 let roadDistance=Infinity
 for(let i=1;i<lakeWalkNodes.length;i++){
  roadDistance=Math.min(roadDistance,distanceToSegment(x,z,lakeWalkNodes[i-1]!,lakeWalkNodes[i]!))
 }
 const road=(1-smooth((roadDistance-3.15)/1.9))*(z< -52?1-smooth((x-36)/10):1)
 const cafeSite=site('cafe')
 const cafeDistance=cafeApproachDistance(x-cafeSite.x,z-cafeSite.z)
 const cafe=1-smooth((cafeDistance-2.3)/1.7)
 const bridgeDistance=distanceToSegment(x,z,bridgeApproach,bridgeEntrance)
 const bridge=1-smooth((bridgeDistance-westBridgeLanding.width/2)/1.7)
 // The dock starts at the same height as the public road. Extend the level
 // road across its entrance width so the timber ramp can keep its own grade.
 const [dockX,dockZ]=DOCK_ACCESS.points[0]!
 const dock=1-smooth((distanceToSegment(x,z,[dockX,dockZ],[dockX,dockZ+3])-DOCK_ACCESS.width/2)/1.6)
 const weight=Math.max(road,cafe,bridge,dock)*shoreBlend
 if(!weight)return height

 const cafeRise=(facilityGroundY(cafeSite)-4)*(1-smooth((cafeDistance-2.3)/6))
 const bridgeRise=(westBridgeLanding.top-4.085)*
  smooth((x-bridgeApproach[0])/(bridgeEntrance[0]-bridgeApproach[0]))*
  (1-smooth((Math.abs(z-BRIDGE.z)-westBridgeLanding.width/2)/4))
 return height+(4+cafeRise+bridgeRise-height)*weight
}

export function onEntrancePath(x:number,z:number,extra=0){return ENTRANCE_PATHS.some(p=>p.id==='cafe'?CAFE_ENTRY_ROUTE.slice(1).some((b,i)=>distanceToSegment(x,z,CAFE_ENTRY_ROUTE[i]!,b)<p.width/2+extra):onSquareEndedPath(x,z,p.a,p.b,p.width,extra))}
export function onSquareEndedPath(x:number,z:number,a:Point,b:Point,width:number,extra=0){const dx=b[0]-a[0],dz=b[1]-a[1],n=dx*dx+dz*dz,t=((x-a[0])*dx+(z-a[1])*dz)/n;return t>=-extra/Math.sqrt(n)&&t<=1+extra/Math.sqrt(n)&&Math.abs((x-a[0])*dz-(z-a[1])*dx)/Math.sqrt(n)<width/2+extra}
export function onBridgeLanding(x:number,z:number){return BRIDGE_LANDINGS.some(l=>x>=l.x0&&x<=l.x1&&Math.abs(z-BRIDGE.z)<=l.width/2+.04)}
export function onRoad(x:number,z:number,extra=0){return onSquareEndedPath(x,z,STATION_APPROACH.a,STATION_APPROACH.b,STATION_APPROACH.width,extra)||onTowerAccess(x,z,extra)||onEntrancePath(x,z,extra)||[DOCK_ACCESS,FISHING_ACCESS].some(p=>p.points.slice(1).some((b,i)=>onSquareEndedPath(x,z,p.points[i]!,b,p.width,extra)))||onBridgeLanding(x,z)||[...EDGES,...BRIDGE_EDGES].some(([a,b,w])=>b==='monumentLanding'?onSquareEndedPath(x,z,NODES[a]!,NODES[b]!,w,extra):distanceToSegment(x,z,NODES[a]!,NODES[b]!)<w/2+extra)||FACILITY_APPROACHES.some(p=>!['cafe','balloon'].includes(p.id)&&distanceToSegment(x,z,p.a,p.b)<p.width/2+extra)}
export function accessTopAt(access:typeof DOCK_ACCESS|typeof FISHING_ACCESS,x:number,z:number){const a=access.points[0]!,b=access.points[1]!,dx=b[0]-a[0],dz=b[1]-a[1],d=((x-a[0])*dx+(z-a[1])*dz)/Math.hypot(dx,dz);const riseLength=Math.hypot(dx,dz)-(access===DOCK_ACCESS?access.width/2:0);return 4.085+(access.top-4.085)*Math.max(0,Math.min(1,d/riseLength))}
export function onFishingDeck(x:number,z:number,margin=0){return inPolygon(x,z,FISHING_OUTLINE,margin)}
export function fishingStairHeight(x:number,z:number){const s=FISHING_STAIRS;if(Math.abs(x-s.x)>s.width/2||z<s.zTop||z>s.zBottom)return null;const t=(s.zBottom-z)/(s.zBottom-s.zTop);return s.bottom+Math.ceil(t*s.steps)/s.steps*(s.top-s.bottom)}
export function fishingRailSections(){
 const out:{a:Point;b:Point;floor:number;endFloor:number}[]=[]
 for(const [outline,floor,upper]of[[FISHING_OUTLINE,FISHING_DECK.top,false],[FISHING_UPPER.outline,FISHING_UPPER.top,true]]as const){
  for(let i=0;i<outline.length;i++){const a=outline[i]!,b=outline[(i+1)%outline.length]!,n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/1.4)),cuts=Array.from({length:n+1},(_,j)=>j/n)
   if(upper&&a[1]===FISHING_STAIRS.zTop&&b[1]===a[1])for(const x of[FISHING_STAIRS.x-FISHING_STAIRS.width/2,FISHING_STAIRS.x+FISHING_STAIRS.width/2]){const t=(x-a[0])/(b[0]-a[0]);if(t>0&&t<1)cuts.push(t)}
   if(!upper&&a[0]===89.5&&b[0]===89.5)for(const z of[-42.4,-38.2]){const t=(z-a[1])/(b[1]-a[1]);if(t>0&&t<1)cuts.push(t)}cuts.sort((a,b)=>a-b)
   for(let j=1;j<cuts.length;j++){const p:Point=[a[0]+(b[0]-a[0])*cuts[j-1]!,a[1]+(b[1]-a[1])*cuts[j-1]!],q:Point=[a[0]+(b[0]-a[0])*cuts[j]!,a[1]+(b[1]-a[1])*cuts[j]!],x=(p[0]+q[0])/2,z=(p[1]+q[1])/2;if(upper?Math.abs(z-FISHING_STAIRS.zTop)<.01&&Math.abs(x-FISHING_STAIRS.x)<FISHING_STAIRS.width/2:x>88&&distanceToSegment(x,z,FISHING_ACCESS.points[0]!,FISHING_ACCESS.points[1]!)<FISHING_ACCESS.width/2+.25)continue;out.push({a:p,b:q,floor,endFloor:floor})}
  }
 }
 const s=FISHING_STAIRS;for(const side of[-1,1])for(let i=0,n=Math.ceil(s.steps/3);i<n;i++){const a:Point=[s.x+side*s.width/2,s.zBottom+(s.zTop-s.zBottom)*i/n],b:Point=[a[0],s.zBottom+(s.zTop-s.zBottom)*(i+1)/n];out.push({a,b,floor:s.bottom+(s.top-s.bottom)*i/n,endFloor:s.bottom+(s.top-s.bottom)*(i+1)/n})}return out
}
export function fishingDeckPoint(dx:number,dz:number):Point{const a=FISHING_DECK.yaw+Math.PI/2,c=Math.cos(a),v=Math.sin(a);return[FISHING_DECK.x+c*dx+v*dz,FISHING_DECK.z-v*dx+c*dz]}
export function deckHeightAt(x:number,z:number,currentY=4.28){
 const stairs=fishingStairHeight(x,z);if(stairs!==null)return stairs
 if(currentY>=FISHING_UPPER.top-.35&&inPolygon(x,z,FISHING_UPPER.outline))return FISHING_UPPER.top
 for(const l of BRIDGE_LANDINGS)if(x>=l.x0&&x<=l.x1&&Math.abs(z-BRIDGE.z)<l.width/2)return bridgeLandingHeight(l,x)
 for(const access of[DOCK_ACCESS,FISHING_ACCESS])for(let i=1;i<access.points.length;i++)if(onSquareEndedPath(x,z,access.points[i-1]!,access.points[i]!,access.width))return accessTopAt(access,x,z)
 const d=site('dock'),dx=Math.abs(x-d.x)/DOCK_SCALE,dz=(z-d.z)/DOCK_SCALE
 if(dx<4.5&&dz>-1.2&&dz<2.75||Math.abs(dx-3.65)<.75&&dz>-4.5&&dz<=-1.2)return LAKE.y+.65*DOCK_SCALE
 if(onFishingDeck(x,z))return FISHING_DECK.top
 return null
}

export function monumentTreadHeight(z:number){
 const s=MONUMENT_STAIRS
 const tread=Math.min(s.steps-1,Math.max(0,Math.floor((z-s.zTop)*s.steps/(s.zBottom-s.zTop)-1e-8)))
 return s.bottom+MONUMENT_TREAD_OFFSET+(s.top-s.bottom)*(s.steps-tread)/s.steps
}

export function walkHeightAt(x:number,z:number,currentY=4.28){
 if(onBridge(x,z))return bridgeDeckHeight(x)
 if(Math.abs(x-MONUMENT_STAIRS.x)<MONUMENT_STAIRS.width/2&&z>=MONUMENT_STAIRS.zTop&&z<=MONUMENT_STAIRS.zBottom)return monumentTreadHeight(z)
 return deckHeightAt(x,z,currentY)??heightAt(x,z)+.085
}
export function routeTo(id:string):Point[]{
 const destination=site(id),target=destination.node,dist=new Map<string,number>([['entry',0]]),previous=new Map<string,string>(),pending=new Set(Object.keys(NODES))
 while(pending.size){let current:string|undefined,best=Infinity;for(const n of pending){const d=dist.get(n)??Infinity;if(d<best){best=d;current=n}}if(!current)break;pending.delete(current);if(current===target)break
  for(const[a,b]of [...EDGES,...BRIDGE_EDGES]){const other=a===current?b:b===current?a:undefined;if(!other||!pending.has(other))continue;const p=NODES[current]!,q=NODES[other]!,d=best+Math.hypot(q[0]-p[0],q[1]-p[1]);if(d<(dist.get(other)??Infinity)){dist.set(other,d);previous.set(other,current)}}
 }
 const names=[target];while(previous.has(names[0]!))names.unshift(previous.get(names[0]!)!);const points=names.map(n=>NODES[n]!),last=points.at(-1)!,d=Math.hypot(last[0]-destination.x,last[1]-destination.z)
 if(id==='fishing')return [...points,...FISHING_ACCESS.points,[FISHING_DECK.x,FISHING_DECK.z+2]]
 if(destination.radius>0&&d>destination.radius+1){const r=destination.radius+1;points.push([destination.x+(last[0]-destination.x)/d*r,destination.z+(last[1]-destination.z)/d*r])}return points
}
export const routeLength=(points:readonly Point[])=>points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-points[i]![0],p[1]-points[i]![1]),0)
export const PLAYABLE_GAMES=['mole','bread','pigeon','arcade','vr','folk','shooting','fishing']
