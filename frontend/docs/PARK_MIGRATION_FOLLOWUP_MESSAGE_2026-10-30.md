# BE 전달 문구

> 최신 채팅 문구는 [PARK_BACKEND_CONNECTION_MESSAGE_2026-10-30.md](PARK_BACKEND_CONNECTION_MESSAGE_2026-10-30.md)를 사용한다. 아래는 이전 전달 기록이다.

최신 dev의 새 공원과 점프맵 서비스 기능을 유지하면서 FE 누락 요소·밤 밝기·가로등 위치를 보완했습니다. BE 코드는 변경하지 않았습니다.

첨부 요청서 기준으로 새 server-map.json/manifest.json을 로딩하고, 가구·분수 올라타기 금지와 팔각정 바닥의 jumpSpeed=7.8을 서버 이동·클라이언트 위치 검증에도 동일하게 연결 부탁드립니다. 기존 18개 테이블/좌석 ID·매핑·WORLD_MAP_CONFIRM은 유지해 주세요.

최종 맵 버전: `f79fb6c1861c791f80c28dc813c3ab2264822060e2bec6204655261fc12b7748`. 점프맵 데이터는 최신 dev의 docs/jumpmap/course.generated.json·체크섬으로 통일했습니다. 기존 점프맵 요청 규격을 그대로 사용하면 됩니다.

현재 Java에는 신규 no-climb/팔각정 점프 정책이 연결되지 않아 FE 단독 배포 시 위치 보정 충돌이 생길 수 있습니다. BE 반영 후 같은 JSON으로 함께 검증한 다음 머지·전환하려고 합니다.

요청서: frontend/docs/PARK_MIGRATION_FOLLOWUP_REQUEST_2026-10-30.md

실제 서버 공동 검증 완료 여부와 적용할 확정 커밋을 알려주세요.
