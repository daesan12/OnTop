# 새 공원 실제 로컬 통합 검수 — 2026-11-10

대상은 `park-detail-220-local-20261108`이다. 작업 시작 시 `git fetch origin dev`로 확인한 `origin/dev`와 HEAD는 모두 `2ecbf988b7c6af3c6c8482b4c0548fe55b58c928`이며 추가 통합 충돌은 없었다. 기존 미커밋 작업을 보존했다. 로컬 전용 작업으로 커밋·푸시·MR·머지·배포 및 Jenkins 실행은 하지 않았다.

## 실제 연결 환경

- 프론트: <http://127.0.0.1:5391/park>, `park-renewal-integration` 모드.
- 백엔드: `127.0.0.1:19186`, `local,db,park-renewal-local,renewal-integration-qa` 프로필.
- MySQL: 기존 컨테이너 `ontop-jumpmap-local-169`, MySQL 8.4.13, `127.0.0.1:13369`.
- 새 전용 DB: `ontop_renewal_live_20261110`, `ontop_jumpmap_test_integration_20261110`. 기존 DB는 보존했다.
- 검수 로그인: <http://127.0.0.1:19187>. 검수용 계정 101·202·303·404의 실제 인증 서비스가 JWT와 refresh cookie를 발급한다. 외부 OAuth 제공자 로그인은 검사 범위가 아니다.
- 브라우저 HTTP·WebSocket 응답을 가로채거나 대역으로 바꾸지 않았다. 보상·판돈·결과는 실제 DB 서비스가 처리했다.

백엔드는 `backend`에서 `./gradlew.bat renewalIntegration --offline --console=plain`으로 실행한다. `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `AUTH_JWT_SECRET_BASE64`, `RENEWAL_SESSION_FILE` 환경 변수가 필요하다. 실행기는 loopback의 `ontop_renewal_live_*` DB만 허용하며 검수 로그인 컨트롤러는 test 소스에 있어 운영 JAR에 포함되지 않는다. 인증 파일은 저장소 밖에 보관하며 공유하지 않는다.

프론트는 `frontend`에서 `PARK_RENEWAL_BACKEND_ORIGIN=http://127.0.0.1:19186` 환경 변수와 함께 `node node_modules/vite/bin/vite.js --config vite.renewal-integration.config.ts --mode park-renewal-integration --port 5391`로 실행한다. 기존 5389 전경 프리뷰와 5390 개발 프로세스는 종료하지 않았다.

## 수정한 실제 연결 문제

1. DB의 비동기 경기 복구가 끝나기 전 자동 채널 입장이 거절되는 경우, 복구 완료를 기다리고 같은 채널 입장을 한 번만 다시 요청한다. 연결 변경·복구 실패·시간 초과는 중단하며 입력 권한을 임의로 부여하지 않는다.
2. 실제 경기 중 반복하던 `WORLD_INTERACTION_SET` 요청이 로비 권한 검사에 거절되어 경기 입력까지 `PENDING`으로 바꾸던 문제를 수정했다. 착석·경기 중에는 이 요청을 생략하고, 착석 직전 요청의 늦은 오류는 해당 요청 처리기가 소유한다. VR 보호의 명시적 확인은 착석 중 승인하지 않는다.
3. 최초 출발 높이가 실제 충돌 바닥보다 낮아 첫 이동이 거절되던 문제를 수정했다. 새 맵에만 `spawn.groundAligned`를 사용해 플레이어 캡슐을 실제 바닥에 맞춘다. 기존 맵 기본 동작과 시설·테이블 좌표는 유지한다.
4. 로컬 프로필에서 실제 DB 경기 시작·정산 서비스를 켰다. start rehearsal은 사용하지 않는다.

## 확인 결과

