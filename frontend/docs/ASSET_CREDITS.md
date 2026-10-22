# 이관 에셋 출처

기존 프로토타입에서 실제 사용하는 런타임 자료만 frontend/public/art로 옮겼다. 원본·편집용 .blend·생성 중간물·이전 로그인 이미지·게임판/설명서 일괄 자료는 배포에 넣지 않았다.

| 자료 | 출처·기록 |
|---|---|
| 남녀 기본 캐릭터 | 사용자가 제공한 Tripo/Mixamo 리그 원본을 기존 파이프라인에서 49본·근/원거리·Meshopt·WebP로 처리한 GLB. characters/manifest.json과 rig JSON에 원본/배포 지문·범위 기록. 새로운 라이선스 취득을 주장하지 않음 |
| 빨간 우체통 | 사용자 제공 GLB의 기존 최적화본. mailbox/manifest.json |
| 붕어빵 카트 | 사용자 제공 Tripo GLB의 기존 처리본. props/manifest.json. 게임/보상 기능은 포함하지 않음 |
| 목재 의자 | 기존 Tripo 네 의자 모델의 같은 의자 island를 추출. props/wood-chair.manifest.json에 원본 해시, 4,351→1,128삼각형(전체 원본→실사용 의자), 2,762,892→709,224 bytes 기록. 다른 새 모델을 생성하지 않음 |
| 환경 재질 | Poly Haven의 기존 CC0 자료를 가공한 WebP. materials/manifest.json의 원본·배포 메타데이터 보존. bark는 현재 장면에서 쓰지 않아 제외 |
| 포장·잎·절차 형상 | 기존 프로젝트 제작/가공 자료. 정적 형상은 시설/구역별 배칭과 반복 인스턴싱을 유지 |
| 광고 이미지/영상 | 사용자가 기존 프로젝트에 제공한 편성 자료. advertisements/manifest.json과 광고 레지스트리 참조. 운영 광고 업로드/검수 기능을 포함하지 않음 |
| 기존 UI 이미지/폰트 | 팀원 dev의 assets를 수정하지 않음 |

환경 재질 원문: [Poly Haven 라이선스](https://polyhaven.com/license), [Wood Table 001](https://polyhaven.com/a/wood_table_001) (Dimitrios Savva / Rico Cilliers), [Rock Boulder Dry](https://polyhaven.com/a/rock_boulder_dry) (Dimitrios Savva / Rico Cilliers), [Leafy Grass](https://polyhaven.com/a/leafy_grass) (Charlotte Baglioni). 브라우저는 이 외부 사이트에 접속하지 않고 로컬 배포 파일을 사용한다.

의자 재생성:

```sh
node scripts/prepare-wood-chair.mjs <보관한-original-model.glb>
```

원본은 SHA-256 `4ff2da30b8cb6e531932404b06a11c3cd42756a65b60763e68735ebb1b7cd299`인 기존 모델을 사용한다. Node 24와 잠금 파일의 sharp/meshoptimizer가 필요하다. 형상 Meshopt encode/decode 바이트 일치를 검사한다. RGB 2048, ORM/normal 최대 1024의 WebP는 손실 압축이며 KTX2 GPU 압축이 아니다. 매니페스트와 시각/성능 검증을 함께 갱신한다.
