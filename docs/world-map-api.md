# 맵 버전 전달·입장 전 확인

담당: 장대산. 서버 연결부·로컬 검증 범위이며 FE 서비스 맵 전환·개발 서버 배포는 별도다.
기본값은 기존 `/world/park.json`이다. 생성 맵은 아래 실행 설정을 명시한 별도 서버에서 선택할 수 있다.
현재 실행 서버의 맵 전환·배포는 수행하지 않았으며 기존 Java 이동·충돌 판정은 유지한다.

## 연결 완료 · CONNECTED

기존 `/ws/tables` 인증·접속권·userId를 유지하고 다음 필드를 추가한다.

```json
{
  "requestId": null,
  "type": "CONNECTED",
  "payload": {
    "userId": "101",
    "map": {
      "mapId": "park",
      "schemaVersion": 1,
      "mapVersion": "544bc6fa3890c77e8de0ec91d27f93981b4d23a477918963757e4762294ba8d0"
    },
    "mapVerificationRequired": false
  }
}
```

`map`은 서버 물리 엔진이 로딩한 ParkScene에서 가져온다. 현재 구형 맵의 mapId는 리소스에 대응하는
`park`, schemaVersion은 JSON의 schemaVersion, mapVersion은 기존 sourceSha256이다.
WORLD_STATE·시설 카탈로그의 mapVersion과 동일하다. FE 신규 생성 버전으로 기존 서버 버전을 덮어쓰지 않는다.
생성 맵을 명시 선택한 서버에서는 같은 형식으로 선택된 schema2 식별 정보를 전달한다.

## 확인 요청 · WORLD_MAP_CONFIRM

FE는 서버 값을 그대로 복사하지 않고 **자신이 사용하는 맵에 포함된 식별 정보**를 보낸다.
로그인 인증을 대체하는 요청이 아니며, 좌표 조작 방지도 계속 서버 이동 판정에서 담당한다.

```json
{
  "requestId": "map-confirm-1",
  "type": "WORLD_MAP_CONFIRM",
  "payload": {
    "mapId": "park",
    "schemaVersion": 1,
    "mapVersion": "544bc6fa3890c77e8de0ec91d27f93981b4d23a477918963757e4762294ba8d0"
  }
}
```

세 필드 모두 필수다. mapId는 영문·숫자·하이픈·밑줄 1~80자, schemaVersion은 양의 int,
mapVersion은 소문자 16진수 64자리다. 누락·타입 오류·추가 필드는 INVALID_PAYLOAD다.

## 성공 응답 · WORLD_MAP_STATE

```json
{
  "requestId": "map-confirm-1",
  "type": "WORLD_MAP_STATE",
  "payload": {
    "map": {
      "mapId": "park",
      "schemaVersion": 1,
      "mapVersion": "544bc6fa3890c77e8de0ec91d27f93981b4d23a477918963757e4762294ba8d0"
    },
    "verified": true
  }
}
```

동일 요청을 반복해도 확인 응답만 보내며 복구 서비스 연결·게임 시작을 반복하지 않는다.
검사 활성화 시 초기 순서는 CONNECTED → WORLD_MAP_CONFIRM → WORLD_MAP_STATE → 기존 경기 복구
알림/확인 → CHANNEL_JOIN이다. CHANNEL_JOIN의 기존 payload `{channelId}`는 바꾸지 않는다.
입장 요청만으로는 접속 직후 경기 자동 복구를 제어할 수 없어 별도 확인 메시지를 사용한다.

## 오류

```json
{
  "requestId": "map-confirm-1",
  "type": "ERROR",
  "payload": {
    "code": "MAP_VERSION_MISMATCH",
    "message": "맵을 새로고침한 뒤 다시 연결해주세요.",
    "serverMap": {
      "mapId": "park",
      "schemaVersion": 1,
      "mapVersion": "544bc6fa3890c77e8de0ec91d27f93981b4d23a477918963757e4762294ba8d0"
    }
  }
}
```

| code | 조건·처리 |
| --- | --- |
| MAP_VERSION_MISMATCH | 세 필드 중 하나라도 서버와 다름. 확인 승인·입장·복구를 수행하지 않음 |
| MAP_VERSION_REQUIRED | 검사 활성화 시 미확인 연결의 다른 유효한 애플리케이션 요청. serverMap도 제공 |
| INVALID_PAYLOAD | 확인 요청의 필드·타입·길이 오류. 기존 공통 ERROR 형식 |

