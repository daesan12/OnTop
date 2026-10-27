# 현재 맵 테이블 매핑 (frontend-test)

맵 버전: `ae833248d2dd356c6603af72b2b865f9051a866e9cfa7d2b9c9abe890579944d`

좌표는 테이블 중심·m·Y-up이며 관전은 XZ 거리 20m 경계를 포함합니다. 캐릭터 캡슐 중심 좌표가 아닙니다.

| channelId | tableId | anchorId | X | Y | Z | 관전 반경 |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| channel-1 | table-6fcc18fe-a301-3142-a69f-f3f67d026d62 | table-1 | -10 | 0 | 18 | 20m |
| channel-1 | table-69d1811f-c44e-32d4-bf72-1f4ebe5fb0dd | table-2 | 10 | 0 | 18 | 20m |
| channel-1 | table-4bd07782-81d2-3167-8a89-d3c5f098c85f | table-3 | -10 | 0 | 29 | 20m |
| channel-1 | table-02f59768-b9db-33ac-9e81-279a6415dbf5 | table-4 | 10 | 0 | 29 | 20m |
| channel-1 | table-1c9a4129-45a5-3a92-a9a9-cfc0888ee3f3 | table-5 | 0 | 2 | 6 | 20m |
| channel-1 | table-8911085d-a27b-3fcb-b06b-424c94625b4b | table-6 | -18 | 0.72 | 4 | 20m |
| channel-1 | table-00ef6fc9-740d-33b5-ae0f-196bc0c65670 | table-7 | 18 | 0.72 | 4 | 20m |
| channel-1 | table-e8a08ea4-1f15-3946-bfb6-e51917a8a80e | table-8 | -18 | 0.72 | -15 | 20m |
| channel-1 | table-fb39af0d-8333-3ee6-a172-3497aa0d5829 | table-9 | 18 | 0.72 | -15 | 20m |
| channel-1 | table-0dd233c0-6c82-3ab4-ba27-20db3b664c76 | table-10 | -18 | 0.72 | -34 | 20m |
| channel-1 | table-09b68a7e-cc97-37c7-8763-5bb0dfe07b29 | table-11 | 18 | 0.72 | -34 | 20m |
| channel-1 | table-55933303-e0e3-303a-a404-aa43731af0e4 | table-12 | -23 | 0.72 | 28 | 20m |
| channel-1 | table-f8389ad7-710f-3cc3-99ba-c776803dd9a9 | table-13 | 23 | 0.72 | 28 | 20m |
| channel-1 | table-1de6ff51-63a8-3c12-8696-b400eb40ba22 | table-14 | -56 | 0 | 57 | 20m |
| channel-1 | table-500f917b-ae10-335b-9874-2a232af9011e | table-15 | -23 | 0 | -62 | 20m |
| channel-1 | table-ec222417-d623-3346-9b49-5ace809af808 | table-16 | 24 | 0 | 61 | 20m |
| channel-2 | table-c07ae818-2248-3150-8970-820b5529dfb7 | table-1 | -10 | 0 | 18 | 20m |
| channel-2 | table-ce87bea5-89c6-3892-b08e-489bcbef8533 | table-2 | 10 | 0 | 18 | 20m |
| channel-2 | table-2a0c0205-0728-3765-a600-c63b996238f4 | table-3 | -10 | 0 | 29 | 20m |
| channel-2 | table-ddbb683d-dd0c-3f41-b516-a53d4e32153c | table-4 | 10 | 0 | 29 | 20m |
| channel-2 | table-eacdea48-d47d-31fa-81a4-031ed32f2e1f | table-5 | 0 | 2 | 6 | 20m |
| channel-2 | table-1a5568e8-3141-3ed6-8dcc-72f1cb5ab802 | table-6 | -18 | 0.72 | 4 | 20m |
| channel-2 | table-76f2af13-e177-36bd-b3b2-ee84c9238a55 | table-7 | 18 | 0.72 | 4 | 20m |
| channel-2 | table-38752f48-42d2-3c0b-9f71-7f4a1304f223 | table-8 | -18 | 0.72 | -15 | 20m |
| channel-2 | table-01f32b02-1111-3f2a-943a-1a7ffe8d4121 | table-9 | 18 | 0.72 | -15 | 20m |
| channel-2 | table-f46b4282-cd06-393d-bea6-1d255fe351d5 | table-10 | -18 | 0.72 | -34 | 20m |
| channel-2 | table-a89a0172-c6f9-3266-90a1-1f4e8fa3d8fc | table-11 | 18 | 0.72 | -34 | 20m |
| channel-2 | table-f82b633c-6fee-368a-9169-a650a4cc4f4e | table-12 | -23 | 0.72 | 28 | 20m |
| channel-2 | table-48a7e6a6-3774-3f5f-aa31-524a75db6e57 | table-13 | 23 | 0.72 | 28 | 20m |
| channel-2 | table-5d530e59-139d-3d0a-bbed-d8919b876b48 | table-14 | -56 | 0 | 57 | 20m |
| channel-2 | table-cffec990-e694-3a98-bf7d-354f38a61af4 | table-15 | -23 | 0 | -62 | 20m |
| channel-2 | table-1cad2fd9-6eee-3423-8e53-828ca67891df | table-16 | 24 | 0 | 61 | 20m |

FE는 JSON의 bindings 배열을 기존 tableBindings 입력으로 사용합니다. UUID나 조회 순서로 anchorId를 추측하지 않습니다.
이 파일은 등록·좌표 계약이며 실제 배포 완료나 DB 예약·정산 성공을 뜻하지 않습니다.
