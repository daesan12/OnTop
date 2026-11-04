# 서비스 배출·점검 운영 절차

V146은 단일 운영 상태를 저장한다. 상태는 앱 재시작과 새 이미지 배포 사이에도 유지된다.

| 상태 | 새 공원 WebSocket 접속 | 새 보드게임·미니게임 시작 | 진행 중 경기 액션·종료·정산 |
| --- | --- | --- | --- |
| `NORMAL` | 허용 | 허용 | 허용 |
| `DRAINING` | 차단 | 차단 | 허용 |
| `MAINTENANCE` | 차단 | 차단 | 허용 |

일반 사용자는 `DRAINING` 또는 `MAINTENANCE` 상태에서 공원 대신 안내문과 예상 재개 시각을 본다.
관리자는 점검 중에도 `/admin` 경로로 접근할 수 있다. 백엔드가 재기동 중이라 상태 API가 응답하지 않아도
Vercel 프론트는 안전한 기본 점검 화면을 표시한다.

## 배포 순서

1. 공개 상태 `GET /api/v1/operations/status`에서 현재 `version`을 확인한다.
2. 관리자 Access JWT로 `DRAINING` 전환을 요청한다. `expectedOpenAt`은 ISO-8601 UTC 시각이다.
3. 진행 중인 경기가 모두 종료되고 정산된 것을 확인한다. 새 접속과 새 경기는 서버가 거절한다.
4. 같은 최신 `version`으로 `MAINTENANCE`로 전환한다.
5. 백엔드 이미지와 프론트 배포를 진행하고 Flyway V146, 헬스, 주요 기능을 확인한다.
6. 최신 `version`으로 `NORMAL` 전환 후 공개 상태와 실제 공원 입장을 확인한다.

```json
{
  "mode": "DRAINING",
  "notice": "진행 중인 경기를 마무리한 뒤 새 버전으로 돌아올게요.",
  "expectedOpenAt": "2026-11-04T06:30:00Z",
  "expectedVersion": 0
}
```

전환 요청은 `PUT /api/v1/admin/operations/status`로 보낸다. 응답의 `version`을 다음 전환의
`expectedVersion`으로 사용한다. 다른 관리자가 먼저 변경한 오래된 버전은 409로 거절한다.

`NORMAL` 복귀 요청은 `notice`와 `expectedOpenAt`을 생략할 수 있으며 서버가 기존 점검 정보를 지운다.

```json
{
  "mode": "NORMAL",
  "expectedVersion": 2
}
```

## 주의

- 이 기능은 진행 중 게임을 다른 컨테이너로 이전하는 블루·그린 배포가 아니다.
- DB 상태나 지갑을 직접 수정하지 말고 운영 상태 API를 사용한다.
- `DRAINING` 직후 앱을 종료하지 않는다. 진행 중 경기 종료와 정산 완료를 먼저 확인한다.
- V145는 다른 작업에 예약되어 있으므로 이 기능은 V146을 사용한다. V145가 `dev`에 병합된 뒤 배포한다.