오류 후 소켓은 유지한다. FE는 입장·이동·활동을 보류하고 업데이트 안내와 사용자의 새로고침·재접속을
제공한다. 메타데이터가 없거나 확인 응답을 받지 못해도 입장하지 않는다. 무한 자동 재접속은 하지 않는다.
기존 인증·heartbeat는 계속 적용된다. 맵 확인을 기다려도 경기 턴 시간·30초 재접속 기한은 연장되지 않는다.
재접속마다 새 연결에서 다시 확인하며 이전 연결의 승인을 재사용하지 않는다.

## 활성화와 후속 연결

`ontop.world.map.require-match` / `WORLD_MAP_REQUIRE_MATCH` 기본값은 false다.
기존 FE 연결을 위해 기본값에서는 기존 접속·자동 복구 흐름을 유지한다.
false여도 메타데이터와 확인 메시지를 제공하고 명시적인 불일치 확인 요청은 거절한다.
true에서는 확인 전 채널·이동·시설·테이블·게임 요청과 경기 복구/결과 구독 연결을 보류한다.
새로 접속한 미확인 세션에는 기존 보존 좌석의 테이블·시작 상태도 방송하지 않는다.

FE가 확인 요청을 연결하고 양쪽 실제 맵이 일치하는 것을 검증한 뒤 설정을 켠다.
새 맵·시설 좌표·버전을 함께 생성/배포하는 작업과 구분하며 현재 자료만으로 서비스 맵을 전환하지 않는다.
DB 스키마·인증·판돈 예약/정산은 변경하지 않는다.

## 생성 맵 사전 로딩·무결성 검사

`GeneratedParkMapLoader.load(mapFile, manifestFile)`는 명시적으로 전달한 두 로컬 파일을 검사한다.
로더만 호출하면 런타임 맵은 바뀌지 않는다. 아래 실행 선택은 WorldMapRuntime이 로더·조립 결과를
실제 빈에 연결하는 별도 경로다. HTTP/WS API 추가는 없다.

- 맵 format=`ontop.park-map`, manifest format=`ontop.park-map-manifest`, hashAlgorithm=`sha256`.
- 양쪽 mapId=`park`, schemaVersion=정수 `2`, mapVersion=소문자 16진수 64자리이며 서로 같아야 한다.
- manifest.artifacts의 `generated/park/server-map.json` 항목이 정확히 하나 있어야 한다.
  그 항목의 bytes와 sha256을 **줄바꿈까지 포함한 원본 맵 바이트**와 대조한다.
  mapVersion은 소스 버전, sha256은 생성 파일의 해시이므로 서로 같은 값일 필요가 없다.
- manifest가 가리키는 다른 파일은 열지 않는다. 전달받은 맵은 최대 16MiB, manifest는 최대 1MiB다.
  누락 파일·잘못된 JSON·중복 JSON 키·뒤에 추가된 JSON·지원하지 않는 규격·불일치는 실패한다.
- data.physics의 m/Y/world 좌표계, 사전 반경/여백 0, 캡슐 중심 스폰, 캐릭터 치수,
  boxes/hulls/meshes의 기본 구조·유한한 수·메시 인덱스 범위를 검사한다. terrain/surface/solid를 보존한다.
  FE 2D 미리보기용 data.collision을 물리 데이터에 합치지 않는다.

이는 파일끼리의 무결성·기본 구조 검사다. manifest의 출처 인증, 지형의 실제 통행 가능성,
시설·테이블 ID/좌표 매핑, 새 물리 엔진 실행·서비스 전환 성공을 보장하지 않는다.

일반 단위 검사는 `GeneratedParkMapLoaderTests`다. 실제 전달본 검사는 실행 전에
`TEST_GENERATED_MAP_DIR`을 server-map.json·manifest.json이 함께 있는 로컬 폴더로 지정하고
`gradlew test --tests '*GeneratedParkMap*' --rerun-tasks`로 실행한다. 경로가 없으면 전달본 검사는 스킵된다.
해당 검사는 전달본 검증 전후 기존 ParkScene의 식별 정보가 그대로인지도 확인한다.

2026-10-26 FE `6bd9567` 전달본은 사전 검사를 통과했다. 런타임 리소스에는 복사하지 않았다.
테이블 매핑·시설 이용 위치·기존 이동 파라미터 보완 후 실제 맵 전환은 별도로 검증해야 한다.

## 180m 공원 테이블·좌표 조립 준비

