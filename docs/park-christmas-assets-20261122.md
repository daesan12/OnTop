# 크리스마스 에셋 교체 · 2026-11-22

사용자가 승인한 기존 에셋 교체, 트리 12m, 모델에 맞는 충돌체와 생성 맵 갱신을 반영했다. 작업 기준은 fetch로 확인한 `origin/dev@3c8240eaf92a493edfea3e69e2aae665c8e32896`, 작업 브랜치는 `feat/christmas-tripo-assets`다. 기존 미커밋 작업을 보존하고 최신 dev에서 별도 worktree를 만들었다. 최신 dev가 이미 포함돼 있어 통합 충돌이나 추가 merge commit은 없다.

## 배치와 외관

| 대상 | 유지한 x, z | 적용 내용 |
| --- | --- | --- |
| 중앙 트리 | 0, 38 | 높이 12m, 자연스러운 전나무, 입체 은색 와이어 별과 줄조명 |
| 산타 | 4, 42 | 높이 2.8m, 징글벨과 선물보따리 |
| 눈사람 | -5, 98 / 0, 48 / 47, 33 | 기존 세 위치에서 높이 3.1m 모델 재사용 |
| 썰매 | 6, 86 | 기존 승강장에 붉은색·금색 썰매 적용 |
| 루돌프 6마리 | 기존 3쌍 편대 | 가슴 하네스·몸통 무늬, 독립 스켈레톤과 0.8초 제자리 달리기 |

별과 줄조명은 발광을 끈 상태로 시작한다. 메모 집계, 장식 증가, 점등 트리거는 후속 기능이다. 선물 장식, 산타 종소리, 적설·눈 줍기 배치는 유지한다. 썰매 이용·하차 위치(2, 86), 40초 항로의 401개 표본, 카메라·탑승 계약은 변경하지 않았다. 고삐는 실제 썰매 연결 고리와 움직이는 하네스 표면에 이어지며 부드러운 곡선으로 처짐을 준다.

## 원본과 재현

`frontend/src/features/winter/assets/manifest.json`에 원본 상대 경로, Tripo 작업 ID, 원본/적용 파일 SHA-256, 크기와 이용 근거를 기록했다. 새 Tripo 작업과 추가 크레딧 사용은 없다. API 출력 이용 근거는 [Tripo API Terms 3.2](https://developers.tripo3d.ai/en/terms)다. 트리의 로컬 제작 형상은 레퍼런스 사진을 텍스처로 복사하지 않았다.

Blender 5.2에서 아래 순서로 별도 패키지를 만든 뒤 검증·편입했다. `game-dev` CLI가 설치되어 있지 않아 전용 CLI의 canonical validation을 수행했다고 표시하지 않는다. 이 작업의 로컬 검증 스크립트를 사용했다.

```text
blender -b --python frontend/scripts/prepare-christmas-assets.py -- SOURCE_ROOT OUTPUT_PACKAGE
node frontend/scripts/christmas-assets.mjs verify OUTPUT_PACKAGE
node frontend/scripts/christmas-assets.mjs admit OUTPUT_PACKAGE frontend/src/features/winter/assets
```

원본 GLB를 보존하며 단위·방향·지면 기준을 정규화했다. 트리의 솔잎 형상만 단순화하고 별과 줄조명은 유지했다(231,099 → 142,650 triangles). Meshopt 압축과 내장 텍스처를 사용하며, 적용 GLB 5종 합계는 15,926,212 bytes다. 여섯 루돌프는 형상을 공유하고 각자의 뼈와 애니메이션 상태를 갖는다. 기존 외관은 비동기 로딩 중/실패 시 fallback으로 남는다.

## 충돌과 맵

트리·산타·눈사람의 실제 정규화 메시에서 도출한 볼록체를 `collision.json`에 저장하고 FE/서버 생성 맵이 같은 형상을 사용한다. 단독 보행 프리뷰는 보수적인 2D 외곽 범위를 사용한다. 썰매·루돌프의 기존 탑승·비행 계약은 유지한다.

`frontend`에서 `node scripts/generate-renewal-park.mjs`로 리뉴얼 맵을 갱신했다.

- 이전 버전: `bb13a432887f01ad46677d03810be2931b26c4c2df25b2b2130253615f833742`
- 새 버전: `bd538ed2f24200e68f52b47d41e4dc1dc36352f98e5826e6dcdaf96352371c0f`
- 기존 겨울 장식의 원통형 충돌체 5개를 새 볼록체 5개로 교체했다. 이 항목을 제외한 생성 맵 `data` 전체는 기준 dev와 동일하다. 승강장·항로·테이블·시설·지형·눈 더미도 동일하다.
- 변경 산출물은 `frontend/generated/park-renewal/server-map.json`과 `manifest.json`이다. 기존 바인딩은 유지한다. BE 코드·DB/Flyway·인프라 설정 변경은 없다.

## 검증과 남은 범위

- FE 앱 TypeScript 검사, 관련 단위 8파일 53건, 리뉴얼 활성화 프로덕션 빌드 통과.
- BE 맵 로더/조립·겨울 관련 36건과 실제 새 맵 handoff/네이티브 물리 장면의 기존 눈 줍기 검사 2건 통과(총 38건).
- Chrome 1600×1050의 공원 프리뷰에서 실제 GLB 12개 인스턴스(트리 1, 산타 1, 눈사람 3, 썰매 1, 루돌프 6), 12m 트리, 기본 소등, 독립 스켈레톤 6개와 공유 형상 5그룹을 확인했다. 렌더링 오류와 모델 로딩 실패 경고는 없었다.
- 프리뷰의 테스트용 시설 점유 상태로 기존 항로 비행과 6마리의 실제 뼈 애니메이션 변화를 확인했다. 실제 WS 서버의 탑승·동시 접속·운영 DB/OAuth와 VR 헤드셋 검수는 별도 미확인이다.
- 원시 브라우저 기록·스크린샷은 저장소 밖 `christmas-assets-integration-qa-20261122`에 보관했다. 검증용 브라우저와 FE 5439 서버는 종료했고 잔여 프로세스/리스너가 0임을 확인했다. 다른 실행은 보존했다.
- 맵 전수 탐색·자전거·킥보드 주행 테스트는 추가하거나 실행하지 않았다. 기존 Three deprecation/CJS·청크 크기·Java 경고는 남는다.
- Jenkins 조회는 HTTP 403으로 확인 불가다. 기능 브랜치의 로컬 검증을 원격 빌드·배포 성공으로 표시하지 않는다. MR·머지·배포·브랜치 삭제는 보류한다.

## 향후 배포 인계

현재 요청에 따라 인프라는 수정·적용하지 않았다. 향후 MR·배포가 승인되면 인프라 담당자가 dev의 기존 생성 맵 배포 절차로 위 두 JSON을 같은 디렉터리에 함께 반영하고 앱이 새 맵 버전을 읽는지 확인해야 한다. 기존 `infra/app/compose.generated-map.yaml`의 읽기 전용 마운트와 `WORLD_MAP_REQUIRE_MATCH=true`를 유지하며 FE도 같은 버전으로 게시한다. 배포 후 맵 ID `park`, schema 2, 새 버전 일치와 기존 썰매 탑승·복귀를 확인한다. 현재 서버의 실제 마운트·적용 버전은 확인 필요이며, 이 문서는 인프라 적용 승인이 아니다.
