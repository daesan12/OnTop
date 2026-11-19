# 겨울 공원 · 눈싸움 계약

공원 놀이이며 경기·점수·보상·지갑·정산 상태를 만들지 않는다. 기존 인증 WebSocket과 맵 확인 절차를 사용한다.

## 요청과 방송

- 요청: `WORLD_SNOWBALL_THROW`, payload `{ "yaw": 0 }`. yaw는 캐릭터 정면의 라디안이며 `[-π, π]` 범위의 유한수만 허용한다. 좌표·대상·명중 결과를 클라이언트가 지정할 수 없다.
- 응답과 같은 채널 방송: `WORLD_SNOWBALL_EVENT`. 요청자에게만 기존 requestId를 붙인다.
- payload: `shotId`, `channelId`, `userId`, `hitUserId`(빗나가면 빈 문자열), `x/y/z`, `endX/endY/endZ`, ISO `sentAt`, `durationMs`.
- `shotId`는 사용자 ID와 요청 ID의 조합이다. 서버는 사용자별 직전 동일 요청을 재사용하며 클라이언트도 중복 이벤트를 표시하지 않는다. 재접속 시 과거 발사는 재생하지 않는다.
- 최대 거리 16m, 발사 간격 900ms. 서버가 확정한 출발 위치와 방향으로 현재 위치의 앞쪽 대상 중 가장 가까운 대상을 고른다. 위아래로 떨어진 사용자와 폭 .65m 밖의 사용자는 제외한다.
- 명중은 발사 시점 위치로 판정한다. 이동 표적의 미래 위치를 예측하거나 피격으로 이동·기권·활동을 중단하지 않는다. 시각적 비행은 거리/22m/s, 최대 약 730ms다.
- 정적 구조물과 지형은 0.5m 구간별 포물선 raycast로 먼저 검사한다. 벽 뒤의 사용자에게 명중하지 않는다.
- 채팅·팝업 점유, 게임·점프맵·시설·업기/던지기·탈것·수영·따라가기 중 발사와 명중 대상 선정을 제한한다. 기존 맵 확인 및 복구 게이트를 유지한다.
- 오류: `SNOWBALL_ACTIVITY_CONFLICT`, `SNOWBALL_COOLDOWN`, 기존 `NOT_IN_CHANNEL`, `INVALID_PAYLOAD`.

## 화면과 입력

- 최신 리뉴얼 공원에 강설, 중앙 트리·선물·산타, 정문·중앙마당·호수 주변 눈사람을 표시한다.
- `Q` 또는 눈덩이 버튼으로 캐릭터 정면을 향해 던진다. 문자 입력·한글 조합·다른 UI 키 점유·자동 반복 중에는 발사하지 않는다.
- 서버 승인 이후에만 비행과 눈가루 효과를 표시한다. 같은 채널에 공유하며 다른 채널·과거 이벤트는 버린다.
- 산타는 고정 인사 NPC다. 가까이 가면 인사를 표시하고 손을 흔든다. 퀘스트·보상은 없다.
- 저화질 강설 320개, 그 외 900개를 단일 points로 표시한다. 눈덩이·눈가루는 최대 32발을 단일 instanced mesh로 표시한다.
- 기존 건물의 위를 향한 삼각형에 얇은 적설을 복사한다. 원본 모델·재질·간판·문과 충돌에는 눈을 덧붙이지 않는다. 실내에서는 외부 겨울 장면이 함께 숨겨진다.

## 연결 및 실행

- FE: `frontend/src/features/winter/`. 공통 연결은 ParkPage, worldClient, runtime port와 기존 리뉴얼 장면에 한정한다.
- BE: `world/winter/SnowballService`. 기존 TableHub는 승인·대상 선정·같은 채널 방송을 연결하고, 기존 WorldPhysics는 구조물 차단 거리를 제공한다.
- DB/Flyway 변경 없음. 게임 코드·경기 인원·종료·기권·정산 계약 변경 없음.
- FE 실행: `node node_modules/vite/bin/vite.js --mode park-renewal-integration --host 127.0.0.1 --port 5300 --strictPort`.
- 외관 단독 검토: `http://127.0.0.1:5300/park-renewal.html?winter=1`. 로그인 없이 중앙 트리·산타·장식·강설·건물 적설을 회전·확대해서 확인한다. 이 화면은 서버 미연결 외관 프리뷰로, 실제 다인 눈싸움은 인증된 `/park`와 BE가 필요하다.
- 맵 생성: `node scripts/generate-renewal-park.mjs`. 생성된 FE/BE 맵·manifest를 함께 사용해야 장식과 석탑 충돌이 일치한다. 운영 배포 설정은 이 작업에서 변경하지 않는다.
