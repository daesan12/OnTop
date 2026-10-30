# FE !214 · BE !221 실제 맵 전환 요청

BE !221은 dev `d803cbe0`에 포함돼 있다. FE !214는 인프라가 dev 머지본을 필요로 해 사용자 승인으로 선행 머지한다. FE 자동 배포가 BE 맵 데이터 전환보다 빠르면 개발 서버 입장이 일시 차단될 수 있다는 점을 사용자가 확인했다. 실제 서버 전환·공동 검수는 코드 머지와 별도로 진행한다.

## 반드시 같은 세트로 사용할 데이터

- FE MR: https://lab.ssafy.com/s15-final/S15P31B105/-/merge_requests/214
- BE MR: https://lab.ssafy.com/s15-final/S15P31B105/-/merge_requests/221
- 소스: 위 두 MR이 포함된 dev의 확정 머지 커밋. MR 페이지의 실제 머지 SHA를 기준으로 고정한다.
- mapId/schemaVersion: `park` / `2`
- mapVersion: `04350122fdeee2b89212345ee4f776990d78832bb25435418b5ea6f2b2fbc769`
- 서버 JSON: `frontend/generated/park/server-map.json`
- JSON SHA-256: `0620716f518d499992e8c8cc7bc8dbf8c3d818216871d80bc6e0264ab92245a0`
- manifest: `frontend/generated/park/manifest.json`
- manifest SHA-256: `f6e6e8a06ff4e3357336f0b134230103160eac7bd24b15e9c51387315529e668`
- 기존 18개 테이블/시설/좌석 매핑을 유지한다. JSON·manifest를 수정하거나 다른 전달본과 섞지 않는다.

## 인프라 적용 요청

1. 현재 BE 이미지 digest, FE 배포 ID, 맵 JSON/manifest·매핑 및 배포 설정을 이전 동일 세트로 복구할 수 있게 보관한다. 민감 설정은 팀 채팅/문서에 복사하지 않는다.
2. `infra/app/PARK_MAP_ROLLOUT.md`와 BE의 `docs/integration/park-180/map-policy-20261030.md` 절차를 사용한다. BE !221 정책 코드가 포함된 이미지를 준비해야 하며 이전 정책 이미지에 JSON만 바꾸지 않는다.
3. 고정 JSON/manifest와 기존 매핑을 스테이징하고 서버의 실제 마운트/선택 경로가 해당 버전을 가리키도록 전환한다.
4. BE 재생성 후 health와 실제 로딩한 identity를 검사한다. FE는 같은 확정 커밋의 generated park 빌드(`build:park` → `dist-park/`)를 사용한다. 전달 JSON의 바이트와 mapVersion은 유지한다.
5. FE가 먼저 배포됐다면 일시 MAP_VERSION_MISMATCH 안내가 나타날 수 있다. 버전 검사를 끄지 말고 BE 실제 로딩 버전을 맞춘 뒤 재접속으로 검증한다.
6. 이동·가구/분수 충돌·팔각정 난간 점프, 시설 이용/퇴장, 기존 18개 테이블, 소리함·수영·스폰·전망대와 점프맵 회귀를 BE/FE와 함께 확인한다.
7. 실패하면 FE·BE·JSON·manifest·매핑·설정을 이전 동일 세트로 함께 복구한다.

## 완료 회신

배포한 dev 커밋, BE 이미지 digest, FE 배포 ID, 실제 로딩한 전체 mapVersion, 접속 주소/채널, 공동 검수 결과를 공유해 주세요. 현재 FE 검증은 단위검사 1,555개와 로컬 통신 fixture 기반 공원 브라우저 검사 12개이며 실제 배포 검수를 대신하지 않는다.
