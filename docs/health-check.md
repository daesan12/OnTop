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
