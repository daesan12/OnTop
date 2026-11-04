# 공원 공지 관리 API

상태: 2026-11-04 로컬 구현·단위/브라우저 계약 검증. V148은 작성만 했으며 실제 DB·DEV·운영에는 적용하지 않았다.

## 권한과 화면

- `/admin/announcements`: 기존 운영 관리자(`canOperate`)만 편집. 조회 전용 관리자는 편집 불가.
- 공원: 회색 반투명 배너에서 표시 순서→ID 순으로 반복, 일시정지·전체 본문 읽기 제공. 기존 점검 안내는 그대로 유지.
- 게시 기간은 서버 시각 기준 `[startsAt, endsAt)`. 관리자 화면 입력은 기기 현지 시간→UTC 변환.
- 최대 10초마다 재조회하고 예약 경계가 더 가까우면 그때 재조회. 탭 복귀 즉시 조회. 마지막 성공 후 30초가 지나면 오래된 배너를 숨긴다. 종료 시각은 서버 시각+수신 후 경과시간으로 판단한다.

## 요청·응답

모든 API는 기존 Access JWT Bearer 인증, `Cache-Control: no-store`.

| 메서드 | 경로 | 권한 / 결과 |
| --- | --- | --- |
| GET | `/api/v1/announcements` | 회원 / 게시 중인 공지의 본문만 |
| GET | `/api/v1/admin/operations/announcements` | 운영 관리자 / 삭제되지 않은 전체 목록 |
| POST | `/api/v1/admin/operations/announcements/{id}` | 운영 관리자 / 생성, 같은 UUID·내용 재시도 중복 방지 |
| PUT | 위 경로 | 운영 관리자 / `expectedVersion` 일치 시 수정 |
| DELETE | 위 경로 + `?version=0` | 운영 관리자 / 버전 검사 후 삭제 표시, 204 |

생성 UUID는 브라우저에서 생성해 응답 유실 재시도에도 유지한다. 생성 후 변경/삭제된 ID를 새 공지로 재사용하면 409. 삭제는 DB 행을 즉시 제거하지 않는 soft delete다.

생성·수정 공통 JSON:

```json
{
  "title": "행사 안내",
  "text": "오늘도 즐거운 온탑 공원!",
  "published": true,
  "displayOrder": 1,
  "startsAt": null,
  "endsAt": null,
  "expectedVersion": 0
}
```

제목 1~80자, 본문 1~1000자, 순서 0~9999. 일반 텍스트이며 HTML을 실행하지 않는다. 시작/종료는 선택 사항, 둘 다 지정하면 종료가 더 늦어야 한다. 편집 응답은 `id, title, text, published, displayOrder, startsAt, endsAt, version, updatedAt`.

회원 조회 예시:

```json
{
  "serverTime": "2026-11-04T03:00:00Z",
  "refreshAt": "2026-11-04T03:00:10Z",
  "announcements": [
    {
      "id": "a78baf0b-0246-4391-adef-a247f90ac50a",
      "text": "오늘도 즐거운 온탑 공원!",
      "endsAt": null,
      "version": 0
    }
  ]
}
```

400 `ANNOUNCEMENT_INVALID`: 본문/기간 오류. 409 `ANNOUNCEMENT_CONFLICT`: 버전 충돌 또는 UUID 충돌. 401 미인증, 403 권한 없음. 저장소 비활성 또는 DB 조회 실패는 503. DB 내부 오류 상세는 공개하지 않는다. 실패 시 입력은 남기고, 409는 목록을 다시 읽은 뒤 수정한다. JPA `@Version`이 실제 동시 수정 충돌을 검사한다.

## 저장·적용 경계

V148은 신규 `announcements` 테이블만 추가한다. 기존 테이블·인증·정산·점검 모드는 변경하지 않는다. `local/dev + db` 및 기존 PRODUCT_FEATURE_WITH_DB 조건에서 저장 서비스가 등록된다. 로컬 테스트 대역 검증은 실제 MySQL 저장·JPA 동시성 검증을 대신하지 않는다.

공유 전 전달 문구: “공지 관리용 V148(announcements 신규 테이블)을 로컬에 작성했습니다. 기존 테이블/데이터 변경은 없습니다. 사용 번호·적용 순서 확인 전 푸시·병합·공용 DB 적용은 보류하겠습니다.”