FE `5c171c6`의 추가 데이터를 기준으로 `PreparedParkMap.load(mapFile, manifestFile, channelIds)`를
추가했다. 앞선 체크섬 검사를 통과한 파일로 다음 자료를 조립한다.
기본값은 기존 맵을 유지한다. 명시적 테스트 주입 또는 아래 실행 설정으로 새 맵을 연결할 수 있다.

| 제공 자료 | 연결 내용 |
| --- | --- |
| bindings / createRooms() | 채널별 table-1~16 앵커와 독립 TableRoom 16개. 기존 게임 선택·준비 모델 재사용 |
| proximity() | 같은 서버 ID에 새 앵커의 X/Z 연결. 기존 채팅·관전 반경 20m 유지 |
| collisionData() | 기존 Java 물리 입력 형식으로 지형·충돌·스폰·호수·전망대·디딤돌 변환 |
| createScene() | 위 입력과 원래 schema2 식별 정보로 별도 네이티브 ParkScene 생성. 기본 장면 교체 없음 |
| facilities() | 새 시설 ID·이용/하차 자세·높이·반경과 같은 mapVersion. 기존 망원경 속도/각도 설정 유지 |
| notes() / feedback() | 익명 메모함·소리함 접근 기준. REST 저장/보존 정책과 별개 |

서버 ID는 기존 `UUID.nameUUIDFromBytes(UTF-8(channelId + NUL + "table-" + 번호))` 규칙을 유지한다.
처음 두 테이블 ID를 바꾸지 않고 3~16번을 같은 방식으로 확정했다. ID는 좌표·맵 버전·목록 정렬에 의존하지 않는다.
앵커 누락·중복·기존 매핑 충돌은 실패하며 목록 순서로 추측하지 않는다.

프론트 전달 파일:

- [개발 channel-1 · 16개](integration/park-180/park-bindings.dev.json)
- [로컬 연동 channel-1/2 · 총 32개](integration/park-180/park-bindings.frontend-test.json)

두 파일은 기존 `{ "bindings": [{ "channelId", "tableId", "anchorId" }] }` 형식과 원본의 추가 필드를 유지한다.
각 파일은 해당 환경 채널의 전체 매핑이다. **현재 서버에 16개가 등록/배포된 것은 아니므로 FE 실행 파일에
먼저 덮어쓰지 않는다.** 운영 채널은 실제 목록이 확정된 뒤 같은 규칙으로 따로 생성한다.

변환 세부 사항:

- 원본 schema2 메타데이터는 `metadata()`로 별도 유지한다. collisionData의 schema1은 기존 Java가 읽을
  내부 물리 입력 형식이다. 이를 CONNECTED의 schemaVersion으로 쓰거나 현재 리소스에 복사하지 않는다.
- 새 좌표·형상은 생성 JSON에서 읽고 기존 Java 이동 속도·중력·단차·수영 속도는 유지한다.
  캐릭터 치수가 다르면 실패한다. 지형 격자·정점·삼각형 순서를 검사하고 지형을 첫 메시로 정렬한다.
- physics의 3D boxes/meshes/hulls만 사용한다. 2D collision을 합치지 않는다.
  디딤돌 보조 정보는 원래 hull의 경계와 대조해 복사하며 충돌체를 더 만들지 않는다.
- 벤치·운동기구·망원경의 position은 바닥 기준이므로 접근 중심에 기존 아바타 높이 0.8m를 한 번 더한다.
  use/exit는 이미 아바타 좌표이므로 그대로 사용한다. 벤치별 하차 좌표가 좌석마다 다르면 현재 모델로
  조용히 버리지 않고 실패한다.
- 메모함 reachPosition에는 보정이 이미 있어 그대로 사용한다. 수평 거리 <= radius, 높이 차 < tolerance다.
  소리함 mailbox.position은 바닥 기준이므로 0.8m를 한 번 보정하며 기존 높이 경계 포함 정책을 유지한다.

기본 단위 검사는 PreparedParkMapTests다. `TEST_GENERATED_MAP_DIR`을 최신 전달본과 기존 환경별
park-bindings 두 파일이 있는 폴더로 지정하면 PreparedParkMapHandoffTests가 실제 데이터·문서 매핑
일치·관전 20m·기존 맵 유지를 검사하고 build/park-prepared/ 아래에 전달 파일을 생성한다.
추가 승인한 테스트 연결은 다음 순서다.

