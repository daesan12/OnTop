# 썰매 시간 배분 변경의 맵 배포 계약

통합 MR !670에 포함한 기존 !665는 출발·도착의 시간 배분을 바꾸며, 같은 동선과 총 운행 시간 40초를 유지한다.
서버도 시간순 401개 경로 표본으로 탑승 위치를 계산하므로 서버 맵 재생성은 필수다.
프런트엔드 CSS만 배포하는 변경으로 취급하지 않는다.

- 기준 dev: `90389d8947057a0897b6462a86b282d0e5986392`.
- 이전 mapVersion: `bb13a432887f01ad46677d03810be2931b26c4c2df25b2b2130253615f833742`.
- 이번 mapVersion: `79683f52eb9c84fef46efc11021640114d7236742019270a48839c645e4c6ccd`.
- 생성: frontend에서 `node scripts/generate-renewal-park.mjs`.
- 산출물: `frontend/generated/park-renewal/server-map.json`, `manifest.json`, `park-bindings.json`.
  12m 트리·크리스마스 에셋·트리 편지와 함께 재생성한 버전이다. 구 !665의 단독 맵을 재사용하지 않는다.

## 읽기 전용으로 확인한 배포 경로

`frontend/scripts/renewalParkAssetsPlugin.ts`는 리뉴얼 활성화 `park-integration` 빌드에
리뉴얼 server-map과 bindings를 포함한다. Jenkins 및 `vercel.dev.json`의 `build:park`가 이 빌드 경로다.
`map:check`는 일반 `generated/park` 검증으로, 리뉴얼 맵 재생성 검증을 대신하지 않는다.

백엔드 Dockerfile은 frontend 산출물을 이미지에 복사하지 않는다.
`infra/app/compose.generated-map.yaml`은 외부 불변 맵 디렉터리를 `/run/ontop/maps`에 마운트하고
`WORLD_MAP_JSON_PATH`, `WORLD_MAP_MANIFEST_PATH`, `WORLD_MAP_REQUIRE_MATCH=true`를 지정한다.
`infra/ci/deploy-dev.sh`는 `/etc/ontop/dev-app/park-map.enabled`와 `PARK_MAP_HOST_DIR`를 확인한다.
현재 `infra/app/stage-generated-map.sh`는 **일반 `generated/park`** 를 읽으므로 리뉴얼 산출물과
혼용하지 않도록 담당자의 배포 경로 확인이 필요하다.

## 인프라 담당자에게 전달할 확인 사항

1. FE 빌드와 BE 마운트에 동일 커밋의 리뉴얼 산출물을 반영하고 서버의 manifest와 mapVersion을 대조한다.
2. 실제 서버의 맵 경로·배포 마커·불변 디렉터리가 이번 리뉴얼 버전을 가리키는지 확인한다.
3. `require-match=true`를 유지하고 새 클라이언트의 채널 입장·썰매 탑승·자동 도착을 확인한다.
   이전 버전 클라이언트는 맵 불일치로 입장이 거절되는지도 확인한다.
4. 롤백도 FE와 BE 맵 산출물을 같은 버전으로 맞춘다.

인프라 파일이나 서버 설정은 이 MR에서 수정·적용하지 않는다. 실제 배포 환경·Jenkins 실행과
운영 핸드셰이크 결과는 확인하지 못했으며, 담당자 확인 전 배포 동기화가 완료됐다고 보장하지 않는다.
