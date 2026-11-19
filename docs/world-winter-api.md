# 겨울 공원 · 눈싸움 계약

공원 놀이이며 경기·점수·보상·지갑·정산 상태를 만들지 않는다. 기존 인증 WebSocket과 맵 확인 절차를 사용한다.

## 요청과 방송

- `WORLD_SNOWBALL_PICKUP {pileId}`로 바닥 눈더미에서 한 개를 줍는다. 원본 `SNOW_PILES`를 생성 맵 `data.physics.winterSnowPiles`에 넣어 FE/BE가 좌표·반경을 공유한다. 서버 물리 위치가 해당 구간의 반경 안인지, 발밑 지면 기준 캐릭터 중심 높이 차가 .65m 이내인지 확인한다. 경사길에서도 중심점 높이에 매이지 않는다. 눈더미는 고갈되지 않고 소지는 최대 한 개다.
- 요청: `WORLD_SNOWBALL_THROW`, payload `{ "yaw": 0 }`. yaw는 캐릭터 정면의 라디안이며 `[-π, π]` 범위의 유한수만 허용한다. 좌표·대상·명중 결과를 클라이언트가 지정할 수 없다.
- 응답과 같은 채널 방송: `WORLD_SNOWBALL_EVENT`. 요청자에게만 기존 requestId를 붙인다.
- payload: `shotId`, `channelId`, `userId`, `hitUserId`(빗나가면 빈 문자열), `x/y/z`, `endX/endY/endZ`, ISO `sentAt`, `durationMs`.
- `shotId`는 사용자 ID와 요청 ID의 조합이다. 서버는 사용자별 직전 동일 요청을 재사용하며 클라이언트도 중복 이벤트를 표시하지 않는다. 재접속 시 과거 발사는 재생하지 않는다.
- 최대 거리 16m, 발사 간격 900ms. 서버가 확정한 출발 위치와 방향으로 현재 위치의 앞쪽 대상 중 가장 가까운 대상을 고른다. 위아래로 떨어진 사용자와 폭 .65m 밖의 사용자는 제외한다.
- 명중은 발사 시점 위치로 판정하며 이동 표적의 미래 위치를 예측하지 않는다. 발사마다 소지 눈 한 개를 소비한다. 시각적 비행은 거리/22m/s, 최대 약 730ms다.
- 정적 구조물과 지형은 0.5m 구간별 포물선 raycast로 먼저 검사한다. 벽 뒤의 사용자에게 명중하지 않는다.
- 채팅·팝업 점유, 게임·점프맵·시설·업기/던지기·탈것·수영·따라가기 중 발사와 명중 대상 선정을 제한한다. 기존 맵 확인 및 복구 게이트를 유지한다.
- 오류: `SNOWBALL_ACTIVITY_CONFLICT`, `SNOWBALL_COOLDOWN`, `SNOWBALL_REQUIRED`, `SNOW_PILE_OUT_OF_RANGE`, `SNOWBALL_FROZEN`, `SNOWBALL_FREEZE_MISMATCH`, `SNOWBALL_ESCAPE_TOO_FREQUENT` 및 기존 `NOT_IN_CHANNEL`, `INVALID_PAYLOAD`.

## 동결·탈출과 상태

- 세 번 맞으면 5초간 얼고 들고 있던 눈은 사라진다. 서버 물리·좌표 보고와 FE 이동 예측·입력을 차단한다. 이미 얼어 있는 사용자는 추가 명중 대상에서 제외한다.
- A·D를 번갈아 여섯 번 누르면 즉시 풀린다. 기존 잡힘 탈출의 FE 교대 입력 판별기를 재사용하고 모바일에 A/D 버튼을 제공한다.
- `WORLD_SNOWBALL_ESCAPE {freezeId, key:'A'|'D'}`. 서버가 현재 동결 ID·중복 요청 ID·순서·간격을 검증한다. 같은 키 또는 1초 이상 쉬면 처음부터 세고 30ms 미만 입력과 브라우저 키 자동 반복은 세지 않는다.
- 5초 경과 시 월드 tick에서 자동 해제한다. 해제 시 피격을 초기화하고 1.5초간 재피격을 막는다. 이탈·연결 종료 시 소지·피격·동결을 정리하며 시설 hold와 동결 hold를 별도로 관리한다.
- `WORLD_SNOWBALL_STATE {channelId, version, players:[{userId, snowballs:0|1, hits:0..3, freezeId, frozenUntil, escapePresses}]}`. frozenUntil은 ISO 시각 또는 null, 해제 상태의 freezeId는 빈 문자열이다.
- 줍기·발사·피격·탈출·자동 해제·이탈 및 입장 시 같은 채널에 snapshot을 보낸다. `WORLD_SNOWBALL_CHECK {}`로 재조회한다. 다른 채널·낡은 version은 버린다. 서버 재시작 시 이 임시 놀이 상태는 유지하지 않는다.
- 동결 중 게임/시설 진입·업기·탈것·새 발사/줍기 등 충돌하는 요청을 거절한다. 채팅·다른 UI의 키 점유와 한글 조합 중에는 탈출/발사를 처리하지 않는다.

