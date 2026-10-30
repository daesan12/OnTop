# BE 추가 질문 회신 · FE 생성 데이터 보강

기존 [연결 요청 문서](PARK_BACKEND_REQUEST.md)에 대한 회신입니다. Java·CI·배포는 담당자 범위로 유지하며 이번 변경은 FE 생성 데이터·문서·검증에 한정합니다.

## 채팅 전달문

확인 감사합니다. 아래 기준으로 진행 부탁드립니다.

1. **테이블 16개 모두 실제 게임용으로 사용합니다.** 채널당 16개 앵커를 연결하되 기존 2개의 서버 ID는 유지해 주세요. 나머지 14개는 서버에서 확정한 ID를 전달해 주시면 FE 앵커에 연결하겠습니다.
2. 익명 메모함은 `data.interactions.notes`에 추가했습니다. 위치는 `[60.5,18.12,54.5]`, 이용 반경 2.6m입니다. 높이 비교 기준인 아바타 원점 좌표 `reachPosition`은 `[60.5,18.92,54.5]`, 허용 높이 차이는 0.7m 미만입니다. 소리함은 말씀하신 대로 기존 `data.interactions.mailbox`를 사용합니다. 두 시설은 별개입니다.
3. 전망대는 `data.physics.tower`에 중심 `[62,56]`, 내측 반경 5m·외측 반경 8m, 높이 18m, 회전 수 3회와 바닥 오프셋을 추가했습니다. 디딤돌 24개는 `data.physics.steppingStones`에 ID·X/Z·폭/깊이·상단/하단 높이를 넣었습니다. 기존 충돌 hull에서 계산한 보조 정보이므로 형상을 중복 로딩하지 않으면 됩니다.
4. 테이블 매핑은 **기존 `park-bindings.json` 형식을 공통 사용**하는 것으로 맞추겠습니다. 신규 테이블 목록을 채널별 `channelId/tableId/anchorId`로 전달 부탁드립니다. 테이블 응답 API에 bindings를 추가하자는 이전 제안은 철회합니다.
5. Java 판정·서버 ID·`WORLD_MAP_CONFIRM` 방식은 유지하고, CI·배포는 말씀하신 담당 범위로 진행 부탁드립니다. 실제 맵 전환은 양쪽 연동·검증 후 함께 진행하겠습니다.

새 JSON과 manifest를 같은 세트로 전달합니다. 후속 FE 작업에서 새 맵 `/park`를 명시적 `park-integration` 모드로 연결하고 최신 버전 확인·BE 전달 16개 매핑을 반영했습니다. 기본 서비스 전환과 실제 BE 공동 검증은 테스트 서버 준비 후 진행합니다. [FE 연결 안내](PARK_FE_INTEGRATION.md)를 참고해 주세요.

## 전달 데이터

- `frontend/generated/park/server-map.json`
- `frontend/generated/park/manifest.json`

```json
{"mapId":"park","schemaVersion":2,"mapVersion":"5ce3cff53136eaa3be6a9fe3048d49f611403c1ceff41d2c8f266e26cc6ac840"}
```

schemaVersion 2에 필드를 추가했습니다. 기존 필드를 삭제하거나 의미를 바꾸지 않았으며, 데이터·소스 변경에 따라 mapVersion을 갱신했습니다. 다음 생성 시에는 파일에 기록된 identity가 기준입니다.

## 익명 메모함의 정확한 판정 기준

`data.interactions.notes`:

| 필드 | 현재 값·의미 |
| --- | --- |
| `id` | `anonymous-notes` — 생성 데이터의 시설 키 |
| `position` | `[60.5,18.12,54.5]` — 전망대 위 메모함 모델의 바닥 기준 위치 |
| `reachPosition` | `[60.5,18.92,54.5]` — 기존 서비스 아바타 원점으로 비교할 기준점 |
| `radius` | `2.6` — X/Z 평면 거리 |
| `heightTolerance` | `0.7` — Y 높이 차이 |
| `radiusComparison` | `less-than-or-equal` |
| `heightComparison` | `strict-less-than` |
| `heightReference` | `legacy-avatar-origin` |

판정식은 다음과 같습니다. `player`는 서버의 기존 아바타 원점 좌표이며 발바닥 좌표가 아닙니다.

```text
hypot(player.x - reachPosition[0], player.z - reachPosition[2]) <= radius
AND abs(player.y - reachPosition[1]) < heightTolerance
```

