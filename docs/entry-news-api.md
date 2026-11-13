# 접속 안내 이미지 팝업

## DB 없이 화면 확인

`frontend`에서 `pnpm dev:entry-news`를 실행한 뒤 `http://127.0.0.1:5274/entry-news-preview.html`을 연다. 실제 `NotificationCenter`와 `EntryNewsPopup`을 사용하며 알림 아래 이벤트/공지 버튼, 오늘 숨김 후 수동 재열기, Esc 닫기를 확인할 수 있다. 명시적인 로컬 미리보기 설정에서만 목록 API를 샘플 응답으로 교체한다. 인증·DB·S3·외부 API 검증을 대신하지 않으며 일반 서비스 빌드에는 이 설정을 적용하지 않는다.

회원이 공원에 연결되면 현재 게시 중인 이미지를 순서대로 보여준다. 기존 상단 텍스트 공지와 별도이며 관리자 **공지 관리 → 접속 안내 팝업**에서 관리한다.

- 이미지: 정확히 **1200×675px**, PNG/JPEG, 최대 2MiB. 1200×675 픽셀 규격은 관리자 화면에서 검사한다. 서버는 이미지 본문을 다운로드·디코딩·변환하지 않고 S3 HEAD로 크기·Content-Type·SHA-256 체크섬을 확인한다. 픽셀 크기나 실제 파일 포맷까지 서버가 검증하는 계약은 아니다. SVG/GIF/외부 URL은 받지 않는다.
- 제목 1~80자(이미지 대체 텍스트), 게시 여부, 선택 시작/종료 시각, 표시 순서. 최대 20장(삭제 제외). 삭제는 소프트 삭제다.
- 서버 UTC 시각으로 시작 포함/종료 제외 판정. 운영 관리자만 생성·수정·삭제·재정렬·숨김 이미지 조회 가능. 회원은 게시 중 이미지만 조회한다.
- 프로필의 알림 버튼 바로 아래 **이벤트/공지**로 닫은 안내를 다시 연다. 수동 열기는 최신 게시 목록을 다시 조회하며 ‘오늘 보지 않기’가 있어도 가능하다. 수동으로 열어도 자동 숨김 설정은 지우지 않는다. 빈 목록·조회 실패에는 안내/재시도/닫기를 제공하고 닫기/Esc 후 버튼으로 포커스를 돌린다. 게임·미니게임 중에는 이 버튼도 숨긴다.
- 페이지는 수동 넘김, 자동 넘김 없음. 닫기/X/Esc 모두 가능하다. 체크 후 닫으면 같은 브라우저·회원에서 **한국 시간 자정**까지 전체 팝업을 숨긴다. 브라우저 저장소를 사용할 수 없어도 닫기는 가능하다.
- 정상 게임/미니게임 중에는 안내를 보류한다. 이미 열린 다른 dialog가 닫힌 뒤 표시하며 입력·마우스 잠금을 정리한다. 팝업 조회 실패는 공원 입장을 막지 않는다. 서버 시간에 따라 게시가 종료된 페이지는 제거한다.
- 목록·관리 API는 기존 Access JWT를 사용하고 `Cache-Control: no-store`다. 목록의 imageUrl은 서버 설정으로 만든 CloudFront HTTPS 주소이며 `<img>`에서 직접 표시한다. 공개 홍보 이미지이므로 CDN은 1년 immutable 캐시를 사용한다. 숨김·만료·삭제는 신규 목록 노출을 중단하며 이미 배포된 CDN 주소를 회수하지 않는다. 비공개·개인정보 보관 기능으로 사용하지 않는다. 이전 로컬 이미지의 호환 경로만 인증된 PNG API/Blob을 사용하고 Blob URL을 해제한다.

| 메서드 | 경로 | 내용 |
| --- | --- | --- |
| GET | `/api/v1/entry-news` | `{serverTime,pages:[...]}` 현재 게시 목록 |
| GET | `/api/v1/entry-news/{id}/image` | 게시 중 PNG/JPEG 바이트 |
| GET | `/api/v1/admin/operations/entry-news` | 숨김·종료 포함 목록 |
| GET | `/api/v1/admin/operations/entry-news/{id}/image` | 관리자 이미지 미리보기 |
| POST | `/api/v1/admin/operations/entry-news/{id}/uploads` | 크기·해시·타입으로 5분 유효 S3 PUT 주소 발급 |
| POST | `/api/v1/admin/operations/entry-news/{id}` | 업로드 검증 후 JSON 등록·동일 생성 재확인 |
| PUT | `/api/v1/admin/operations/entry-news/{id}` | JSON 수정(upload=null이면 이미지 유지) |
| DELETE | `/api/v1/admin/operations/entry-news/{id}?version=0` | 버전 확인 후 삭제 |
| PUT | `/api/v1/admin/operations/entry-news/order` | 기존 공지 순서 DTO `{items:[{id,expectedVersion}]}` 전체 일괄 저장 |

이미지 등록은 다음 순서로 진행한다.

