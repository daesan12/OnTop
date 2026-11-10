# 새 공원 배포 후보 1차 검수 상태 — 2026-11-10

> 이 문서는 이전 단계 기록이다. 후속 조치와 최신 dev 통합 결과는 [MR 전 검수 기록](park-renewal-mr-readiness.md)을 따른다.

**설정과 변경 묶음은 검토 가능하지만 배포 승인은 보류한다.**
실제 Jenkins/Vercel 실행·커밋·푸시·MR·머지·dev DB/서비스 반영은 하지 않았다.
미커밋 변경을 포함하므로 최종 승인된 clean commit에서 FE·BE·맵 묶음을 다시 빌드해야 한다.

## 작업 기준과 불변 조건

- 재개 시 fetch한 origin/dev와 실제 작업 HEAD: `06d767394c7dd1f4cd43686186122bb2204c68c1`.
  이미 같은 기준이어서 새 통합/충돌 해결은 필요 없었다. 기존 미커밋 작업은 보존했다.
- 매핑 좌표/world 230개 전체, 공사중 E UI 시설 16개, 기존 테이블 ID와 미배치 비활성 ID 유지.
- V167 원본 SHA-256: `33680d3ed62f762862a31c9a19d388604f26e758f2868ae06a31f0df30dbe15a`.
- 좌표/world SHA-256: `2278a379d3a906ecafcb8c048b0beb5ce07204146aa92c12cd49ac5b5922e57b`.
- mapVersion: `9e95386a0df2d0da0a168c5430d53f02b3ce7a6e9962b34e60b5cea56be0c3af`.
- 공동 releaseId: `9f9d57bf2f38d4c9688db24df57566cfe3a2e3630259ae98f9b1938ed1cac22e`.
  이전 기록의 mapVersion과 달라진 것은 구 공원 handoff source fingerprint를 갱신한 결과다.
  새 공원 좌표/world 및 178개 점프 코스 발판은 변경하지 않았다.

## 완료한 검수

| 검사 | 결과/범위 |
| --- | --- |
| CI Python 전체 | 85개 실행, 실패 없음, Windows에서 POSIX 항목 18개 skip |
| 격리 Linux 배포 검사 | 30개 통과. network none, readonly repository, 가짜 Docker/Vercel 명령 |
| Jenkins 문법 | Groovy parse 통과. 실제 Jenkins 플러그인 실행은 미검수 |
| shell·Compose | Bash 문법, dev+renewal+coop+observe 병합과 읽기 전용 맵 마운트 확인 |
| FE release build | 생성 파일 없이 시작한 별도 소스 복사본에서 build/typecheck 통과. 기존 node_modules만 재사용 |
| FE 관련 집중 검사 | 새 공원 release/runtime/prediction/jump/handoff 25개, 계단/시설 mock 보완 후 83개 통과 |
| BE 패키징 | bootJar와 로컬 Docker 이미지 빌드 통과. QA 로그인/demo 및 로컬 전용 프로필 제외 확인 |
| 실제 로컬 BE | health UP, 소스/image label·프로필·읽기 전용 마운트·맵/코스 등 6개 파일 실제 내용 일치 |
| 소켓 회귀 재현 확인 | DevObservedWebSocketFlowTests 단독 로컬 재검사 통과. 계정/정산 저장소는 테스트 대역 |

새 공원 기능의 실제 로컬 FE·BE·DB 진입/종료/정산/복귀와 점프맵 250냥·중복 방지는 앞선 검수 기록을
근거로 한다. 이번 설정 작업에서 모든 게임을 다시 플레이했다고 표시하지 않는다.

## 배포를 막는 남은 검수

프론트 전체 실행은 350개 파일 중 331 통과·16 실패·3 skip,
테스트 2,975개 중 2,947 통과·20 실패·8 skip이었다. 이 최초 결과에는 두 mock import 오류도 포함된다.
이후 `parkStairs`·`luckyFacilities`의 누락된 새 맵 플래그 mock을 수정해 해당 83개를 재통과했고,
기존 jumpmap handoff도 자동 생성 순서를 보완한 뒤 집중 검사에서 통과했다.
**수정 이후 전체 350개를 재실행해 통과한 상태는 아니다.** 남은 실패를 숨기는 skip/allow-failure를 추가하지 않았다.

우선 검토할 항목:

1. **실제 표면/보행과 함께 확인할 항목**: 여섯 시설 입구 포장, 시설 footprint의 평탄화,
   다리·목재 진입로 높이, 수변 높이, 비밀 출구의 높이 변화 검사.
   비밀 출구 검사에서는 한 구간 높이 변화 0.27422m가 기존 한계 0.24m를 넘었다.
   수변 높이는 일부 지점 4.23081m로 검사 상한 4.21m를 넘었다. 실제 오류 여부를 검수하지 않고
   단순히 허용치를 늘려 통과시키지 않았다.
2. **현행 기획과 대조할 이전 배치 검사**: 제거/변경된 EDGES, 길 폭 6m 대 이전 기대 7m,
   기존 잔디/쉼터/보드·수목 위치, 낚시 데크 면적 147.06㎡ 대 이전 기대 140㎡ 미만,
   7~10단계 발판 수 `[14,16,18,28]` 대 이전 기대 `[14,10,14,18]`와 높이 기준.
   확정 좌표를 과거 테스트에 억지로 맞추지 않는다. 현재 기준을 확인하고 검사 또는 실제 지형을 수정한다.
3. **이전 맵/시간 제한 검사**: 180m generatedServiceMap의 jumpmap 접근 경로,
   전망대 목재 표면 검사 5초 timeout. 새 220m 경로 문제와 구분해 재현한다.
4. **보존 스냅샷**: parkVisualCheckpoint의 7개 공통/생성 파일 fingerprint가 통합 변경과 다르다.
   실제 좌표/world 불변 검사는 통과했다. 승인 변경을 대조한 뒤 스냅샷을 갱신해야 한다.

대표 실패 파일은 roundedLandscapeRevision, twentyDetailFinish, twoLevelParkRevision,
sixPhotoParkRevision, sevenDetailRevision, elevenPhotoFinish, entryLandscapingRevision,
latestParkRefinement, shoreAndRestoredArt, parkFinishingRideRevision, generatedServiceMap,
towerEntrySurface, parkVisualPreservation이다.

BE 전체 실행은 중단 때문에 최종 XML/합계가 완성되지 않았다. 실행 중 DevObservedWebSocketFlowTests
한 건이 실패했으나, 같은 소스 단독 재검사에서는 통과했다. 이를 전체 BE 통과로 표시하지 않는다.
최종 clean commit의 Linux CI에서 전체 FE·BE 검사를 완료해야 한다. 두 Jenkins 파이프라인은
전체 테스트 실패 시 publish/배포로 넘어가지 않도록 유지한다.

## 인프라 전달과 후속 순서

[공동 릴리스 절차](park-renewal-release.md)의 설정/설치/승인/전환 순서를 따른다.
남은 테스트 분류·수정 → 전체 FE/BE 재검수 → 최종 소스 커밋 확정/공동 재빌드 →
실제 V167 이력·예약/백업·입장 제한 확인 → 승인 후 BE → FE → dev smoke → 입장 재개 순서다.
이번 묶음에 포함된 source-changes는 HEAD 위에 적용할 검토용 overlay다. 확정 배포물로 직접 사용하지 않는다.
OAuth·실제 Vercel Build Output/배포·Jenkins 권한·서버 root 설치·40명 부하·VR 헤드셋은 별도 검수다.
