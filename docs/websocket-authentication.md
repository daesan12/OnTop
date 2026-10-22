# 웹소켓 인증 연결부

OAuth 로그인과 Access 발급 및 [Spring Security REST 인증](rest-authentication.md)은 구현되어 있다.
WebSocket은 **인증 전달 방식 미정, 연결부 준비 단계**다. 이번 REST 인증을 핸드셰이크에 자동 적용하지 않는다.
공통 `AccessAuthenticationService`/`AuthenticatedUser`의 재사용 계약과 후속 담당 범위는 위 문서를 참고한다.
[Jira #25](https://ssafy.atlassian.net/browse/S15P31B105-25)는 실제 WebSocket 인증 연결 전까지 진행 중으로 관리한다.

| 파일 | 하는 일 |
| --- | --- |
| `WebSocketUserResolver` | 인증 담당이 서버 Principal을 검증하고 내부 계정으로 바꾸는 연결점 |
| `VerifiedWebSocketUser` | 검증이 끝난 내부 사용자 ID와 로그인 제공자(NAVER·SSAFY) |
| `TableHandshakeInterceptor` | 연결 전에 검증기를 호출하고 인증 실패를 차단 |

## 동작

기본 `local` 실행은 기존 `dev-UUID` 검증 모드다. `--ontop.websocket.authenticated=true`로 인증 연결 모드를 켠다. 이 모드도 현재는 local에서만 활성화된다.

1. 인증 담당의 HTTP 인증 코드가 서버 Principal을 만든다. JWT·세션 등 전달 방식은 아직 정하지 않았다.
2. 담당 코드가 `WebSocketUserResolver` Bean을 제공한다. 로그인 유효성·계정 상태·제공자를 확인하고 **외부 제공자 ID를 양수 내부 계정 ID로 매핑**해 반환한다. 일반 Principal의 이름 자체를 내부 ID로 사용하지 않는다.
3. 연결부가 검증된 사용자만 웹소켓 속성에 보관하고, Hub가 그 ID를 사용자·좌석에 사용한다. 요청 JSON·쿼리·임의 헤더의 userId는 인증 수단이 아니다.

| 상황 | 처리 |
| --- | --- |
| 검증기 Bean 없음·검증기 오류 | HTTP 503, 웹소켓 연결 차단 |
| Principal 없음·검증 결과 없음 | HTTP 401, 연결 차단 |
| 기본 개발 모드 | 기존 dev 사용자 생성. 인증 연결 성공으로 간주하지 않음 |
| 동일 내부 계정의 추가 연결·결과 대기로 보존 중인 좌석 | 기존 연결·좌석 유지, 새 연결만 WebSocket 1008 종료 |
| 인증 연결 + start-rehearsal 동시 활성화 | 앱 설정 오류. dev 사용자 전용 시작 대역에 실제 계정을 넣지 않음 |

동일 출처 제한은 유지한다. 브라우저 WebSocket에 임의 Authorization 헤더를 넣는 방식을 가정하거나 URL에 토큰을 붙이지 않는다. 운영 핸드셰이크에서 토큰·쿠키를 전달하는 방식과 갱신·로그아웃 시 연결 해제는 후속 작업이다.

사용자가 **기존 연결 유지·새 연결 거절**을 확정했다. 끊긴 뒤 같은 계정의 경기 복귀는 [30초 재접속 연결부](game-reconnect.md)를 따른다. 실제 경기 담당이 최신 상태를 제공해야 하며 기본 dev 모드의 대기 좌석은 복구하지 않는다. 개발용 시작 검증의 결과 미확정·검증 완료 좌석은 기존처럼 보존하며 실제 경기로 취급하지 않는다.

## 검증 범위

`AuthenticatedWebSocketTests`의 HTTP 필터·X-Test-Login 헤더는 **테스트 소스에만 있는 서버 인증 대역**이다. 실제 계정 로그인이나 토큰 서명 검증을 대신하지 않는다. 운영 소스에는 해당 헤더를 읽는 코드가 없다. 실제 인증 코드가 준비되면 같은 인터페이스에 연결하고 만료·탈퇴·로그아웃·배포 환경을 다시 통합 검증해야 한다.

참고: [OnTop 통합 기획서 v0.4](https://app.notion.com/p/OnTop_-_-154161842b868387b6ad0174db68ee71)의 정식 네이버·SSAFY 로그인 기준, [Spring 6.2 WebSocket handshake](https://docs.spring.io/spring-framework/reference/6.2/web/websocket/server.html).