1. 클라이언트가 UUID와 파일 SHA-256을 만든 뒤 `/uploads`에 `{bytes,sha256,contentType}` JSON을 보낸다. 12바이트~2MiB, PNG/JPEG만 허용하며 운영 관리자 권한이 필요하다.
2. 응답 `{uploadId,url,headers,expiresIn:300}`의 HTTPS 주소로 브라우저가 파일을 직접 PUT한다. 응답 headers를 그대로 사용하고 Access JWT·쿠키는 보내지 않는다. 크기·타입·SHA-256을 서명하며 5분 후 주소가 만료된다. 실패하면 게시를 확정하지 않고 입력을 유지한다.
3. POST/PUT으로 `{draft:{title,published,displayOrder,startsAt,endsAt,expectedVersion},upload:{uploadId,bytes,sha256,contentType}}` JSON을 보낸다. POST upload 필수, PUT upload=null은 기존 이미지 유지. 서버는 현재 관리자·안내 UUID와 uploadId·체크섬으로 객체 키를 직접 구성해 HEAD(checksumMode=ENABLED)로 실제 크기·Content-Type·S3 SHA-256 체크섬을 확인한다. 임의 S3 키·외부 URL을 받지 않는다.
4. 검증한 원본 객체 키를 그대로 DB에 확정한다. 백엔드의 GetObject/PutObject/복사·재인코딩을 하지 않는다. PUT 서명은 파일 SHA-256·길이·타입·캐시 정책을 고정하므로 유효기간 중 URL이 재사용돼도 다른 내용으로 바꿀 수 없다. 객체는 관리자용 공개 홍보 이미지이며 업로드 직후부터 CDN 주소를 알면 접근 가능하다. 미게시·기밀 이미지 저장소가 아니다.

startsAt/endsAt은 ISO 시각 또는 null이다. 수정 버전은 마지막 목록의 version을 보낸다. 생성 응답 유실에는 같은 UUID·같은 내용·같은 이미지로 재시도한다. 생성 뒤 이미 수정된 UUID 재사용은 409다.

목록 항목은 `{id,title,published,displayOrder,startsAt,endsAt,version,updatedAt,imageHash,imageUrl}`다. 목록은 이미지 BLOB를 조회하지 않는 DTO projection을 사용하며 이미지는 별도 요청한다. 이미지 원본·서명 URL·JWT는 로그에 남기지 않는다.

오류: 400 `ANNOUNCEMENT_INVALID`(규격·기간·입력), 401 인증, 403 운영 권한, 404 삭제/숨김/만료 이미지, 409 `ANNOUNCEMENT_CONFLICT`(버전·순서 충돌), 503 저장소 미준비. 오류 시 입력은 유지하고 관리자는 목록 재조회 후 재시도한다. 공원 사용자는 오류 안내에서 재시도하거나 바로 닫을 수 있다.

## 저장·검증 범위

후보 V168은 새 `entry_news` 테이블을 추가하고 V169은 image_key를 추가한다. 이전 로컬 V167·V168 원문은 test resources/db/entry-news-legacy에 보존했다. 기존 DB의 이력/자료는 변경하지 않고 새 DB에 새 번호를 적용한다. V167은 팀원 사용으로 확정됐으나 실제 SQL은 아직 dev에 없다. 기존 announcements·회원·보유 데이터는 수정하지 않는다. 사용자가 V168·V169 로컬 새 번호 구성·새 DB 검증을 승인했다. 푸시/MR은 별도 요청 범위이며 팀 V167 원문 반영 후 전체 순서 재검증이 필요하다. 새 이미지는 S3 파일 키·해시·메타데이터만 DB에 저장하고 이전 image 컬럼은 빈 값으로 둔다. 이전 로컬 검증 이미지 데이터는 보존한다. ENTRY_NEWS_ASSET_BUCKET/REGION/CDN_BASE_URL이 있으면 사용하고 없으면 기존 SKIN_ASSET_BUCKET/REGION/CDN_BASE_URL을 재사용한다. 실행 환경별 `entry-news/{local|dev|prod}/published/{adminId}/{newsId}/{uploadId}/{sha}.{png|jpg}`에 서버 역할의 PutObject/GetObject(HEAD 포함) 권한이 필요하다. S3 CORS는 허용 FE origin의 PUT 및 Content-Type·Cache-Control·x-amz-checksum-sha256 등 반환된 서명 헤더를 허용해야 한다. CloudFront/OAC는 published 및 기존 공개 경로를 읽을 수 있어야 한다. SSE-KMS 사용 시 체크섬 HEAD에 필요한 KMS 권한도 확인한다. 미참조 업로드를 포함하므로 published 전체를 단순 기간 삭제하지 말고 DB 참조 대조를 포함한 정리 정책을 별도 합의한다. 실제 AWS 자격·권한·CDN 배포 검수는 로컬 대역 검사와 별도다. 업로드 후 DB 충돌로 참조되지 않는 불변 객체는 자동 삭제하지 않으며 후속 보관 정리가 필요하다.

이번 직접 업로드 전환은 기존 image_key를 재사용하며 추가 마이그레이션은 없다.

`EntryNewsDirectUploadTests`는 실제 SDK 서명을 테스트 자격증명으로 생성하고 S3 클라이언트 대역으로 관리자별 경로·실제 크기·타입·체크섬 위반/누락과 HEAD 외 본문 전송 호출이 없는 것을 검사한다. 실제 AWS 호출은 하지 않는다. `EntryNewsMySqlTests`는 별도 loopback DB와 Flyway 전체 적용·Hibernate validate·파일키 왕복·버전 충돌·순서를 검증한다. `entry-news.spec.ts`는 HTTP/RawWS 대역으로 관리자 파일 등록부터 공원 팝업/오늘 숨김까지 검증한다. 브라우저 대역 검증과 실제 운영 로그인/배포 검수는 구분한다.