1. `park.createScene()`으로 별도 장면 생성 → WorldChannelRegistry의 명시적 장면 생성자에 전달.
2. WorldMapCompatibility에 같은 `park.metadata()`를 전달. CONNECTED·WORLD_STATE·시설 버전을 일치시킨다.
3. TableHub의 마지막 인수에 `park`를 전달하면 채널별 16개 등록·시설 카탈로그·20m 관전 좌표·메모함
   접근 기준을 함께 연결한다. 채널 목록이나 맵 식별 정보가 다르면 서버 시작 전에 실패한다.

PreparedParkSocketTests는 랜덤 포트의 별도 서버에서 실제 네이티브 장면·WebSocket으로 schema2 확인,
16번 테이블 착석·게임 선택·준비, 시설 이용/반납을 검사한다. 고정 회원 fixture와 서버 위치 fixture를 사용한다.
준비 요청은 최신 dev의 동의 규칙에 맞춰 각 클라이언트가 직접 받은 테이블 금액·버전을 전송한다.
메모/소리함 검사는 실제 Hub 접근 판정까지이며 REST 저장·실제 로그인·DB 검사가 아니다.
단위 네이티브 이동은 단순 지형 fixture에서도 검증한다. PreparedParkMovementTests는 실제 FE 전달본의
외벽/테이블 영역, 호수 수영, 대표 디딤돌, 전망대 입구의 나선 경사로를 별도 장면에서 검사한다.
좌표는 생성 데이터에서 읽고 시작 위치만 서버 fixture로 배치한다. 전체 장애물·24개 돌·전망대 정상까지
모두 검수한 것은 아니다. FE 3D 공동 검수·CI·배포는 후속이다. 기본값 변경·서비스용 신규 실행 프로필은 없다.

## 실행 시 생성 맵 선택

`WorldChannelConfiguration`이 하나의 `WorldMapRuntime`을 만든다. Registry/물리 장면, 맵 버전 확인,
TableHub의 테이블·시설·메모함, WorldProximity의 관전 좌표가 같은 선택 결과를 사용한다.
기본값 `WORLD_MAP_SOURCE=legacy`에서는 기존 맵·채널당 테이블 2개를 유지한다.
JSON 경로만 설정해도 자동 전환되지 않는다.

새 맵을 선택하는 별도 실행에는 아래 네 값이 모두 필요하다. `.env.example`은 legacy 기본값을 유지한다.

```dotenv
WORLD_MAP_SOURCE=generated
WORLD_MAP_JSON_PATH=/opt/ontop/maps/server-map.json
WORLD_MAP_MANIFEST_PATH=/opt/ontop/maps/manifest.json
WORLD_MAP_REQUIRE_MATCH=true
```

- 경로는 서버가 읽을 수 있는 일반 파일 경로다. 절대 경로를 권장하며 상대 경로는 실행 디렉터리 기준이다.
  URL/classpath 주소가 아니며 파일을 내려받거나 FE 생성물을 JAR에 자동 포함하지 않는다.
- 두 파일은 같은 FE 생성 세트여야 한다. 채널 설정도 필요하며 각 채널에 기존 규칙으로 16개 테이블을 만든다.
  기존 서버 ID·[환경별 매핑](integration/park-180/park-bindings.dev.json)은 유지한다.
- 알 수 없는 source, 누락 경로/채널, require-match=false, 파일·체크섬·맵/좌표 규격 오류는 시작 실패다.
  실패 시 구형 맵으로 조용히 되돌아가지 않는다.
- 선택은 서버 시작 시 한 번 수행한다. 파일 변경만으로 실행 중인 물리 장면이 바뀌지 않는다.
  실제 전환에는 FE 버전 확인 연결·공동 검수 후 파일 제공/환경변수 설정과 서버 재시작·재배포가 필요하다.
  CI·Compose·배포 설정은 이번 변경에 포함하지 않았다.

WorldMapRuntimeConfigurationTests는 기본값/경로만 설정/잘못된 설정을 검사한다.
`TEST_GENERATED_MAP_DIR`을 지정한 GeneratedWorldMapRuntimeTests는 실제 전달본 선택과 변조 파일 거절을,
WorldMapSelectionWebSocketTests는 실제 앱의 랜덤 포트에서 버전 확인·16번 착석·게임 선택·전원 준비를 검사한다.
회원 인증은 fixture이며 DB 저장·FE 3D 화면·실제 실행 서버 전환 검증은 아니다.