## 화면과 입력

- 최신 리뉴얼 공원에 강설, 중앙 트리·선물·산타, 정문·중앙마당·호수 주변 눈사람을 표시한다.
- 중앙 크리스마스 트리는 겹친 상록 가지, 빨강/금색/샴페인색 장식구, 늘어진 금빛 줄, 작은 발광 전구와 입체 별로 표시한다. 전구는 발광 재질이며 추가 point light를 만들지 않는다.
- 일반 숲과 운동장 나무는 대부분 원래 잎색을 유지하고 수관 윗면에 얇은 눈층을 얹는다. 일부 나무만 두꺼운 적설을 남긴다. 버드나무도 위쪽 잎에만 옅게 눈을 표시한다. 원본 배치·크기·기본 메시·충돌은 유지하고 눈층은 기존 형상의 상단을 잘라 공간 인스턴싱한다.
- 돌길 눈 구간 140곳과 잔디/숲길/도로 옆 잔디 구간 58곳을 합쳐 198곳에서 눈을 주울 수 있다. 시설·테이블·겨울 장식과 겹치지 않게 배치하고, 눈 사이에 원래 돌길과 잔디가 드러나는 구간을 남긴다. 입장 위치에서도 바로 주울 수 있다. 불규칙한 적설 표면은 지형을 따라 하나의 mesh로 합쳐 표시한다.
- Q 또는 화면 버튼은 눈이 없으면 눈더미에서 줍고, 소지한 눈이 있으면 캐릭터 정면으로 던진다. 범위 밖에서는 줍기 버튼을 잠근다. 얼음·남은 시간·탈출 진행은 서버 확정 상태로 표시한다.
- 서버 승인 이후에만 비행과 눈가루 효과를 표시한다. 같은 채널에 공유하며 다른 채널·과거 이벤트는 버린다.
- 산타는 종과 초록 선물 자루를 든 고정 인사 NPC다. 가까이 가면 인사를 표시한다. 퀘스트·보상은 없다.
- 저화질 강설 320개, 그 외 900개를 단일 points로 표시한다. 눈덩이·눈가루는 최대 32발을 단일 instanced mesh로 표시한다.
- 기존 건물의 위를 향한 삼각형에 얇은 적설을 복사한다. 원본 모델·재질·간판·문과 충돌에는 눈을 덧붙이지 않는다. 실내에서는 외부 겨울 장면이 함께 숨겨진다.

## 연결 및 실행

- FE: `frontend/src/features/winter/`. 공통 연결은 ParkPage, worldClient, runtime port, 기존 공통 입력·carry 활동 판별과 리뉴얼 장면이다.
- BE: `world/winter/SnowballService`. 기존 TableProtocol/Hub가 검증·방송을 연결하고 WorldChannelRegistry/Physics가 눈더미 거리·구조물 차단·동결 hold를 제공한다. PreparedParkMap이 생성 맵의 눈더미 메타데이터를 읽는다.
- DB/Flyway 변경 없음. 게임 코드·경기 인원·종료·기권·정산 계약 변경 없음.
- FE 실행: `node node_modules/vite/bin/vite.js --mode park-renewal-integration --host 127.0.0.1 --port 5300 --strictPort`.
- 외관 단독 검토: `http://127.0.0.1:5300/park-renewal.html?winter=1`. 로그인 없이 중앙 트리·산타·장식·강설·건물 적설을 회전·확대해서 확인한다. 이 화면은 서버 미연결 외관 프리뷰로, 실제 다인 눈싸움은 인증된 `/park`와 BE가 필요하다.
- 장식 확대 검토는 위 주소에 `&holiday=tree`, `&holiday=snowman`, `&holiday=gifts`, `&holiday=santa`를 붙인다. 사용자 참고 이미지의 형태/색을 따른 직접 제작 메시이며 첨부 사진을 화면에 붙이는 방식은 사용하지 않는다.
- 맵 생성: `node scripts/generate-renewal-park.mjs`. 생성된 FE/BE 맵·manifest를 함께 사용해야 장식과 석탑 충돌이 일치한다. 운영 배포 설정은 이 작업에서 변경하지 않는다.
