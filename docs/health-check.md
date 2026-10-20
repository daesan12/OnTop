# 인프라 헬스체크

| 항목 | 값 |
| --- | --- |
| 요청 | `GET /actuator/health` |
| 포트 | 애플리케이션 HTTP 포트와 동일 (기본 8080) |
| 인증 | 현재 인증 없이 조회 가능 |
| 정상 | HTTP `200`, `{"status":"UP"}` |
| 이상 감지 | HTTP `503`, `{"status":"DOWN"}` 또는 `{"status":"OUT_OF_SERVICE"}` |

인프라의 헬스체크 경로를 `/actuator/health`, 정상 HTTP 코드를 `200`으로 설정한다. 아직 배포·로드밸런서 설정은 적용하지 않았다.

Spring Boot Actuator를 사용하며 모든 프로필에 적용한다. 현재 서버 HTTP 응답과 기본 디스크 공간 상태를 확인한다. 내부 구성·상세 정보는 숨기고 HTTP 관리 API는 health만 노출한다. 서버가 꺼져 있거나 요청이 멈추면 응답 자체가 없으므로 인프라에서도 요청 제한 시간을 설정해야 한다.

현재 DB·Redis·실제 로그인·경기 엔진은 연결되지 않았다. `UP`은 해당 기능이나 WebSocket 전체 흐름의 성공을 뜻하지 않는다. DB·Redis 연결 시 필요한 상태 검사를 대조하고, Kubernetes 등을 사용한다면 생존 확인(liveness)과 요청 수신 준비(readiness)를 구분한다. 외부 DB 장애를 재시작 조건으로 바로 사용하지 않는다.

`local` 프로필은 `127.0.0.1`에만 바인딩한다. 다른 컨테이너·호스트에서 확인하려면 배포 설정의 바인딩·포트·프록시 경로를 맞춰야 한다. 이번 작업에서 local 바인딩은 변경하지 않았다. 추후 Spring Security를 추가할 때도 인프라 헬스체크의 접근 허용을 유지해야 한다.

[Spring Boot 3.5 공식 문서](https://docs.spring.io/spring-boot/3.5/reference/actuator/endpoints.html)

## WebSocket 운영 지표

`local`의 현재 WebSocket 서버는 기존 Actuator의 `MeterRegistry`에 다음 숫자를 등록한다. 게임 규칙이나 클라이언트 API를 추가한 기능이 아니다.

| 이름 | 종류 | 의미 |
| --- | --- | --- |
| `ontop.websocket.connections.active` | Gauge | 현재 Hub에 등록된 연결 수. 연결 정리 시 감소 |
| `ontop.websocket.connections.accepted` | FunctionCounter | Hub 생성 이후 수락·등록한 연결 누적 수 |
| `ontop.websocket.connections.closed` | FunctionCounter | 등록된 연결을 정리한 누적 수. 앱 종료 정리도 포함 |
| `ontop.websocket.messages.received` | FunctionCounter | 현재 등록된 연결에서 받은 텍스트 메시지 누적 수. 형식 오류·업무 거절 요청도 포함 |
| `ontop.websocket.messages.sent` | FunctionCounter | `sendMessage`가 예외 없이 반환한 텍스트 메시지 누적 수 |
| `ontop.websocket.bytes.sent` | FunctionCounter(bytes) | 위 송신의 UTF-8 텍스트 payload 누적 바이트 |

현재 수인 Gauge와 달리 누적 수는 실행 중 감소하지 않는다. 정상 종료·송신 실패·heartbeat·큐 초과는 기존 Hub 정리 경로에서 한 번만 계수한다. 이미 제거된 연결의 반복 종료/뒤늦은 텍스트는 추가로 세지 않는다. 인증 실패나 같은 계정 추가 연결 거절은 등록된 연결 수에 포함하지 않는다. Ping/Pong·서버 송신 메시지·텍스트의 바이트 수는 수신 메시지 수가 아니다.

송신량은 큐에 넣은 양이 아니라 전송 메서드가 반환한 뒤 계수한다. 전송 중·예외 발생·폐기된 대기열·종료 후 offer는 포함하지 않는다. 종료 요청 뒤 늦게 정상 반환한 송신은 한 번 포함할 수 있다. 이는 서버 송신 API의 완료 수이며 **클라이언트 수신·화면 반영 ACK가 아니다.** Ping/Pong·Close 프레임과 WebSocket/TCP/TLS 헤더는 바이트 수에 포함하지 않는다. 같은 JSON을 두 연결에 보냈다면 두 번 센다. 예: `A`는1, `가😀`는7 UTF-8바이트다.

송신 스레드는 LongAdder에 숫자만 더하며 Hub 상태 잠금·DB 조회를 하지 않는다. 메시지 수와 바이트 수는 실행 중 각각 읽는 누적 지표이므로 한 번의 원자적인 쌍으로 취급하지 않는다. 계수만 준비한 것이며 전송량 전후 비교·AOI 적용·성능 개선 측정은 별도 작업이다.

숫자는 현재 프로세스의 해당 Hub 기준이며 재시작하면 초기화된다. 사용자/채널/경기 ID·본문·로그인 제공자 태그는 추가하지 않는다. `TableWebSocketMetrics`가 MeterBinder로 자동 등록하며, 외부 exporter와 수집 주기·대시보드는 인프라 연동 시 구성한다. 이 계수만으로 최대 동접·처리량·지연·정산 정상 여부를 판단하지 않는다.

현재 HTTP 노출은 기존처럼 **health만**이다. `/actuator/metrics`를 켜거나 외부 수집기를 설치·배포하지 않았다. 확인은 내부 MeterRegistry와 `TableWebSocketMetricsTests`·송신 경계 `TablePeerTransmissionTests`·실제 소켓 `TableWebSocketMetricsWebSocketTests`로 수행한다. 정식 배포 프로필에 개발 Hub가 생겼다는 의미도 아니다.

[Micrometer Gauge·Counter 안내](https://docs.micrometer.io/micrometer/reference/concepts/counters.html)
