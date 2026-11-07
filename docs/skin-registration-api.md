# 스킨 관리자 등록 API

2026-11-07, Jira S15P31B105-371. 모델링 담당자가 상품과 파일을 등록하고 검수 후 공개하는 흐름이다. 실제 AWS 리소스 생성·업로드·개발 서버 적용은 후속 인수이며 로컬 테스트 대역의 성공과 구분한다.

## 활성화와 권한

- V161은 `skin_catalog`(상품·상태·버전·작성자)와 `skin_uploads`(크기·해시·경로·검증/공개 이력) 두 테이블만 추가한다. V157→V158→V159→V160 다음 순서다. 기존 SQL·지갑·보유품은 변경하지 않는다. 팀 공유/최종 번호 순서 확인 전 푸시·공용 DB 적용을 보류한다.
- `db/migration,db/minigame,db/shop` 전체 스키마와 `SHOP_ENABLED=true`, `SKIN_REGISTRATION_ENABLED=true`가 필요하다. 지원 프로필은 기존 제품 프로필(local/dev 또는 prod/production+db)을 따른다.
- 관리자 API는 기존 `ADMIN_OPERATION_IDS` 권한과 별도 `SKIN_ADMIN_USER_IDS` 모두 필요하다. 관리자 화면 진입에는 기존 `ADMIN_READ_IDS`도 필요하다. 인증 구현과 전역 관리자 정책은 수정하지 않는다. 별도 스킨 ID를 지정하지 않으면 등록 권한은 없다.
- 공원 파일 목록도 인증된 활성 회원만 조회한다. JWT·Origin·CORS·회원 탈퇴 검사는 기존 REST 경계를 사용한다. 응답은 `Cache-Control: no-store`다.
- AWS 미설정에서도 DB가 연결돼 있으면 임시저장·조회가 된다. 업로드/공개는 503이며 가짜 성공이나 메모리 보관으로 대체하지 않는다.

```dotenv
SKIN_REGISTRATION_ENABLED=false
SKIN_ADMIN_USER_IDS=
SKIN_ASSET_BUCKET=
SKIN_ASSET_REGION=ap-northeast-2
SKIN_ASSET_CDN_BASE_URL=
SKIN_UPLOAD_URL_TTL_SECONDS=300
SKIN_UPLOAD_MAX_MODEL_BYTES=20971520
SKIN_UPLOAD_MAX_IMAGE_BYTES=2097152
```

파일 경로의 환경은 실행 프로필에서 local/dev/prod로 결정한다. 선택적인 `SKIN_ASSET_ENVIRONMENT`가 실행 환경과 다르면 기동을 거절한다. AWS 자격 증명은 SDK 기본 제공 체인을 사용하며 소스·브라우저·DB에 키를 저장하지 않는다.

## 파일·상품 규격

- GLB 2.0 최대20MiB, 정지 WebP 최대2MiB/가로·세로4096px. 이미지·버퍼는 GLB 안에 포함하고 외부 URI는 금지한다. 지원 필수 확장은 현재 로더의 `EXT_meshopt_compression`, `EXT_texture_webp`다. 압축 해제 후 선언 버퍼 합계는128MiB 이하로 제한한다.
- 현재 캐릭터와 같은49개 관절 이름을 사용한다. WHOLE은 5부위와 MALE/FEMALE 전용이며 CharacterRig의 variant와 near-/far- LOD, 실제 primitive 표면 수2/10이 맞아야 한다. PARTS는 선택 부위별 `extras.pieces`의 `item__<SLOT>__a` 조각 계약을 사용한다. 옷은 TOP/BOTTOM/SHOES를 모두 포함한다.
- 등록 화면은 기존 공원과 같은 `createCharacterRig`로 미리보기를 만들며 모델/대표 이미지가 로드되기 전 공개 버튼을 열지 않는다. 서버의 구조 검사와 담당자의 외형·크기·착용 검수는 별개다. 일반 GLB를 자동으로 리깅하거나 모든 glTF 기능을 지원하는 기능이 아니다.
- 공용 PARTS는 남녀 양쪽에서 선택 부위를 표시할 조각을 요구한다. 화면도 양쪽 기본 캐릭터와 실제 리그를 생성하고 빈 조각은 거절한다. WHOLE과 PARTS의 시각·애니메이션 적합성은 실제 모델별 인수로 확인한다.
- 상품 코드는 대문자/숫자/밑줄3~28자, 첫 글자 대문자다. 서버 `grade`1/2/3/4는 화면 S/A/B/C에 대응한다. 의상 상품 가치1000/500/250/100과 중복50%·기계 확률·뽑기권 가격은 기존 규칙 그대로다.
- 첫 공개 뒤 상품 코드·등급·성별·부위·착용 방식은 바꾸지 못한다. 다른 구성이 필요하면 새 상품으로 등록한다. 이름·새 파일 버전은 같은 상품으로 변경 가능하다.