`reachPosition`에 +0.8m가 이미 반영되어 있으므로 다시 더하지 않습니다. 수치는 반올림해 판정하지 않고 JSON 원본 number를 사용합니다. 부동소수점 경계는 기존 엔진의 비교 정책을 적용합니다. 메모함 접근 기준을 제공하는 것이며 순간이동·착석 지점이 아닙니다. 익명성·내용 길이·저장·보존 정책은 기존 BE 정책을 유지합니다.

메모함 위치는 기존 NOTES_BOX의 전망대 기준 오프셋에서 계산하므로 전망대를 옮기면 함께 이동합니다. 소리함 `data.interactions.mailbox.position`은 현재 `[-18,0,18]`이고 반경은 2.6m이며 이번에 변경하지 않았습니다.

## 전망대 보조 이동 정보

`data.physics.tower`:

| 필드 | 현재 값·의미 |
| --- | --- |
| `x`, `z` | `62`, `56` — 월드 중심 |
| `inner`, `outer` | `5`, `8` — 나선 경사로의 내측·외측 반경 |
| `height`, `turns` | `18`, `3` — 상승 높이와 회전 수 |
| `surfaceOffset`, `topY` | `0.12`, `18.12` — 시작 바닥 Y와 정상 바닥 Y |
| `segments` | `360` — 기존 경사로 분할 수 |
| `railHeight`, `jumpSpeed` | `1.4`, `7.8` — 기존 모델·이동 메타데이터 값 |

경사로는 `t∈[0,1]`에서 `angle=2π*turns*t`, `x=centerX+r*cos(angle)`, `z=centerZ+r*sin(angle)`, `y=surfaceOffset+height*t`입니다. 시각·물리 메시와 같은 기존 모델 설정에서 생성합니다. 실제 바닥과 난간 형상은 기존 `physics.meshes/boxes`를 사용하며 이 메타데이터는 기존 Java 보조 판정에 연결합니다.

## 디딤돌 보조 이동 정보

`data.physics.steppingStones[]`는 24개입니다.

- `id`: 대응하는 `physics.hulls[]`와 같은 ID. 예: `layout-stone-bridge-stone-0`.
- `x`, `z`: 해당 hull의 월드 축 정렬 경계 중심.
- `width`, `depth`: 해당 경계의 전체 폭·깊이. 반치수가 아닙니다.
- `bottom`, `top`: 월드 Y 최솟값·최댓값. 현재 각각 `-0.3`, `0.32`.
- `height`: `top-bottom`. 현재 `0.62`.

불규칙한 돌의 실제 충돌 hull에서 도출한 무확장 경계입니다. 모델에 적용하기 전의 명목 폭과 일부 다를 수 있습니다. 캐릭터 반경·margin을 미리 더하지 않았으며 **보조 오르기 판정용**입니다. 이 배열로 별도 박스 충돌체를 추가하면 기존 hull과 중복됩니다. 호수·횡단 위치를 바꾸면 같은 ID의 보조 정보도 함께 갱신됩니다.

## park-bindings.json 공동 사용

기존 형식 `{ "bindings": [{ "channelId", "tableId", "anchorId" }] }`를 유지합니다. 서버 ID를 FE에서 추측·발급하거나 목록 순서로 연결하지 않습니다. `emotes` 등 기존 추가 필드는 보존합니다.

현재 파일 상태:

- `frontend/public/park-bindings.json`: bindings가 비어 있습니다. 16개 등록이 완료된 상태가 아닙니다.
- `frontend/public/park-bindings.dev.json`: channel-1의 기존 2개 매핑만 있습니다.
- `frontend/public/park-bindings.frontend-test.json`: 두 테스트 채널의 기존 2개씩 매핑만 있습니다.

FE는 실행 모드에 따라 위 파일을 선택합니다. BE가 실제 채널별 16개 테이블 ID 목록을 확정해 주면 담당자가 사용할 파일·버전을 맞추고 FE 환경별 매핑도 동기화하겠습니다. 동일 채널 내 서버 ID·앵커 ID는 중복 없이 각각 하나씩 연결하며, 공통 JSON의 table-1~table-16 전체가 실제 게임용입니다.

## 확인한 범위

추가된 메타데이터와 원본 형상·시설 이동의 일관성, FE 이용 반경·높이 기준과의 일치, JSON·manifest·FE 생성 버전의 일치를 검사합니다. 기존 3D boxes/meshes/hulls와 배치는 변경하지 않았습니다. BE 로딩과 CI는 구현하지 않았으며 실제 Java 보조 이동·신규 서버 테이블 등록은 BE에서 연결·검증해야 합니다.
