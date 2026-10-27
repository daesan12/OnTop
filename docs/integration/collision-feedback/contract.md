# 분수·돌 의자 충돌 FE 전달본

기준: `fix/frontend-feedback-assets`의 `a1403c7fec82b520ee9713c6963e25f418e77ff8`.
기존 legacy 맵의 충돌 보정이다. 180m 생성 맵 활성화와 별개이며 서버 재시작·배포는 수행하지 않았다.

2026-10-27 전체16개 연결의 현행 대응표는 [현재 맵 테이블 연결](../../legacy-table-integration.md)과
[개발16개 매핑](../legacy-tables/bindings.dev.json)을 사용한다. 아래2개 매핑은 충돌 보정 당시 기록이다.

## 생성 결과

| 항목 | 값 |
| --- | --- |
| mapId / schemaVersion | park / 1 |
| mapVersion | ae833248d2dd356c6603af72b2b865f9051a866e9cfa7d2b9c9abe890579944d |
| 박스 / 메시 / hull | 1205 / 4 / 9 |
| 시설 정의 | 94개, 이용 위치·좌석·ID 유지 |
| 기존 테이블 매핑 | park-bindings.dev.json 2개 / park-bindings.frontend-test.json 4개, 변경 없음 |

`source-manifest.json`은 해당 커밋의 `frontend/src/config` 전체 파일을
`packages/shared-config/src` 아래에 옮겨 읽기 위한 파일 목록·bytes·SHA-256이다.
이 manifest 원시 바이트의 SHA-256이 mapVersion이며, 생성 JSON 자체의 파일 해시와 구분한다.
원본은 작업 폴더의 개행 변환 영향을 피하도록 해당 Git 커밋을 `git archive`로 추출한다.
manifest는 `.gitattributes`로 원시 바이트를 유지한다. `source-manifest.json`을 `<handoff>/manifest.json`으로 바이트 변경 없이 복사한다.
원본 코드를 `<handoff>/packages/shared-config/src`에 두고 다음 명령으로 재현한다.

```sh
node --experimental-vm-modules backend/tools/bake-world.mjs <handoff> --output <park.json>
node --experimental-vm-modules backend/tools/bake-facilities.mjs --config <handoff>/packages/shared-config/src --map <park.json> --output <facilities.json>
```

원래 `fountain-basin` 사각형 1개를 제거하고 반경 5.4m 원판의 Z 방향 48구간 박스를 사용한다.
야외 stone-seat 16개를 추가하고 picnic-stool 12개의 이동 벽 높이를 2.5m로 맞춘다.
전체 박스는 1142→1205개이며 지형·스폰·테이블 좌표·메시·hull은 동일하다.
Java 이동·충돌 알고리즘, DB/Flyway, FE 소스·버전·실행 설정은 변경하지 않았다.

## FE 연결 및 배포 조건

FE가 사용하는 `EXPECTED_MAP_VERSION`도 위 값과 일치시킨 뒤 함께 배포해야 한다.
현재 저장소의 구형 FE 버전 값은 수정하지 않았으므로 BE 변경만 배포하면 버전 불일치가 발생한다.
서버 `CONNECTED.payload.map`은 실제 로딩 버전을 반환하며 기존 WORLD_MAP_CONFIRM 계약을 사용한다.
위 바인딩은 기존 legacy 채널 구성에 대한 목록이다. 새 180m 맵의 16개 테이블 바인딩과 섞지 않는다.
현재 실행 중 서버·개발 서버가 이 버전으로 바뀌었다는 뜻이 아니다.

## 검증 범위

`FeedbackCollisionTests`는 실제 Bullet로 분수 바깥 대각선 보행·달리기, 8방향 진입,
28개 의자의 양 축 접근·걷기·달리기·점프를 검사한다. 시작 위치는 서버 테스트 fixture다.
승인 착석 검사는 WorldPhysics의 held 몸체 제외·해제 후 복귀 검사이며 실제 Hub 착석·FE 모델 검수와 구분한다.
같은 기존 3개 입력으로 수정 전후 native probe도 비교한다. 네이티브 충돌 검증이며 FE 3D 관통 보정,
실제 계정 공동 검수·개발 서버 배포·180m 맵 전체 주행을 완료한 것으로 보지 않는다.