| 검사 | 결과 |
| --- | --- |
| 광장 `table-14`, 오목 2인 | 브라우저 E 착석 → 준비·시작 → 실제 9수 `FIVE_IN_ROW` 종료 → DB 정산 → 결과 UI에서 일어나기 → 공원 이동 재개 통과. 최종 game ID 7. |
| 광장 `table-15`, 원카드 4인 | 네 좌석의 XYZ를 매핑과 대조 → 실제 경기 시작 → 세 참가자 기권으로 `PLAYER_LEFT` 종료 → DB 정산 → 공원 복귀·이동 재개 통과. 최종 game ID 8. 원카드 손패 소진에 의한 자연 종료는 이번 검사 범위가 아니다. |
| 실제 판돈 원장 | 두 경기 모두 `FINISHED/SETTLED`. 참가자별 예약 해제 완료, 모든 검수 지갑의 reserved balance 0. 경기별 정산 원장은 참가자당 한 건이며 중복 idempotency key 0. |
| 점프맵 실제 MySQL·HTTP·WS | 10단계 지급, 최종 오리·섬 판정, 재전송, 동시 중복 요청, 다른 사용자·잘못된 관문, 원장 실패 롤백·재시도, 두 바퀴 일일 상한, V169 순차 적용을 포함한 5개 통합 검사 통과. |
| 점프맵 원장 | 5·10·15·20·25·30·32·35·38·40냥으로 매 단계 증가. 한 바퀴 10건·합계 250냥, 검수 시작 잔액 100 → 350. 중복 요청 후에도 추가 지급 없음. |
| 공통 FE 회귀 | 복구·맵 입장·재접속 좌석·VR presence/protection 5개 파일, 38개 테스트 통과. `tsc --noEmit` 통과. |
| 실제 물리 회귀 | 40개 출발 슬롯의 접지·충돌 및 첫 이동, 외곽·코스 관련 native 회귀 5개 테스트 통과. |
| 좌표 보존 | 작업 전후 230개 mapping.coordinates와 mapping.world 전체 동일. 매핑 export `--check` 변경 없음. |

테이블에서 일어날 때는 기존 구현대로 서버 물리 객체가 멈춰 있던 착석 직전 접근 위치로 복귀한다. 화면상의 의자 좌표와 복귀 후 접지·보간 위치를 혼동하지 않고, 좌석 좌표는 정확히 대조하고 복귀 후에는 근처 위치와 실제 이동 재개를 확인했다.

새 물리 계약 버전은 `499ed613a718bda6af61ef9e38dd2f6f185baa4a1782cb5c27b0b9a4b404e265`이다. 에셋 좌표 이동이 아니라 출발 접지 계약과 export 소스 해시 반영으로 변경됐다. FE와 BE가 같은 버전을 확인했다. 기존 V169를 새 전용 로컬 DB에 적용했으며 새 migration을 만들거나 적용된 파일을 수정하지 않았다.

## 검수 범위와 남은 연결

점프맵의 MySQL 검사는 착지 관측을 서버 tracker/service 경계에 주입한다. 인증·HTTP·WS·판정·DB 원장·지갑·중복 방지는 실제 구현을 사용하지만, 브라우저 캐릭터로 1~10단계 전체를 물리 주행한 검사로 해석하지 않는다. 다른 게임 전체의 실제 경기 및 재접속까지 모두 검사한 결과도 아니다.

현재 로컬 프로필에서 알림, 행사 당첨 내역, 공원 통합 랭킹 API는 503을 반환한다. 해당 저장소·행사·랭킹 집계 설정은 별도 연결 검수가 필요하다. 이번 테이블·점프맵 정산 검사의 성공과 구분한다. 최종 브라우저 검사에서 pageerror와 Vite 오류 overlay는 0이었다. 착석 직전 이동 요청 한 건의 `TABLE_BUSY` 거절은 기존 처리기가 흡수하며 경기 입력을 차단하지 않았다.

증거는 저장소 밖 `C:/Users/SSAFY/Desktop/OnTop/local-park-revisions/20261110-live-integration`에 보존했다. 주요 파일은 `table-live-report.json`, `table-live.log`, `db-final-proof.txt`, `mysql-rewards-final.log`, `native-regression.log`, `recovery-tests-final.log`, `mapping-final-check.log`이다. 이 폴더의 `connection.json`과 `sessions.json`은 비공개 로컬 인증 자료이므로 커밋·공유하지 않는다.