## 요청 흐름

관리자 화면은 `/admin/skins`다. 관리자 API 접두사는 `/api/v1/admin/operations/skins`다.

| 메서드·경로 | 동작 |
| --- | --- |
| GET /settings | 권한과 storageReady·파일 제한 |
| GET / | 최근 등록200건 |
| POST / | 상품 임시저장 |
| GET /{id} | 등록 상태·버전 재조회 |
| PUT /{id} | version을 확인하고 상품 수정 |
| POST /{id}/uploads | 두 파일의 길이/SHA-256으로5분 PUT URL 발급 |
| POST /{id}/uploads/{uploadId}/verify | 실제 파일 읽기·해시/구조/뼈대 검증·불변 경로 보관 |
| POST /{id}/publish | version/uploadId/reviewed 확인 후 상품·아이템 원자 연결 |
| POST /{id}/disable | 신규 획득 중단, 기존 보유·장착 유지 |
| GET /api/v1/skins/assets | 실제 공개했던 파일 목록, 미공개 업로드 제외 |

임시저장 예시:

```json
{"productCode":"CHERRY_HANBOK","name":"봄꽃 한복","grade":2,"compatibility":"FEMALE","wearMode":"WHOLE","slots":["HAIR","FACE","TOP","BOTTOM","SHOES"]}
```

응답은 `{id, definition, state:"DRAFT", version:0, publishedUploadId:null, updatedAt}`다. 수정은 `{version:0, definition:{...}}`이고 상품 코드 자체는 바꾸지 못한다.

업로드 요청은 `{version, model:{name,bytes,sha256}, image:{name,bytes,sha256}}`다. `sha256`은 실제 파일의 소문자64자리16진수다. 경로·버킷·URL은 클라이언트가 지정할 수 없다. 응답의 `{uploadId,expiresAt,model:{url,headers},image:{url,headers}}`를 사용해 브라우저가 S3에 직접 PUT한다. 이 PUT에는 회원 Authorization/쿠키를 전달하지 않는다.

임시 파일은 `skins/<환경>/<상품UUID>/<업로드UUID>/incoming/`이고, 검증한 바이트만 같은 버전의 `published/`에 조건부 생성한다. 아직 유효한 PUT URL로 임시 파일을 바꿔도 이미 봉인된 공개 파일은 변하지 않는다. S3 왕복·해시·GLB 파싱은 DB 트랜잭션 밖에서 수행하고, 완료 시 상품 행을 잠가 버전을 재검사한다. 실패 시 공개 상태로 넘어가지 않는다. 검증 응답의 `modelUrl/imageUrl`은 CDN 미리보기 주소이며 서명 PUT URL을 공개 목록에 저장하지 않는다.

공개는 `{"version":0,"uploadId":"<UUID>","reviewed":true}`다. 공개 전 파일 검증이 필요하며 같은 파일의 공개 재요청은 이미 확정한 상태를 반환한다. 동시에 공개해도 상품 하나·부위당 아이템 하나만 생성한다. 기존 상품 코드 충돌은409로 롤백하며 기존 다른 상품을 변경하지 않는다. 상품→아이템 순으로 잠그고 지갑·원장·보유품을 변경하지 않는다. 내부 아이템은 판매가0/판매 비활성으로 생성하고 기존 뽑기 상품 가치로 평가한다. 통합/다부위는 기존 set_code로 함께 입고 벗는다.

비활성은 `{"version":1}`이다. 이미 공개했던 버전의 파일·기존 보유·과거 결과를 유지하고 새 캡슐 개봉 대상에서만 제외한다. 상품과 충돌하는 미공개 초안을 비활성화해도 기존 다른 상품에는 영향을 주지 않는다.

공개 이력이 있는 상품은 ‘등록한 파일 불러오기’로 기존 파일을 다시 검수할 수 있다. 비활성 상품도 현재 version과 동일한 확정 uploadId로 직접 재공개할 수 있으며 새 파일 업로드를 강제하지 않는다.

## 공원 반영·재시도

공원은 접속/재접속과60초마다 공개 파일 목록을 조회하고, 옷장·공개 장비 imageKey인 `catalog/<업로드UUID>`를 버전별 CDN 경로와 연결한다. 등록한 상품의 새 파일은 새 URL을 사용하며 기존 정적 스킨도 유지한다. 한 의상의 파일/리그 오류는 기본 캐릭터로 격리한다. 기존 외형 기능 플래그가 꺼진 환경을 강제로 열지 않는다.

입력/파일 검증 오류400, 인증401, 권한403, 등록/업로드 없음404, 버전/상품 코드 충돌·미검증409, 저장소/DB 설정 또는 일시 오류503이다. 409는 목록을 다시 조회한 뒤 직접 선택/수정하며 자동 덮어쓰기하지 않는다. 파일 업로드 실패 시 기존 uploadId로 검증 결과를 재확인하거나 파일을 새 버전으로 다시 업로드한다. 새로고침 후 등록 정보는 DB에서 유지되지만 브라우저 파일 선택·미완료 검수 화면은 다시 진행해야 한다. 업로드는 재화 소비가 없다.

## AWS 연결 후 인수

스킨 전용 비공개 버킷·CloudFront OAC와 CORS가 필요하다. 브라우저에는 incoming PUT만 서명하고 CloudFront는 published 파일만 읽도록 구성한다. 서버에는 incoming/published 읽기와 published 쓰기·업로드 서명용 권한이 필요하다. 미공개/실패 업로드 정리 정책은 AWS 운영 설정에서 별도로 확정한다. 이 구현은 버킷·IAM·CDN·공용 DB를 생성하거나 기존 Vercel 파일을 이전하지 않는다.

로컬 검증은 실제 Spring 인증 HTTP·격리 MySQL과 S3 메모리 대역을 조합한다. 브라우저는 실제 관리자/캐릭터 리그 컴포넌트와 저장된 기존 모델을 사용하고 인증·HTTP·S3/CDN 응답은 대역이다. 실제 AWS 서명 PUT/CORS/OAC·실제 새 모델의 두 계정 착용 전파·개발/운영 배포 인수는 아직 미실행이다.

## 로컬 검증 결과 · 2026-11-07

- 새 loopback MySQL에 기존 V157→158→159→160→161 성공. 실제 인증 HTTP·동시 공개·멱등 공개·기존 상품 보호·구조/버전 실패·봉인 파일·AWS 부재·실제 GachaService 개봉→ShopService 5부위 장착을 포함한8개 검사 통과. S3 저장만 대역이다.
- Java 전체3499개 중27기존스킵, 신규 API를 빠뜨린 접근정책 매핑 목록1개 실패를 확인해 목록을 보완했다. 이후 접근정책·OpenAPI·스킨 규칙71개 재검사와 bootJar를 통과했다. 전체3499개를 수정 후 다시 실행했다고 주장하지 않는다. 마지막 규칙 보완은 관련 재검사에 포함한다.
- FE 전체2702개 통과·8기존스킵. 마지막 공용 리그 미리보기 보완 후 테스트 포함 TypeScript·관련11개·최종6개 브라우저·park-integration 제품 빌드 통과. 생성 맵 변경0. 브라우저는 기존 검수용 모델/대표 이미지로 실제 컴포넌트를 렌더링하며 신규 모델 인수가 아니다.
- 초기 Windows 테스트 JVM 명령 길이206 오류는 동일 runtime 파일을 manifest Class-Path JAR로 전달해 해소했다. 단순 jar 경로로 자식 JVM 진입점 dry-run도 확인했다. 테스트 대역이나 로컬 검수 파일을 제품 JAR에 추가하지 않았다.
- 초기 FE 맵 생성 검사의 sandbox 임시파일 rename EPERM은 파일 권한 재실행에서 해소했다. 새 테스트의 원장 정리 컬럼·브라우저 선택상자 접근성 이름·브라우저 bare import를 수정해 재검증했다. 제품 실패/환경 실패/검수 코드 오류를 구분한다.
- 독립 BE/FE 정적 리뷰에서 찾은 초안의 기존 상품 비활성화·잘린 BIN·리그 오류 전파·잘못된 상품 이미지·공용 의상 누락을 보완했다. 최종 검토 새P1/P2 없음. 성능/등록 시간/비용 개선율은 미측정이다.
- 실제 OpenAPI YAML과 Postman10요청 컬렉션 파일을 생성·대조했다. 팀 Notion 연결은404로 저장 미완료이며 Postman 웹 저장/실행도 이번 검증으로 주장하지 않는다. Jira371은 실제 AWS·모델 인수가 남아 진행 중으로 유지한다.
